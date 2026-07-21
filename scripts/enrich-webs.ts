/**
 * Backfill seguro de webs para Empresa.
 *
 * Por defecto solo genera un informe. --apply escribe exclusivamente las URLs
 * cuyo CIF se haya encontrado en la web o en una de sus páginas legales.
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/enrich-webs.ts
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/enrich-webs.ts --discover --limit 100
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/enrich-webs.ts --discover --apply
 */

import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  cifAppearsInText,
  generateWebsiteCandidates,
  homepageUrl,
  normalizeWebsiteText,
} from "../src/lib/web-enrichment";

const prisma = new PrismaClient();
const LEGACY_CANDIDATES_PATH = "scripts/archive/webs-cif-confirmed.json";

type Empresa = {
  id: number;
  cif: string;
  nombre: string;
  enPerimetro: boolean;
};

type LegacyCandidate = {
  id: number;
  web: string;
};

type Match = {
  id: number;
  cif: string;
  nombre: string;
  web: string;
  validatedAt: string;
};

type Options = {
  apply: boolean;
  discover: boolean;
  includeOutOfPerimeter: boolean;
  limit: number;
  offset: number;
  reportPath: string;
};

function readNumberArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;

  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} debe recibir un entero mayor o igual a 0.`);
  }
  return value;
}

function readOptions(): Options {
  const reportIndex = process.argv.indexOf("--report");
  const reportPath = reportIndex === -1
    ? "scripts/web-enrichment-report.json"
    : process.argv[reportIndex + 1];

  if (!reportPath) throw new Error("--report requiere una ruta de salida.");

  return {
    apply: process.argv.includes("--apply"),
    discover: process.argv.includes("--discover"),
    includeOutOfPerimeter: process.argv.includes("--include-out-of-perimeter"),
    limit: readNumberArg("--limit", 100),
    offset: readNumberArg("--offset", 0),
    reportPath,
  };
}

async function loadLegacyCandidates(): Promise<Map<number, string>> {
  try {
    const raw = await fs.readFile(LEGACY_CANDIDATES_PATH, "utf8");
    const entries: LegacyCandidate[] = JSON.parse(raw);
    return new Map(entries.filter((entry) => homepageUrl(entry.web)).map((entry) => [entry.id, entry.web]));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
}

function uniqueCandidateUrls(empresa: Empresa, legacyUrl: string | undefined, discover: boolean): string[] {
  const urls = [legacyUrl, ...(discover ? generateWebsiteCandidates(empresa.nombre) : [])]
    .filter((url): url is string => Boolean(url))
    .map(homepageUrl)
    .filter((url): url is string => Boolean(url));

  return [...new Set(urls)];
}

function pagesToCheck(candidate: string): string[] {
  const homepage = homepageUrl(candidate);
  if (!homepage) return [];

  return [
    homepage,
    new URL("aviso-legal", homepage).href,
    new URL("legal", homepage).href,
    new URL("politica-privacidad", homepage).href,
    new URL("politica-de-privacidad", homepage).href,
  ];
}

async function fetchPage(url: string): Promise<{ finalUrl: string; text: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FontiberWarRoom/1.0)" },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;

    const finalUrl = homepageUrl(response.url);
    if (!finalUrl) return null;

    const html = await response.text();
    return {
      finalUrl,
      text: normalizeWebsiteText(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " "),
      ),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function findVerifiedWebsite(empresa: Empresa, candidates: string[]): Promise<Match | null> {
  for (const candidate of candidates) {
    for (const page of pagesToCheck(candidate)) {
      const result = await fetchPage(page);
      if (result && cifAppearsInText(empresa.cif, result.text)) {
        return {
          id: empresa.id,
          cif: empresa.cif,
          nombre: empresa.nombre,
          web: result.finalUrl,
          validatedAt: page,
        };
      }
    }
  }

  return null;
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, callback: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await callback(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function main() {
  const options = readOptions();
  const legacyCandidates = await loadLegacyCandidates();
  const empresas = await prisma.empresa.findMany({
    where: {
      web: null,
      esAnonima: false,
      ...(options.includeOutOfPerimeter ? {} : { enPerimetro: true }),
    },
    select: { id: true, cif: true, nombre: true, enPerimetro: true },
    orderBy: { nombre: "asc" },
    skip: options.offset,
    take: options.limit,
  });

  console.log(`Validando ${empresas.length} empresas (${options.apply ? "APPLY" : "dry-run"})…`);
  let complete = 0;
  let matchesFound = 0;
  const matches = (await mapConcurrent(empresas, 4, async (empresa) => {
    const candidates = uniqueCandidateUrls(empresa, legacyCandidates.get(empresa.id), options.discover);
    const match = await findVerifiedWebsite(empresa, candidates);
    complete++;
    if (match) matchesFound++;
    if (complete % 10 === 0 || complete === empresas.length) {
      console.log(`[${complete}/${empresas.length}] coincidencias CIF: ${matchesFound}`);
    }
    return match;
  })).filter((match): match is Match => match !== null);

  let updated = 0;
  if (options.apply) {
    for (const match of matches) {
      const result = await prisma.empresa.updateMany({
        where: { id: match.id, cif: match.cif, web: null, esAnonima: false },
        data: { web: match.web },
      });
      updated += result.count;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? "apply" : "dry-run",
    options: {
      discover: options.discover,
      includeOutOfPerimeter: options.includeOutOfPerimeter,
      limit: options.limit,
      offset: options.offset,
    },
    checked: empresas.length,
    verifiedByCif: matches,
    updated,
  };
  const reportPath = path.resolve(options.reportPath);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    checked: report.checked,
    verifiedByCif: report.verifiedByCif.length,
    updated,
    report: options.reportPath,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
