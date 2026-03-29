/**
 * borme.ts
 * Integración BORME — Sección A (Actos inscritos)
 *
 * Fuente: PDFs del BOE (gratis, completos, sin API key).
 * La Sección A NO incluye CIF/NIF en el texto, solo el nombre de empresa
 * y la Hoja del Registro Mercantil. Por tanto el matching se hace por
 * nombre normalizado (empresa.nombre ↔ nombre en el BORME).
 *
 * Flujo:
 *   GET /datosabiertos/api/borme/sumario/{YYYYMMDD}  →  lista de PDFs por provincia
 *   Descargar cada PDF  →  extraer entradas (número - nombre - texto del acto)
 *   Normalizar nombre  →  comparar con Map<nombre_normalizado, empresaId>
 *   Insertar BormeAlerta para los matches
 */

import { PDFParse } from "pdf-parse";
import { prisma } from "./prisma";

// ─── Config ──────────────────────────────────────────────────────────────────

const BOE_SUMARIO = "https://www.boe.es/datosabiertos/api/borme/sumario";
const BOE_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Fontiber-WarRoom/1.0 (internal research tool)",
};

/** ms entre descargas de PDF — para no saturar el BOE */
const PDF_DELAY_MS = 500;
/** ms entre días en el backfill */
export const DAY_DELAY_MS = 600;

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BormeItem {
  identificador: string;
  url_pdf: string;
  titulo: string; // nombre de la provincia
}

interface EntradaBorme {
  numeroRegistro: string;
  nombreEmpresa: string;    // tal cual aparece en el PDF
  textoActo: string;        // texto completo del acto (sin la cabecera de empresa)
  tipoActo: string;         // clasificado por keywords
}

// ─── Normalización de nombres ─────────────────────────────────────────────────

/**
 * Normaliza un nombre de empresa para comparación fuzzy:
 *   "SECURITAS DIRECT ESPAÑA, S.A.U." → "securitas direct espana sau"
 *   "Securitas Direct España SAU"     → "securitas direct espana sau"
 */
