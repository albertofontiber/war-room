/**
 * validate-webs-strict.ts — Strict validation: fetch every URL and verify content
 *
 * For each validated web, fetches the page and checks if the company name
 * or meaningful keywords appear in the page content (title, meta, body text).
 *
 * Usage: npx tsx scripts/validate-webs-strict.ts
 */

import * as fs from "fs";

interface Found { id: number; nombre: string; web: string; }

const SUFFIXES = /,?\s*\b(S\.?L\.?U?\.?|S\.?A\.?U?\.?|S\.?C\.?P?\.?|C\.?B\.?|S\.?L\.?L\.?|SOCIEDAD LIMITADA|SOCIEDAD ANONIMA)\b\.?\s*$/gi;
const NOISE = /[.,\-()'"\/\\&+!¡¿?#@:;]/g;

function getKeywords(nombre: string): string[] {
  const norm = nombre
    .toUpperCase()
    .replace(SUFFIXES, "")
    .replace(SUFFIXES, "")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stopwords = new Set([
    "DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E", "EN", "CONTRA", "PARA", "POR",
    "SISTEMAS", "INSTALACIONES", "INSTAL·LACIONS", "SEGURIDAD", "SEGURETAT", "SECURITY",
    "INCENDIOS", "INCENDIS", "PROTECCION", "PROTECTION", "MANTENIMIENTO", "MANTENIMIENTOS",
    "INTEGRAL", "INTEGRALES", "TECNICAS", "TECNICA", "TECNICOS", "TECNICO",
    "SERVICIOS", "SERVEIS", "SOLUCIONES", "PROYECTOS", "INGENIERIA",
    "FIRE", "ALARMAS", "ELECTRONICA", "ELECTRÓNICA", "ELECTRICA",
    "NORTE", "SUR", "ESTE", "OESTE", "CENTRAL",
    "GENERAL", "NACIONAL", "COMERCIAL",
    "ACTIVIDADES", "APLICACIONES", "DESARROLLO",
    "JUAN", "JOSE", "MARIA", "FRANCISCO", "ANTONIO", "MANUEL", "DAVID", "DANIEL",
    "CARLOS", "MIGUEL", "PEDRO", "PABLO", "JESUS", "RAFAEL", "ALEJANDRO", "FERNANDO",
    "GARCIA", "MARTINEZ", "LOPEZ", "SANCHEZ", "GONZALEZ", "RODRIGUEZ", "FERNANDEZ",
    "PEREZ", "MARTIN", "GOMEZ", "RUIZ", "DIAZ", "HERNANDEZ", "MORENO", "MUÑOZ",
    "ALVAREZ", "ROMERO", "ALONSO", "NAVARRO", "TORRES", "DOMINGUEZ", "GIL", "VAZQUEZ",
    "RAMOS", "SERRANO", "BLANCO", "MOLINA", "MORALES", "SUAREZ", "ORTEGA", "DELGADO",
    "CASTRO", "MARIN", "JIMENEZ",
  ]);

  return norm
    .split(" ")
    .filter((w) => w.length > 3 && !stopwords.has(w));
}

async function fetchPageContent(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
    const desc = descMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 3000);

    return `${title} ${desc} ${bodyText}`.toUpperCase();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function main() {
  const data: Found[] = JSON.parse(fs.readFileSync("scripts/webs-validated.json", "utf-8"));
  console.log(`🔍 Validación estricta de ${data.length} URLs...\n`);

  const confirmed: Found[] = [];
  const rejected: Array<Found & { reason: string }> = [];
  let checked = 0;

  const BATCH = 10;
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (entry) => {
        const keywords = getKeywords(entry.nombre);

        // If no meaningful keywords, skip (can't validate)
        if (keywords.length === 0) {
          rejected.push({ ...entry, reason: "no meaningful keywords to validate" });
          checked++;
          return;
        }

        const content = await fetchPageContent(entry.web);
        if (!content) {
          rejected.push({ ...entry, reason: "unreachable" });
          checked++;
          return;
        }

        // Check if at least one keyword with length > 4 appears in content
        const matchedKeywords = keywords.filter((kw) => kw.length > 4 && content.includes(kw));

        // Also check domain relevance
        const url = new URL(entry.web.startsWith("http") ? entry.web : `https://${entry.web}`);
        const domain = url.hostname.replace("www.", "").split(".")[0].toUpperCase();
        const domainMatchesKeyword = keywords.some(
          (kw) => domain.includes(kw) || kw.includes(domain)
        );

        if (matchedKeywords.length > 0 || (domainMatchesKeyword && content.length > 100)) {
          confirmed.push(entry);
        } else {
          rejected.push({
            ...entry,
            reason: `no keyword match. Keywords: [${keywords.join(",")}], domain: ${domain}`,
          });
        }

        checked++;
        if (checked % 50 === 0) {
          console.log(`   [${checked}/${data.length}] confirmed: ${confirmed.length}, rejected: ${rejected.length}`);
        }
      })
    );
  }

  console.log(`\n✅ Validación estricta completada:`);
  console.log(`   Confirmed: ${confirmed.length}`);
  console.log(`   Rejected: ${rejected.length}`);

  fs.writeFileSync("scripts/webs-confirmed.json", JSON.stringify(confirmed, null, 2));
  fs.writeFileSync("scripts/webs-strict-rejected.json", JSON.stringify(rejected, null, 2));

  // IDs to remove from DB
  const rejectIds = rejected.map((r) => r.id);
  fs.writeFileSync("scripts/webs-reject-ids.json", JSON.stringify(rejectIds));

  console.log(`\n   Muestra de confirmadas:`);
  confirmed.slice(0, 10).forEach((r) => console.log(`   ✓ ${r.nombre} → ${r.web}`));
  console.log(`\n   Muestra de rechazadas:`);
  rejected.slice(0, 15).forEach((r) => console.log(`   ✗ ${r.nombre} → ${r.web} (${r.reason})`));
}

main().catch(console.error);
