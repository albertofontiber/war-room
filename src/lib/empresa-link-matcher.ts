/**
 * Matcher de empresas → carpetas OneDrive y páginas Notion.
 *
 * Estrategia en cascada:
 *   1. Match exacto por nombre normalizado (`normalizePersona(_, true)`).
 *   2. Si la empresa tiene `nombreComercial`, match exacto con ese alias.
 *   3. Si hay 0 matches → "miss".
 *   4. Si hay >1 matches → "ambiguo" (devolvemos los candidatos para
 *      revisión manual).
 *
 * Diseño deliberado: el matcher NO usa Claude todavía. La cascada simple
 * acierta el ~95% de casos típicos (mismo nombre legal). El 5% restante son
 * los aliases comerciales (e.g. "Extintores Pamplona SL" → "FireProtect"),
 * que se resuelven manualmente la primera vez vía `nombreComercial` y de ahí
 * en adelante el matcher acierta solo. Si más adelante necesitamos Claude
 * para casos ambiguos, se enchufa aquí.
 */

import { normalizePersona } from "@/lib/normalize";
import { listTargetFolders, type OneDriveFolder } from "@/lib/onedrive";
import { listTargetPages, type NotionPage } from "@/lib/notion-client";

export type MatchOutcome<T> =
  | { kind: "match"; item: T }
  | { kind: "miss"; tried: string[] }
  | { kind: "ambiguous"; candidates: T[]; tried: string[] };

export type EmpresaForMatch = {
  id: number;
  nombre: string;
  nombreComercial: string | null;
};

export type EmpresaMatchResult = {
  empresaId: number;
  oneDrive: MatchOutcome<OneDriveFolder>;
  notion: MatchOutcome<NotionPage>;
};

/** Quita prefijos numéricos del estilo "3. ", "12. ", "01 - " usados como
 * orden manual en carpetas OneDrive. */
function stripOrderPrefix(s: string): string {
  return s.replace(/^\s*\d+\s*[\.\-:]\s*/, "").trim();
}

/** Versión "compactada" sin espacios — útil para casos como
 *  "EXTI NORTE" ↔ "Extinorte" (la carpeta junta lo que el legal separa). */
function compact(s: string): string {
  return s.replace(/\s+/g, "");
}

/** Genera las claves normalizadas a probar para una empresa. */
function buildSearchKeys(empresa: EmpresaForMatch): string[] {
  const keys = new Set<string>();
  const addKey = (raw: string | null) => {
    if (!raw) return;
    const norm = normalizePersona(raw, true);
    if (norm) {
      keys.add(norm);
      keys.add(compact(norm));
    }
  };
  addKey(empresa.nombre);
  addKey(empresa.nombreComercial);
  return Array.from(keys);
}

/** Genera las claves normalizadas para indexar un candidato (carpeta o página).
 *  Hace varios passes para tolerar prefijos y espacios diferentes. */
function buildCandidateKeys(rawName: string): string[] {
  const variants = new Set<string>();
  const baseNorm = normalizePersona(rawName, true);
  if (baseNorm) {
    variants.add(baseNorm);
    variants.add(compact(baseNorm));
  }
  const stripped = stripOrderPrefix(rawName);
  if (stripped && stripped !== rawName) {
    const stripNorm = normalizePersona(stripped, true);
    if (stripNorm) {
      variants.add(stripNorm);
      variants.add(compact(stripNorm));
    }
  }
  return Array.from(variants);
}

function matchByKeys<T extends { name?: string; title?: string }>(
  candidatesIndex: Map<string, T[]>,
  keys: string[]
): MatchOutcome<T> {
  const hits: T[] = [];
  for (const key of keys) {
    const found = candidatesIndex.get(key);
    if (found) hits.push(...found);
  }
  // Dedupe por referencia
  const unique = Array.from(new Set(hits));
  if (unique.length === 1) return { kind: "match", item: unique[0] };
  if (unique.length === 0) return { kind: "miss", tried: keys };
  return { kind: "ambiguous", candidates: unique, tried: keys };
}

function buildIndex<T>(items: T[], nameOf: (t: T) => string): Map<string, T[]> {
  const idx = new Map<string, T[]>();
  for (const item of items) {
    const variants = buildCandidateKeys(nameOf(item));
    for (const key of variants) {
      const list = idx.get(key) ?? [];
      // Evita duplicar el mismo item bajo varias claves derivadas
      if (!list.includes(item)) list.push(item);
      idx.set(key, list);
    }
  }
  return idx;
}

/**
 * Resuelve OneDrive + Notion para una sola empresa. Usa los caches en memoria
 * de los clientes (se hidratan la primera vez).
 */
export async function matchEmpresaLinks(empresa: EmpresaForMatch): Promise<EmpresaMatchResult> {
  const [folders, pages] = await Promise.all([listTargetFolders(), listTargetPages()]);
  const folderIdx = buildIndex(folders, (f) => f.name);
  const pageIdx = buildIndex(pages, (p) => p.title);
  const keys = buildSearchKeys(empresa);
  return {
    empresaId: empresa.id,
    oneDrive: matchByKeys(folderIdx, keys),
    notion: matchByKeys(pageIdx, keys),
  };
}

/**
 * Resuelve para una lista de empresas en una sola pasada. Comparte los
 * índices, así que es lineal en N (no machaca Graph/Notion por empresa).
 *
 * Ideal para el script Fase 1 one-off.
 */
export async function matchEmpresasLinks(empresas: EmpresaForMatch[]): Promise<EmpresaMatchResult[]> {
  const [folders, pages] = await Promise.all([listTargetFolders(), listTargetPages()]);
  const folderIdx = buildIndex(folders, (f) => f.name);
  const pageIdx = buildIndex(pages, (p) => p.title);
  return empresas.map((empresa) => {
    const keys = buildSearchKeys(empresa);
    return {
      empresaId: empresa.id,
      oneDrive: matchByKeys(folderIdx, keys),
      notion: matchByKeys(pageIdx, keys),
    };
  });
}