export function normalizeNombre(nombre: string): string {
  return (
    nombre
      // Mayúsculas
      .toUpperCase()
      // Quitar diacríticos (á→A, ñ→N, etc.)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Formas jurídicas largas → abreviatura sin puntos
      .replace(/\bSOCIEDAD\s+ANONIMA\s+LABORAL\b/g, "SAL")
      .replace(/\bSOCIEDAD\s+ANONIMA\s+UNIPERSONAL\b/g, "SAU")
      .replace(/\bSOCIEDAD\s+ANONIMA\b/g, "SA")
      .replace(/\bSOCIEDAD\s+LIMITADA\s+UNIPERSONAL\b/g, "SLU")
      .replace(/\bSOCIEDAD\s+LIMITADA\s+PROFESIONAL\b/g, "SLP")
      .replace(/\bSOCIEDAD\s+LIMITADA\b/g, "SL")
      .replace(/\bSOCIEDAD\s+COOPERATIVA\b/g, "SCOOP")
      .replace(/\bCOMUNIDAD\s+DE\s+BIENES\b/g, "CB")
      // Abreviaturas con puntos → sin puntos
      .replace(/S\.A\.U\b/g, "SAU")
      .replace(/S\.L\.U\b/g, "SLU")
      .replace(/S\.L\.P\b/g, "SLP")
      .replace(/S\.A\.L\b/g, "SAL")
      .replace(/S\.A\b/g, "SA")
      .replace(/S\.L\b/g, "SL")
      .replace(/S\.COOP\b/g, "SCOOP")
      // Quitar puntuación restante (puntos, comas, guiones, paréntesis…)
      .replace(/[.,;:'"!?()\-/\\]/g, " ")
      // Colapsar espacios
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Nombre "core" — sin forma jurídica al final.
 * Útil como fallback cuando el nombre en la DB no incluye SL/SA.
 *   "SECURITAS DIRECT ESPANA SAU" → "SECURITAS DIRECT ESPANA"
 */
function coreNombre(normalized: string): string {
  return normalized
    .replace(/\s+(SAU|SLU|SLP|SAL|SCOOP|SA|SL|CB|SLP|SAT)\s*$/, "")
    .trim();
}

// ─── Clasificación del tipo de acto ──────────────────────────────────────────

function classifyActo(
  texto: string
): "adquisicion" | "disolucion" | "cambio_titular" | "fusion" | "otros" {
  const t = texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/DISOLUCION|LIQUIDACION|EXTINCION|CANCELACION|BAJA DEFINITIVA|CESE DE ACTIVIDAD/.test(t))
    return "disolucion";
  if (/FUSION|ABSORCION|ESCISION/.test(t)) return "fusion";
  if (/ADQUISICION|COMPRAVENTA|CESION.*PARTICIPACION/.test(t)) return "adquisicion";
  if (/CAMBIO.*TITULAR|TRANSMISION.*PARTICIPACION|MODIFICACION.*SOCIOS/.test(t))
    return "cambio_titular";
  return "otros";
}

// ─── Fetch del sumario ────────────────────────────────────────────────────────

/**
 * Obtiene la lista de PDFs de la Sección A para una fecha (formato YYYYMMDD).
 * Devuelve [] si no hay BORME ese día (fin de semana / festivo).
 */
export async function fetchBormeSumario(dateStr: string): Promise<BormeItem[]> {
  const url = `${BOE_SUMARIO}/${dateStr}`;
  const res = await fetch(url, { headers: BOE_HEADERS });

  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status} al obtener sumario ${dateStr}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const diario =
    json?.data?.sumario?.diario ?? json?.sumario?.diario ?? [];
  if (!diario.length) return [];

  const secciones: unknown[] = diario[0]?.seccion ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seccionA: any = secciones.find((s: any) => s.codigo === "A");
  if (!seccionA) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawItems: any[] = Array.isArray(seccionA.item)
    ? seccionA.item
    : seccionA.item
    ? [seccionA.item]
    : [];

  return rawItems
    .map((item) => ({
      identificador: item.identificador ?? "",
      url_pdf: item.url_pdf?.texto ?? item.url_pdf ?? "",
      titulo: item.titulo ?? "",
    }))
    .filter((i) => i.url_pdf);
}

// ─── Descarga y parseo de PDF ─────────────────────────────────────────────────

/** Descarga un PDF del BOE y devuelve su texto completo */
async function fetchPdfText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": BOE_HEADERS["User-Agent"] },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar PDF ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

/**
 * Extrae las entradas individuales de un PDF de Sección A.
 *
 * Formato BORME Sección A:
 *   NNNNNN - NOMBRE EMPRESA SL.
 *   Tipo de acto. Detalles...
 *   Datos registrales. T XX , F XX, S 8, H B XXXXXX, I/A N (DD.MM.YY).
 *
 * Cada entrada comienza con 5–7 dígitos seguidos de ` - `.
 */
function parsePdfEntradas(text: string, pdfUrl: string): EntradaBorme[] {
  const entradas: EntradaBorme[] = [];

  // Encontrar todas las posiciones donde empieza una entrada
  // Patrón: inicio de línea + 5-7 dígitos + " - " + nombre
  const entryPattern = /^(\d{5,7})\s*-\s*(.+)$/gm;
  const starts: Array<{ index: number; numero: string; nombre: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = entryPattern.exec(text)) !== null) {
    starts.push({
      index: m.index,
      numero: m[1],
      nombre: m[2].trim().replace(/\.$/, "").trim(), // quitar punto final
    });
  }

  if (starts.length === 0) return entradas;

  for (let i = 0; i < starts.length; i++) {
    const { numero, nombre } = starts[i];
    const blockStart = starts[i].index + starts[i].numero.length + 3 + starts[i].nombre.length + 1; // after "NUMERO - NOMBRE\n"
    const blockEnd = i + 1 < starts.length ? starts[i + 1].index : text.length;
    const textoActo = text
      .slice(blockStart, blockEnd)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600);

    entradas.push({
      numeroRegistro: numero,
      nombreEmpresa: nombre,
      textoActo,
      tipoActo: classifyActo(textoActo + " " + nombre),
    });

    void pdfUrl; // usado por el caller para urlBorme
  }

  return entradas;
}

// ─── Función principal ────────────────────────────────────────────────────────

export interface BormeProcessResult {
  date: string;
  pdfsProcesados: number;
  entradasExtraidas: number;
  alertasCreadas: number;
  empresasEncontradas: number;
  errors: string[];
}

/**
 * Procesa el BORME de una fecha (formato YYYYMMDD).
 * Descarga todos los PDFs de la Sección A, extrae entradas, las cruza
 * con empresa.nombre (normalizado) y crea BormeAlerta para los matches.
 * Idempotente: volver a ejecutar para la misma fecha no duplica alertas.
 */
