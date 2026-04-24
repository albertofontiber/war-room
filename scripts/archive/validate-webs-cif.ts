/**
 * validate-webs-cif.ts — Validate URLs by checking CIF or company name in page content
 *
 * For each candidate URL, fetches the main page + /aviso-legal + /legal + /politica-privacidad
 * and checks if the CIF or a normalized company name appears in the content.
 *
 * Usage: npx tsx scripts/validate-webs-cif.ts
 */

import * as fs from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Candidate { id: number; nombre: string; web: string; }
interface EmpresaData { id: number; nombre: string; cif: string; web: string; }

const SUFFIXES = /,?\s*\b(S\.?L\.?U?\.?|S\.?A\.?U?\.?|S\.?C\.?P?\.?|C\.?B\.?|S\.?L\.?L\.?|SOCIEDAD LIMITADA|SOCIEDAD ANONIMA)\b\.?\s*$/gi;

function normalizeName(nombre: string): string {
  return nombre
    .toUpperCase()
    .replace(SUFFIXES, "")
    .replace(SUFFIXES, "")
    .replace(/[.,\-()'"\/\\&+!¡¿?#@:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Get the "core" name — first significant word(s) that identify the company
function getCoreWords(nombre: string): string[] {
  const norm = normalizeName(nombre);
  const stopwords = new Set([
    "DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E", "EN", "CONTRA", "PARA", "POR",
    "SISTEMAS", "INSTALACIONES", "SEGURIDAD", "SEGURETAT", "SECURITY",
    "INCENDIOS", "PROTECCION", "MANTENIMIENTO", "INTEGRAL", "INTEGRALES",
    "TECNICAS", "TECNICA", "SERVICIOS", "SOLUCIONES", "PROYECTOS", "INGENIERIA",
    "FIRE", "ALARMAS", "ELECTRONICA", "ELECTRICA", "GENERAL", "NACIONAL", "COMERCIAL",
    "NORTE", "SUR", "ESTE", "OESTE", "CENTRAL", "GROUP", "GRUPO",
  ]);

  return norm.split(" ").filter((w) => w.length > 3 && !stopwords.has(w));
}

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    // Strip scripts/styles, get text
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .toUpperCase();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function validateEntry(entry: EmpresaData): Promise<{ valid: boolean; matchType?: string }> {
  const baseUrl = entry.web.startsWith("http") ? entry.web : `https://${entry.web}`;
  const base = baseUrl.replace(/\/+$/, "");

  // Pages to check
  const pages = [
    base,
    `${base}/aviso-legal`,
    `${base}/legal`,
    `${base}/politica-privacidad`,
    `${base}/politica-de-privacidad`,
    `${base}/quienes-somos`,
    `${base}/sobre-nosotros`,
    `${base}/contacto`,
  ];

  const cifClean = entry.cif.toUpperCase().trim();
  // Also try CIF with dash format (B-12345678)
  const cifDash = cifClean.length === 9 ? `${cifClean[0]}-${cifClean.slice(1)}` : null;
  const coreWords = getCoreWords(entry.nombre);
  const fullNorm = normalizeName(entry.nombre);

  for (const pageUrl of pages) {
    const content = await fetchPage(pageUrl);
    if (!content) continue;

    // Check 1: CIF appears in content (strongest signal)
    if (content.includes(cifClean) || (cifDash && content.includes(cifDash))) {
      return { valid: true, matchType: "cif" };
    }

    // Check 2: Full normalized name appears
    if (content.includes(fullNorm)) {
      return { valid: true, matchType: "full_name" };
    }

    // Check 3: At least 2 core words (>4 chars each) appear in content
    if (coreWords.length >= 2) {
      const matched = coreWords.filter((w) => w.length > 4 && content.includes(w));
      if (matched.length >= 2) {
        return { valid: true, matchType: `core_words: ${matched.join(",")}` };
      }
    }

    // Check 4: Single distinctive core word (>6 chars) appears
    const distinctive = coreWords.filter((w) => w.length > 6);
    if (distinctive.some((w) => content.includes(w))) {
      return { valid: true, matchType: `distinctive: ${distinctive.find((w) => content.includes(w))}` };
    }
  }

  return { valid: false };
}

async function main() {
  // Load candidates from Phase 1
  const candidates: Candidate[] = JSON.parse(fs.readFileSync("scripts/webs-found.json", "utf-8"));

  // Get CIFs from DB
  const ids = candidates.map((c) => c.id);
  const empresas = await prisma.empresa.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true, cif: true },
  });
  const cifMap = new Map(empresas.map((e) => [e.id, e.cif]));

  const entries: EmpresaData[] = candidates.map((c) => ({
    ...c,
    cif: cifMap.get(c.id) ?? "",
  }));

  console.log(`🔍 Validación estricta (CIF/nombre) de ${entries.length} URLs...\n`);

  const confirmed: Array<EmpresaData & { matchType: string }> = [];
  const rejected: Array<EmpresaData & { reason: string }> = [];
  let checked = 0;

  const BATCH = 8; // Conservative to avoid rate limiting
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (entry) => {
        if (!entry.cif) {
          rejected.push({ ...entry, reason: "no CIF in DB" });
          checked++;
          return;
        }

        const result = await validateEntry(entry);
        if (result.valid) {
          confirmed.push({ ...entry, matchType: result.matchType! });
        } else {
          rejected.push({ ...entry, reason: "CIF/name not found in any page" });
        }

        checked++;
        if (checked % 50 === 0) {
          console.log(`   [${checked}/${entries.length}] confirmed: ${confirmed.length}, rejected: ${rejected.length}`);
        }
      })
    );
  }

  console.log(`\n✅ Validación CIF completada:`);
  console.log(`   Confirmed: ${confirmed.length}`);
  console.log(`   Rejected: ${rejected.length}`);

  // Stats by match type
  const byType: Record<string, number> = {};
  for (const c of confirmed) {
    const type = c.matchType.split(":")[0].trim();
    byType[type] = (byType[type] ?? 0) + 1;
  }
  console.log(`\n   Match types:`, byType);

  fs.writeFileSync("scripts/webs-cif-confirmed.json", JSON.stringify(confirmed, null, 2));
  fs.writeFileSync("scripts/webs-cif-rejected.json", JSON.stringify(rejected, null, 2));

  console.log(`\n   Muestra de confirmadas:`);
  confirmed.slice(0, 10).forEach((r) =>
    console.log(`   ✓ [${r.matchType}] ${r.nombre} (${r.cif}) → ${r.web}`)
  );
  console.log(`\n   Muestra de rechazadas:`);
  rejected.slice(0, 10).forEach((r) =>
    console.log(`   ✗ ${r.nombre} → ${r.web}`)
  );

  await prisma.$disconnect();
}

main().catch(console.error);
