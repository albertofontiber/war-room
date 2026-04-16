/**
 * validate-webs.ts — Validate found URLs by checking page content matches company
 *
 * Fetches the HTML title/body of each found URL and checks if it's
 * plausibly related to the company name.
 *
 * Usage: npx tsx scripts/validate-webs.ts
 */

import * as fs from "fs";

interface Found {
  id: number;
  nombre: string;
  web: string;
}

const SUFFIXES = /,?\s*\b(S\.?L\.?U?\.?|S\.?A\.?U?\.?|S\.?C\.?|C\.?B\.?|S\.?L\.?L\.?|SOCIEDAD LIMITADA|SOCIEDAD ANONIMA)\b\.?\s*$/gi;
const NOISE = /[.,\-()'"\/\\&+!¡¿?#@]/g;

function normalizeForMatch(s: string): string {
  return s
    .toUpperCase()
    .replace(SUFFIXES, "")
    .replace(SUFFIXES, "")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getKeywords(nombre: string): string[] {
  const norm = normalizeForMatch(nombre);
  const stopwords = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E", "EN", "CONTRA", "PARA", "POR", "SISTEMAS", "INSTALACIONES", "SEGURIDAD", "SEGURETAT", "INCENDIOS"]);
  return norm
    .split(" ")
    .filter((w) => w.length > 3 && !stopwords.has(w));
}

async function fetchTitle(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
    const desc = descMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    // Extract first 2000 chars of visible text (rough)
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 2000);
    return `${title} | ${desc} | ${bodyText}`;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function main() {
  const data: Found[] = JSON.parse(fs.readFileSync("scripts/webs-found.json", "utf-8"));
  console.log(`🔍 Validando ${data.length} URLs encontradas...\n`);

  const valid: Found[] = [];
  const invalid: Array<Found & { reason: string }> = [];
  let checked = 0;

  const BATCH = 15;
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (entry) => {
        const url = new URL(entry.web);
        const domain = url.hostname.replace("www.", "");
        const domainName = domain.split(".")[0];

        // Quick reject: very short domain + doesn't match any keyword
        const keywords = getKeywords(entry.nombre);
        const domainUpper = domainName.toUpperCase();

        // Check if domain name is a substring of any keyword or vice versa
        const domainMatchesKeyword = keywords.some(
          (kw) => domainUpper.includes(kw) || kw.includes(domainUpper)
        );

        if (domainName.length <= 4 && !domainMatchesKeyword) {
          // Need to verify via page content
          const content = await fetchTitle(entry.web);
          if (!content) {
            invalid.push({ ...entry, reason: "unreachable" });
            checked++;
            return;
          }

          const contentUpper = content.toUpperCase();
          const anyKeywordInContent = keywords.some(
            (kw) => kw.length > 4 && contentUpper.includes(kw)
          );

          if (anyKeywordInContent) {
            valid.push(entry);
          } else {
            invalid.push({ ...entry, reason: `no keyword match in content. Keywords: ${keywords.join(",")}` });
          }
        } else if (domainMatchesKeyword || domainName.length > 6) {
          // Domain matches a keyword — likely valid, but do a quick reachability check
          valid.push(entry);
        } else {
          // Medium confidence — check content
          const content = await fetchTitle(entry.web);
          if (!content) {
            invalid.push({ ...entry, reason: "unreachable" });
            checked++;
            return;
          }

          const contentUpper = content.toUpperCase();
          const anyKeywordInContent = keywords.some(
            (kw) => kw.length > 3 && contentUpper.includes(kw)
          );

          if (anyKeywordInContent) {
            valid.push(entry);
          } else {
            invalid.push({ ...entry, reason: `weak match. Domain: ${domainName}, Keywords: ${keywords.join(",")}` });
          }
        }

        checked++;
        if (checked % 50 === 0) {
          console.log(`   [${checked}/${data.length}] valid: ${valid.length}, invalid: ${invalid.length}`);
        }
      })
    );
  }

  console.log(`\n✅ Validación completada:`);
  console.log(`   Valid: ${valid.length}`);
  console.log(`   Invalid/rejected: ${invalid.length}`);

  fs.writeFileSync("scripts/webs-validated.json", JSON.stringify(valid, null, 2));
  fs.writeFileSync("scripts/webs-rejected.json", JSON.stringify(invalid, null, 2));

  console.log(`\n   Guardados en:`);
  console.log(`   - scripts/webs-validated.json (${valid.length})`);
  console.log(`   - scripts/webs-rejected.json (${invalid.length})`);

  // Show some rejected
  console.log(`\n   Muestra de rechazados:`);
  invalid.slice(0, 10).forEach((r) => {
    console.log(`   ${r.id} ${r.nombre} → ${r.web} (${r.reason})`);
  });
}

main().catch(console.error);