export async function processBormeDate(
  dateStr: string
): Promise<BormeProcessResult> {
  const fecha = new Date(
    Date.UTC(
      parseInt(dateStr.slice(0, 4)),
      parseInt(dateStr.slice(4, 6)) - 1,
      parseInt(dateStr.slice(6, 8))
    )
  );

  const result: BormeProcessResult = {
    date: dateStr,
    pdfsProcesados: 0,
    entradasExtraidas: 0,
    alertasCreadas: 0,
    empresasEncontradas: 0,
    errors: [],
  };

  // 1. Sumario del día
  let items: BormeItem[];
  try {
    items = await fetchBormeSumario(dateStr);
  } catch (err) {
    result.errors.push(`Error al obtener sumario: ${err}`);
    return result;
  }
  if (items.length === 0) return result; // Sin BORME este día

  // 2. Construir mapa de búsqueda: nombre_normalizado → empresaId
  //    (dos variantes: con y sin forma jurídica final)
  const empresas = await prisma.empresa.findMany({
    select: { id: true, nombre: true },
  });

  // Map principal: nombre completo normalizado → id
  const nombreToId = new Map<string, number>();
  // Map fallback: nombre core (sin SL/SA) → id
  const coreToId = new Map<string, number>();

  for (const e of empresas) {
    const norm = normalizeNombre(e.nombre);
    const core = coreNombre(norm);
    if (norm && !nombreToId.has(norm)) nombreToId.set(norm, e.id);
    if (core && core !== norm && !coreToId.has(core)) coreToId.set(core, e.id);
  }

  // 3. Procesar cada PDF provincial
  for (const item of items) {
    await sleep(PDF_DELAY_MS);
    try {
      const pdfText = await fetchPdfText(item.url_pdf);
      const entradas = parsePdfEntradas(pdfText, item.url_pdf);
      result.pdfsProcesados++;
      result.entradasExtraidas += entradas.length;

      for (const entrada of entradas) {
        // Buscar match: primero nombre completo, luego core
        const normBorme = normalizeNombre(entrada.nombreEmpresa);
        const coreBorme = coreNombre(normBorme);

        const empresaId =
          nombreToId.get(normBorme) ??
          coreToId.get(coreBorme) ??
          // Último recurso: buscar si el nombre del BORME está contenido en el nombre de la empresa
          // (útil para nombres muy largos truncados)
          null;

        if (!empresaId) continue;
        result.empresasEncontradas++;

        // Idempotencia: evitar duplicar (empresaId, fecha, tipoActo, numeroRegistro)
        const yaExiste = await prisma.bormeAlerta.findFirst({
          where: {
            empresaId,
            fecha,
            // Usamos urlBorme + descripción como clave de unicidad práctica
            urlBorme: item.url_pdf,
            descripcion: { startsWith: entrada.numeroRegistro },
          },
          select: { id: true },
        });

        if (!yaExiste) {
          await prisma.bormeAlerta.create({
            data: {
              empresaId,
              fecha,
              tipoActo: entrada.tipoActo,
              descripcion: `${entrada.numeroRegistro} — ${entrada.textoActo}`.slice(0, 500),
              urlBorme: item.url_pdf,
              leido: false,
            },
          });
          result.alertasCreadas++;
        }
      }
    } catch (err) {
      const msg = `Error en ${item.identificador} (${item.titulo}): ${err}`;
      result.errors.push(msg);
      console.error(msg);
    }
  }

  return result;
}

// ─── Helpers de fechas ────────────────────────────────────────────────────────

/** Días hábiles (L–V) entre startDate y endDate, como YYYYMMDD, de más reciente a más antiguo */
export function workingDaysBetween(startDate: Date, endDate: Date): string[] {
  const days: string[] = [];
  const d = new Date(endDate);
  d.setUTCHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setUTCHours(0, 0, 0, 0);
  while (d >= start) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(toDateStr(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days;
}

/** Últimos N días hábiles antes de hoy, de más reciente a más antiguo */
export function lastWorkdays(n: number): string[] {
  const days: string[] = [];
  const d = new Date();
  while (days.length < n) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(toDateStr(d));
  }
  return days;
}

function toDateStr(d: Date): string {
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    String(d.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
