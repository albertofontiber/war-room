/**
 * import-excel.ts
 * Importa empresas y financieros desde el Excel de SABI/Orbis al War Room.
 *
 * Uso:
 *   npx tsx scripts/import-excel.ts <ruta.xlsx> [--sector PCI|seguridad_electronica|mixto]
 *
 * Ejemplos:
 *   npx tsx scripts/import-excel.ts data/pci.xlsx
 *   npx tsx scripts/import-excel.ts data/seg-electronica.xlsx --sector seguridad_electronica
 *
 * Campo "ámbito geográfico seguridad electrónica":
 *   "E" → estatal | "A" → autonómico | vacío → null (PCI no aplica)
 *
 * Lógica de sector:
 *   - Empresa nueva → sector = valor del flag --sector (defecto: "PCI")
 *   - Empresa ya existe + --sector distinto al actual → sector = "mixto"
 *   - Empresa ya existe + mismo sector → no cambia
 */

import { PrismaClient } from "@prisma/client";
import path from "path";
import { readWorkbook } from "../lib/excel";
import { normalizeCCAA, normalizeProvincia, normalizeLocalidad } from "./lib/normalize-geo.js";

const prisma = new PrismaClient();

const BATCH_SIZE = 15; // Seguro para el límite de conexiones de Supabase

const SECTORES_VALIDOS = ["PCI", "seguridad_electronica", "mixto"] as const;
type Sector = typeof SECTORES_VALIDOS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Normaliza: minúsculas + colapsa whitespace + trim */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\n\r\t\s]+/g, " ").trim();
}

/** Busca columna cuyo nombre (normalizado) contiene TODOS los términos */
function col(row: Record<string, unknown>, ...terms: string[]): unknown {
  const key = Object.keys(row).find((k) => {
    const nk = norm(k);
    return terms.every((t) => nk.includes(norm(t)));
  });
  return key !== undefined ? row[key] : undefined;
}

/** Miles EUR → EUR entero. "n.d.", "", null → null */
function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim();
  if (!s || ["n.d", "n.d.", "nd"].includes(s.toLowerCase())) return null;
  const n = parseFloat(s.replace(/,/g, ".").replace(/\s/g, ""));
  if (isNaN(n)) return null;
  return Math.round(n * 1000);
}

/** Empleados (entero, sin multiplicar) */
function parseEmp(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim();
  if (["n.d", "n.d.", "nd"].includes(s.toLowerCase())) return null;
  const n = parseInt(s, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

/** String limpio; "0", 0, "" → null */
function parseStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val === 0 || val === "0") return null;
  return String(val).trim() || null;
}

/**
 * Extrae año:
 *   - Número serial Excel (ej. 45657 = 31/12/2024) → convierte a año
 *   - Texto con año (ej. "12/31/2024", "2024") → extrae con regex
 */
