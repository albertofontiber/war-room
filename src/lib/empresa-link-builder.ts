/**
 * Orquestador de creación de docs externos (OneDrive + Notion) para una empresa
 * que avanza a `primera_reunion` por primera vez.
 *
 * Flujo:
 *   1. Sanitiza el nombre legal → quita sufijos jurídicos (SL, SA, etc.) y
 *      normaliza espacios. Mantiene tildes/eñes para el display.
 *   2. Crea carpeta OneDrive `[N+1]. {nombre}` con 3 subcarpetas estándar.
 *   3. Crea página Notion bajo `Targets` con el mismo nombre que la carpeta
 *      (incluyendo el prefijo numérico, para mantener simetría visual).
 *   4. Devuelve los webUrl resultantes para persistir en `Empresa`.
 *
 * Esta función ASUME que la empresa todavía no tiene URLs poblados; el caller
 * debe verificar antes (en el trigger del PATCH /stage o en el botón manual
 * del panel) para evitar duplicaciones.
 */

import { createTargetFolder, type CreatedFolder } from "@/lib/onedrive";
import { createTargetPage, type CreatedPage } from "@/lib/notion-client";
import { log } from "@/lib/logger";

// Sufijos jurídicos a eliminar — superset del de lib/normalize.ts. Mantenemos
// la versión "human-readable" (capitalización original); solo recortamos el
// sufijo final con sus posibles puntuaciones.
const LEGAL_SUFFIXES = [
  /,?\s*S\.?L\.?U?\.?$/i,
  /,?\s*S\.?A\.?U?\.?$/i,
  /,?\s*S\.?L\.?L\.?$/i,
  /,?\s*S\.?L\.?P\.?$/i,
  /,?\s*S\.?C\.?P?\.?$/i,
  /,?\s*S\.?COOP\.?$/i,
  /,?\s*SLU$/i,
  /,?\s*SAU$/i,
  /,?\s*SLL$/i,
  /,?\s*SLP$/i,
  /,?\s*SCP$/i,
  /,?\s*SA$/i,
  /,?\s*SL$/i,
];

/** Normaliza un nombre legal a un formato apto para nombre de carpeta/página:
 *  quita sufijos jurídicos, colapsa espacios y aplica title-case suave
 *  (mantiene siglas en mayúsculas). */
export function sanitizeLegalName(raw: string): string {
  let name = raw.trim();
  for (const re of LEGAL_SUFFIXES) {
    if (re.test(name)) {
      name = name.replace(re, "").trim();
    }
  }
  // Quitar coma final residual
  name = name.replace(/,+\s*$/, "").trim();
  // Colapsar espacios
  name = name.replace(/\s+/g, " ");
  return name;
}

export type EmpresaLinksCreated = {
  oneDriveUrl: string;
  notionUrl: string;
  folder: CreatedFolder;
  page: CreatedPage;
};

export async function createEmpresaLinks(legalName: string): Promise<EmpresaLinksCreated> {
  const cleanName = sanitizeLegalName(legalName);
  if (!cleanName) {
    throw new Error("Nombre vacío tras sanitización");
  }

  log.info("empresa-link-builder", `creating docs for "${cleanName}"`);

  // Crear OneDrive primero (puede fallar por permisos / nombre duplicado).
  // Solo si tiene éxito creamos la página de Notion para evitar páginas
  // huérfanas si OneDrive falla.
  const folder = await createTargetFolder(cleanName);

  // Notion usa SOLO el nombre limpio (sin prefijo numérico). El prefijo
  // `[N+1].` solo tiene sentido en OneDrive como orden manual; en Notion
  // el orden lo decide el usuario con drag & drop.
  const page = await createTargetPage(cleanName);

  return {
    oneDriveUrl: folder.webUrl,
    notionUrl: page.url,
    folder,
    page,
  };
}
