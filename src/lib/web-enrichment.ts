import { normalizeCif } from "./cif";

const LEGAL_SUFFIXES = /\b(S\.?L\.?U?\.?|S\.?A\.?U?\.?|S\.?C\.?P?\.?|C\.?B\.?|S\.?L\.?L\.?|SOCIEDAD LIMITADA|SOCIEDAD ANONIMA)\b\.?\s*$/i;
const STOP_WORDS = new Set([
  "DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E", "EN", "CONTRA", "PARA", "POR",
  "SISTEMAS", "INSTALACIONES", "SEGURIDAD", "SEGURETAT", "SECURITY", "INCENDIOS",
  "INCENDIS", "PROTECCION", "PROTECTION", "MANTENIMIENTO", "MANTENIMIENTOS",
  "SERVICIOS", "SOLUCIONES", "PROYECTOS", "INGENIERIA", "TECNICAS", "TECNICA",
]);
const SECTOR_WORDS = new Set([
  "SEGURIDAD", "SEGURETAT", "SECURITY", "INCENDIOS", "INCENDIS", "PCI", "EXTINTORES",
  "EXTINCION", "FUEGO",
]);

export function normalizeWebsiteText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cifAppearsInText(cif: string, text: string): boolean {
  const normalizedCif = normalizeCif(cif);
  if (!normalizedCif) return false;

  const normalizedText = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const cifPattern = normalizedCif.split("").join("[^A-Z0-9]*");
  return new RegExp(`(?:^|[^A-Z0-9])${cifPattern}(?=$|[^A-Z0-9])`).test(normalizedText);
}

function companyWords(nombre: string): string[] {
  let normalized = normalizeWebsiteText(nombre);
  normalized = normalized.replace(LEGAL_SUFFIXES, "").trim();
  normalized = normalized.replace(LEGAL_SUFFIXES, "").trim();

  return normalized
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Genera un conjunto pequeño de dominios probables. Nunca debe usarse como
 * validación: cada URL resultante se contrasta después contra el CIF.
 */
export function generateWebsiteCandidates(nombre: string): string[] {
  const words = companyWords(nombre);
  if (words.length === 0) return [];

  const bases = new Set<string>();
  const joined = words.join("").toLowerCase();
  if (joined.length >= 5) bases.add(joined);

  if (words[0].length >= 6) bases.add(words[0].toLowerCase());
  if (words.length >= 2) {
    const firstTwo = words.slice(0, 2).join("").toLowerCase();
    if (firstTwo.length >= 5) bases.add(firstTwo);
  }

  const nonSectorWords = words.filter((word) => !SECTOR_WORDS.has(word));
  if (nonSectorWords.length > 0) {
    const distinctive = nonSectorWords.join("").toLowerCase();
    if (distinctive.length >= 5) {
      bases.add(distinctive);
      bases.add(`${distinctive}pci`);
      bases.add(`${distinctive}seguridad`);
    }
  }

  const urls: string[] = [];
  for (const base of bases) {
    urls.push(`https://${base}.es/`, `https://${base}.com/`);
  }

  return [...new Set(urls)].slice(0, 12);
}

export function homepageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return new URL("/", url).href;
  } catch {
    return null;
  }
}