function parseAnio(val: unknown): number | null {
  if (!val) return null;
  const num = Number(val);
  // Serial de fecha Excel: rango típico para años 2000–2035 ≈ 36526–49710
  if (!isNaN(num) && num > 36000 && num < 55000 && Number.isInteger(num)) {
    const d = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    return d.getUTCFullYear();
  }
  // Texto: "12/31/2024", "2024", "31/12/2024", etc.
  const m = String(val).match(/\b(20\d{2}|19\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

/** "Out of perimeter" → false; resto → true */
function parsePerimetro(val: unknown): boolean {
  if (!val) return true;
  return !String(val).toLowerCase().includes("out of perimeter");
}

/** Calcula sector resultante cuando una empresa ya existe */
function calcSectorUpdate(sectorActual: string | null, sectorImport: Sector): string | null {
  if (!sectorActual) return sectorImport;
  if (sectorActual === sectorImport) return sectorActual;
  if (sectorActual === "mixto") return "mixto";
  return "mixto";
}

// ─── Cache de Grupos (thread-safe para Promise.all) ───────────────────────

const grupoCache = new Map<string, number>();            // nombre_lower → id
const grupoPending = new Map<string, Promise<number>>(); // en vuelo

/** Precarga todos los grupos existentes en memoria */
async function precargarGrupos() {
  const grupos = await prisma.grupo.findMany({ select: { id: true, nombre: true } });
  for (const g of grupos) {
    grupoCache.set(g.nombre.trim().toLowerCase(), g.id);
  }
  console.log(`  📁 Grupos precargados: ${grupos.length}`);
}

/**
 * Find-or-create Grupo con cache en memoria.
 * Compartir la misma Promise evita crear duplicados en paralelo.
 */
async function findOrCreateGrupo(nombre: string): Promise<number> {
  const key = nombre.trim().toLowerCase();

  if (grupoCache.has(key)) return grupoCache.get(key)!;
  if (grupoPending.has(key)) return grupoPending.get(key)!;

  const p = (async () => {
    const existing = await prisma.grupo.findFirst({
      where: { nombre: { equals: nombre, mode: "insensitive" } },
    });
    if (existing) {
      grupoCache.set(key, existing.id);
      return existing.id;
    }
    const nuevo = await prisma.grupo.create({
      data: { nombre, tipo: "multinacional" },
    });
    console.log(`  📁 Grupo creado: "${nombre}" (id=${nuevo.id}) — revisa el tipo`);
    grupoCache.set(key, nuevo.id);
    return nuevo.id;
  })();

  grupoPending.set(key, p);
  try {
    return await p;
  } finally {
    grupoPending.delete(key);
  }
}

// ─── Tipo resultado por fila ──────────────────────────────────────────────

type FinRow = {
  empresaId: number;
  anio: number;
  ingresos: number | null;
  margenBruto: number | null;
  ebitda: number | null;
  fuente: string;
};

type RowResult = {
  creada: boolean;
  actualizada: boolean;
  mixto: boolean;
  saltada: boolean;
  sinGeo: string | null;
  financieros: FinRow[];
  error: string | null;
};

// ─── Procesar una fila ────────────────────────────────────────────────────

async function processRow(
  row: Record<string, unknown>,
  sectorFlag: Sector
): Promise<RowResult> {
  const empty: RowResult = {
    creada: false, actualizada: false, mixto: false,
    saltada: false, sinGeo: null, financieros: [], error: null,
  };

  const cif    = parseStr(col(row, "CIF"));
  const nombre = parseStr(col(row, "Company name"));
  if (!cif || !nombre) return { ...empty, saltada: true };

  try {
    // ── Grupo (GUO omitido — se asignará manualmente) ─────────────────
    const grupoId: number | null = null;

    // ── Geo ──────────────────────────────────────────────────────────
    const ccaa      = normalizeCCAA(parseStr(col(row, "comunidad")));
    const provincia = normalizeProvincia(parseStr(col(row, "provincia")));
    const localidad = normalizeLocalidad(parseStr(col(row, "localidad")));

    // ── Ámbito geográfico ─────────────────────────────────────────────
    const ambitoGeoRaw = parseStr(col(row, "mbito geogr"));
    const ambitoGeo = ambitoGeoRaw === "E" || ambitoGeoRaw === "A" ? ambitoGeoRaw : null;

    // ── Campos básicos ────────────────────────────────────────────────
    const web         = parseStr(col(row, "web"));
    const enPerimetro = parsePerimetro(col(row, "Perimeter"));
    const empleados   = parseEmp(col(row, "empleados", "lt"));
    const ultimoAnio  = parseAnio(
      col(row, "ltimo año disponible") ?? col(row, "Ultimo año disponible")
    );

    // ── Upsert Empresa ────────────────────────────────────────────────
    const yaExiste = await prisma.empresa.findUnique({ where: { cif } });
    let empresaId: number;
    let creada = false, actualizada = false, mixto = false;

    if (yaExiste) {
      const nuevoSector = calcSectorUpdate(yaExiste.sector, sectorFlag);
      mixto = nuevoSector === "mixto" && yaExiste.sector !== "mixto";
      const updated = await prisma.empresa.update({
        where: { cif },
        data: {
          nombre,
          sector: nuevoSector,
          ...(web        !== null && { web }),
          ...(empleados  !== null && { empleados }),
          ...(grupoId    !== null && { grupoId }),
          ...(ccaa       !== null && { ccaa }),
          ...(provincia  !== null && { provincia }),
          ...(localidad  !== null && { localidad }),
          ...(ambitoGeo  !== null && { ambitoGeo }),
          enPerimetro,
          fuente: "excel",
        },
      });
      empresaId = updated.id;
      actualizada = true;
    } else {
      const created = await prisma.empresa.create({
        data: {
          cif, nombre, web, empleados, grupoId,
          sector: sectorFlag,
          ccaa, provincia, localidad, ambitoGeo,
          enPerimetro, fuente: "excel",
        },
      });
      empresaId = created.id;
      creada = true;
    }

    // ── Preparar financieros ──────────────────────────────────────────
    const financieros: FinRow[] = [];
    if (ultimoAnio) {
      const sufijos: string[][] = [
        ["lt"],
        ["año - 1", "o - 1"],
        ["año - 2", "o - 2"],
        ["año - 3", "o - 3"],
        ["año - 4", "o - 4"],
      ];
      for (let i = 0; i < sufijos.length; i++) {
        const anio = ultimoAnio - i;
        const tags = sufijos[i];
        const findFin = (baseTerms: string[]): unknown => {
          const key = Object.keys(row).find((k) => {
            const nk = norm(k);
            return (
              baseTerms.every((b) => nk.includes(norm(b))) &&
              tags.some((t) => nk.includes(norm(t)))
            );
          });
          return key !== undefined ? row[key] : undefined;
        };
        const ingresos    = parseNum(findFin(["importe neto", "cifra de ventas"]));
        const margenBruto = parseNum(findFin(["resultado bruto"]));
        const ebitda      = parseNum(findFin(["ebitda"]));
        if (ingresos !== null || margenBruto !== null || ebitda !== null) {
          financieros.push({ empresaId, anio, ingresos, margenBruto, ebitda, fuente: "excel" });
        }
      }
    }

    return {
      creada, actualizada, mixto, saltada: false,
      sinGeo: creada && !ccaa && !provincia ? nombre : null,
      financieros, error: null,
    };
  } catch (err) {
    return { ...empty, error: `[${cif}] ${nombre}: ${String(err)}` };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));
  const sectorFlag = (() => {
    const idx = args.indexOf("--sector");
    if (idx === -1) return "PCI" as Sector;
    const val = args[idx + 1] as Sector;
    if (!SECTORES_VALIDOS.includes(val)) {
      console.error(`❌  Sector inválido: "${val}". Usa: PCI | seguridad_electronica | mixto`);
      process.exit(1);
    }
    return val;
  })();

  if (!filePath) {
    console.error("❌  Uso: npx tsx scripts/import-excel.ts <ruta.xlsx> [--sector PCI|seguridad_electronica]");
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  console.log(`\n📊  Importando: ${absPath}`);
  console.log(`🏷️   Sector por defecto para empresas nuevas: ${sectorFlag}\n`);

  // ── Leer Excel ──────────────────────────────────────────────────────────
  const workbook = await readWorkbook(absPath);
  const firstSheet = workbook[0];
  if (!firstSheet) throw new Error("El Excel no contiene ninguna pestaña.");
  const sheetName = firstSheet.sheet;
  console.log(`📄  Pestaña: "${sheetName}"`);

  const rawRows = firstSheet.data;

  const headerRowIdx = rawRows.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").toUpperCase().includes("CIF"))
  );
  if (headerRowIdx === -1) {
    console.error("❌  No se encontró la fila de cabecera.");
    process.exit(1);
  }

  const headers = rawRows[headerRowIdx] as unknown[];
  const rows: Record<string, unknown>[] = [];
  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const dataRow = rawRows[r] as unknown[];
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c] != null ? String(headers[c]) : `__COL_${c}`] = dataRow[c] ?? null;
    }
    rows.push(obj);
  }

  console.log(`🔍  Cabecera en fila ${headerRowIdx} | Filas de datos: ${rows.length}`);

  // ── Precargar grupos ────────────────────────────────────────────────────
  await precargarGrupos();
  console.log(`\n⚡  Procesando en lotes de ${BATCH_SIZE}...\n`);
  console.log("─".repeat(64));

  // ── Contadores ──────────────────────────────────────────────────────────
  let empresasCreadas = 0, empresasActualizadas = 0;
  let mixtoDetectados = 0, finCreados = 0;
  let saltadas = 0, errores = 0;
  const sinGeo: string[] = [];
  const totalLotes = Math.ceil(rows.length / BATCH_SIZE);

  // ── Bucle por lotes ─────────────────────────────────────────────────────
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const lote = rows.slice(i, i + BATCH_SIZE);
    const loteNum = Math.floor(i / BATCH_SIZE) + 1;

    // Procesar todas las empresas del lote en paralelo
    const results = await Promise.all(lote.map((row) => processRow(row, sectorFlag)));

    // Recoger financieros del lote y crear en bulk
    const finData = results.flatMap((r) => r.financieros);
    if (finData.length > 0) {
      const created = await prisma.financiero.createMany({
        data: finData,
        skipDuplicates: true,
      });
      finCreados += created.count;
    }

    // Agregar contadores
    for (const r of results) {
      if (r.saltada) { saltadas++; continue; }
      if (r.error)   { errores++; console.error(`❌  ${r.error}`); continue; }
      if (r.creada)       empresasCreadas++;
      if (r.actualizada)  empresasActualizadas++;
      if (r.mixto)        mixtoDetectados++;
      if (r.sinGeo)       sinGeo.push(r.sinGeo);
    }

    // Progreso
    const pct = Math.round((loteNum / totalLotes) * 100);
    process.stdout.write(`\r  Lote ${loteNum}/${totalLotes} (${pct}%) — ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} empresas | Financieros: ${finCreados}`);
  }

  // ── Resumen ─────────────────────────────────────────────────────────────
  console.log("\n\n" + "═".repeat(64));
  console.log("RESUMEN DE IMPORTACIÓN");
  console.log("═".repeat(64));
  console.log(`✅  Empresas creadas:        ${empresasCreadas}`);
  console.log(`♻️   Empresas actualizadas:   ${empresasActualizadas}`);
  if (mixtoDetectados) console.log(`🔀  Sector → mixto:          ${mixtoDetectados}`);
  console.log(`📈  Financieros creados:     ${finCreados}`);
  if (saltadas) console.log(`⏭️   Filas saltadas:           ${saltadas}`);
  if (errores)  console.log(`❌  Errores:                  ${errores}`);

  if (sinGeo.length > 0) {
    console.log(`\n📍  SIN GEODATA (${sinGeo.length}) — ejecuta geocoding.ts después`);
    sinGeo.slice(0, 5).forEach((n) => console.log(`    · ${n}`));
    if (sinGeo.length > 5) console.log(`    ... y ${sinGeo.length - 5} más`);
  }

  console.log(`\n💡  Siguiente paso: npx tsx scripts/geocoding.ts`);
  console.log("═".repeat(64) + "\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
