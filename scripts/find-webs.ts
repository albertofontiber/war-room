/**
 * find-webs.ts — Phase 1: Heuristic URL discovery for companies without web
 *
 * Generates probable URLs from company names and checks which ones respond.
 * Outputs a JSON file with { id, nombre, web } for matched companies.
 *
 * Usage: npx dotenv-cli -e .env.local -- npx tsx scripts/find-webs.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Common suffixes to strip from company names
const SUFFIXES = /,?\s*\b(S\.?L\.?U?\.?|S\.?A\.?U?\.?|S\.?C\.?|C\.?B\.?|S\.?L\.?L\.?|SOCIEDAD LIMITADA|SOCIEDAD ANONIMA)\b\.?\s*$/i;
const NOISE = /[.,\-()'"\/\\&+!¡¿?#@]/g;

function generateCandidateUrls(nombre: string): string[] {
  // Clean name
  let clean = nombre
    .replace(SUFFIXES, "")
    .replace(SUFFIXES, "") // twice for nested
    .trim()
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // Remove common words
  clean = clean
    .replace(/\b(de|del|la|las|los|el|y|e|en|contra|para|por)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = clean.split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const candidates: string[] = [];

  // Strategy 1: All words joined
  const joined = words.join("");
  candidates.push(`${joined}.com`, `${joined}.es`);

  // Strategy 2: First word only (if >4 chars)
  if (words[0].length > 4) {
    candidates.push(`${words[0]}.com`, `${words[0]}.es`);
  }

  // Strategy 3: First two words joined
  if (words.length >= 2) {
    const two = words.slice(0, 2).join("");
    candidates.push(`${two}.com`, `${two}.es`);
  }

  // Strategy 4: Initials + last meaningful word
  if (words.length >= 3) {
    const initials = words.map(w => w[0]).join("");
    candidates.push(`${initials}.com`, `${initials}.es`);
  }

  // Strategy 5: Common patterns for PCI/security companies
  const securityWords = ["seguridad", "seguretat", "security", "incendios", "incendis", "pci", "extintores", "extincion", "fuego"];
  const hasSecWord = words.some(w => securityWords.includes(w));
  if (hasSecWord && words.length >= 2) {
    // Try without the security word
    const nonSec = words.filter(w => !securityWords.includes(w)).join("");
    if (nonSec.length > 3) {
      candidates.push(`${nonSec}seguridad.com`, `${nonSec}seguridad.es`);
      candidates.push(`${nonSec}pci.com`, `${nonSec}pci.es`);
      candidates.push(`${nonSec}.com`, `${nonSec}.es`);
    }
  }

  // Dedupe
  return [...new Set(candidates)];
}

async function checkUrl(url: string): Promise<{ ok: boolean; finalUrl?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(fullUrl, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    // Check it's not a parked domain / error page
    if (res.ok || res.status === 301 || res.status === 302 || res.status === 403) {
      return { ok: true, finalUrl: res.url || fullUrl };
    }
    return { ok: false };
  } catch {
    clearTimeout(timeout);
    return { ok: false };
  }
}

async function main() {
  const empresas = await prisma.empresa.findMany({
    where: { enPerimetro: true, web: null },
    select: { id: true, nombre: true, cif: true },
    orderBy: { nombre: "asc" },
  });

  console.log(`🔍 Buscando webs para ${empresas.length} empresas en perímetro sin web...`);
  console.log(`   Generando URLs candidatas...\n`);

  const results: Array<{ id: number; nombre: string; web: string }> = [];
  const notFound: Array<{ id: number; nombre: string; cif: string }> = [];
  let checked = 0;

  // Process in batches of 20 concurrent
  const BATCH = 20;
  for (let i = 0; i < empresas.length; i += BATCH) {
    const batch = empresas.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (emp) => {
        const candidates = generateCandidateUrls(emp.nombre);
        let found = false;

        for (const url of candidates) {
          const result = await checkUrl(url);
          if (result.ok && result.finalUrl) {
            // Verify it's not a generic parked domain by checking content-type
            results.push({ id: emp.id, nombre: emp.nombre, web: result.finalUrl });
            found = true;
            break;
          }
        }

        if (!found) {
          notFound.push({ id: emp.id, nombre: emp.nombre, cif: emp.cif });
        }

        checked++;
        if (checked % 50 === 0) {
          console.log(`   [${checked}/${empresas.length}] encontradas: ${results.length}`);
        }
      })
    );
  }

  console.log(`\n✅ Fase 1 completada:`);
  console.log(`   Total empresas: ${empresas.length}`);
  console.log(`   Webs encontradas: ${results.length}`);
  console.log(`   Sin web: ${notFound.length}`);

  // Save results
  const fs = await import("fs");
  fs.writeFileSync("scripts/webs-found.json", JSON.stringify(results, null, 2));
  fs.writeFileSync("scripts/webs-not-found.json", JSON.stringify(notFound, null, 2));

  console.log(`\n   Resultados guardados en:`);
  console.log(`   - scripts/webs-found.json (${results.length} empresas)`);
  console.log(`   - scripts/webs-not-found.json (${notFound.length} empresas)`);

  // Show sample of found
  if (results.length > 0) {
    console.log(`\n   Muestra de webs encontradas:`);
    results.slice(0, 15).forEach((r) => {
      console.log(`   ${r.id} ${r.nombre} → ${r.web}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
