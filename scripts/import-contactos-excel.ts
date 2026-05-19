/**
 * import-contactos-excel.ts
 *
 * Importa contactos desde un Excel a la tabla `Contacto` de la BD.
 *
 * Estructura esperada del Excel (hoja "Contactos Targets PCI"):
 *   - Ref. Roll-up, Empresa, Proyecto, Ubicación, Contacto, Rol / Cargo,
 *     Email, Teléfono, Fuente, Notas
 *
 * Match de empresa en cascada:
 *   1. Ref. Roll-up vía OneDrive URL (más fiable — la carpeta `N. Nombre`
 *      ya está vinculada a un único empresaId tras el cron de docs)
 *   2. Nombre exacto (case-insensitive) contra Empresa.nombre
 *   3. Nombre normalizado (`normalizePersona(name, true)`) — quita sufijos
 *      jurídicos (SL, SA, ...) y tildes, permite matches robustos
 *   4. Alias entre paréntesis (ej. "EXTINTORES PAMPLONA, S.L. (Fireprotect)")
 *
 * Reglas:
 *   - Match único + contacto NO existe (mismo nombre o email en esa empresa)
 *     → CREAR
 *   - Match único + contacto YA existe → SKIP (no actualizamos campos)
 *   - Match ambiguo (>1 empresa) → SKIP + reportar para revisión manual
 *   - Sin match → SKIP + reportar
 *   - Email vacío → CREAR igualmente (el cron Sent Items no lo matcheará,
 *     pero el contacto sigue siendo útil para gestión humana)
 *
 * Uso:
 *   npx tsx scripts/import-contactos-excel.ts           (dry-run)
 *   APPLY=1 npx tsx scripts/import-contactos-excel.ts   (aplica)
 *   FILE=ruta npx tsx scripts/import-contactos-excel.ts (custom path)
 */

import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";
import { normalizePersona } from "../src/lib/normalize";

const APPLY = process.env.APPLY === "1";
const DEFAULT_FILE =
  "C:\\Users\\Admin\\OneDrive - fontiber com\\Documents\\Claude\\Projects\\PCI\\Contactos Empresas PCI v6.xlsx";
const FILE = process.env.FILE ?? DEFAULT_FILE;

interface ExcelRow {
  ref: string;
  empresa: string;
  contacto: string;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
  fuente: string | null;
  notas: string | null;
}

interface EmpresaMatch {
  empresaId: number;
  empresaNombre: string;
  via:
    | "onedrive"
    | "nombre_exact"
    | "nombre_norm"
    | "alias_paren"
    | "palabra_distintiva";
}

/** Palabras genéricas del dominio PCI/seguridad que NO sirven como distintivo
 *  para identificar una empresa concreta (aparecen en cientos de razones
 *  sociales). El matcher por "palabra distintiva" las ignora. */
const PALABRAS_GENERICAS = new Set([
  "SOCIEDAD", "LIMITADA", "ANONIMA", "ESPANA", "ESPANOLA",
  "SEGURIDAD", "PROTECCION", "SISTEMAS", "CONTRA", "INCENDIOS", "INCENDIO",
  "INSTALACIONES", "SERVICIOS", "INTEGRALES", "TECNICA", "TECNICOS",
  "INGENIERIA", "PROYECTOS", "GRUPO", "EMPRESA", "EQUIPOS", "EQUIPO",
  "ELECTRONICA", "ELECTRICA", "INDUSTRIAL", "INDUSTRIALES",
  "MANTENIMIENTO", "MANTENIMIENTOS", "INTEGRAL", "GENERAL", "GENERALES",
  "NACIONAL", "INTERNACIONAL", "CASTELLANA", "CATALANA",
]);

/** Limpia un campo string del Excel: trim y descarta valores vacíos / placeholders. */
function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Placeholders comunes en el Excel
  if (/^\(?(sin|pendiente|no listado|n\/a|nan)/i.test(s)) return null;
  return s;
}

/**
 * Extrae candidatos de razón social desde el campo Empresa del Excel.
 *
 * Casos cubiertos:
 *   - "EXTINTORES PAMPLONA, S.L. (Fireprotect)" → ["EXTINTORES PAMPLONA, S.L.", "Fireprotect"]
 *   - "ELDUR SEGURIDAD, S.L. / ELDUR INGENIERIA, S.L." → ["ELDUR SEGURIDAD, S.L.", "ELDUR INGENIERIA, S.L."]
 *   - "TRATEIN PCI INSTALACIONES, S.L." → ["TRATEIN PCI INSTALACIONES, S.L."]
 *   - "ASHER (proyecto)" → ["ASHER"]  (el paréntesis informativo se descarta)
 */
function extraerCandidatos(empresaRaw: string): string[] {
  const candidatos: string[] = [];

  // Principal: lo que hay antes del primer paréntesis
  const principal = empresaRaw.split("(")[0].trim().replace(/[,.]$/, "");
  // Si hay " / " en el principal, split en partes
  for (const part of principal.split(/\s*\/\s*/)) {
    const c = part.trim();
    if (c.length > 2) candidatos.push(c);
  }

  // Aliases en paréntesis (ignorar los que son meta-info como "(proyecto)", "(pendiente NDA)")
  const parens = empresaRaw.match(/\(([^)]+)\)/g);
  if (parens) {
    for (const p of parens) {
      const inner = p.slice(1, -1).trim();
      if (/proyecto|pendiente|HoT|opera como|v[íi]a|lead/i.test(inner)) continue;
      // Split por "/" si hay varios alias en el mismo paréntesis
      for (const part of inner.split(/\s*\/\s*/)) {
        const c = part.trim().replace(/^[–-]\s*/, "");
        if (c.length > 2) candidatos.push(c);
      }
    }
  }

  return [...new Set(candidatos)];
}

/** Match en cascada empresa Excel → Empresa BD. */
async function matchEmpresa(
  row: ExcelRow
): Promise<EmpresaMatch | "ambiguous" | "none"> {
  // 1. Por Ref. Roll-up vía OneDrive URL
  const ref = row.ref;
  if (ref && /^\d+/.test(ref)) {
    // ref tipo "29. Tratein" → la carpeta OneDrive del target empieza por "29."
    // La URL es algo como `.../29. Tratein/...`. Hacemos contains case-insensitive.
    const refPattern = ref.replace(/\s+/g, " ").trim();
    const candidates = await prisma.empresa.findMany({
      where: {
        oneDriveUrl: { contains: refPattern, mode: "insensitive" },
      },
      select: { id: true, nombre: true },
      take: 5,
    });
    if (candidates.length === 1) {
      return {
        empresaId: candidates[0].id,
        empresaNombre: candidates[0].nombre,
        via: "onedrive",
      };
    }
    if (candidates.length > 1) return "ambiguous";
  }

  // 2-4. Por nombre / alias / normalizado
  const candidatos = extraerCandidatos(row.empresa);

  for (const candidato of candidatos) {
    // Match exacto case-insensitive
    const exact = await prisma.empresa.findFirst({
      where: { nombre: { equals: candidato, mode: "insensitive" } },
      select: { id: true, nombre: true },
    });
    if (exact) {
      return {
        empresaId: exact.id,
        empresaNombre: exact.nombre,
        via: candidato === candidatos[0] ? "nombre_exact" : "alias_paren",
      };
    }
  }

  // Match por nombre normalizado (quita sufijos jurídicos + tildes)
  for (const candidato of candidatos) {
    const candNorm = normalizePersona(candidato, true);
    if (candNorm.length < 4) continue; // muy corto, riesgo de falsos positivos

    // Buscar candidatos cuyo primer token coincida (filtro inicial barato).
    // take amplio (500) para no perder matches cuando el primer token es común
    // como "SEGURIDAD" o "PROTECCION" (cientos de empresas).
    const firstToken = candNorm.split(/\s+/)[0];
    const pool = await prisma.empresa.findMany({
      where: { nombre: { contains: firstToken, mode: "insensitive" } },
      select: { id: true, nombre: true },
      take: 500,
    });
    const matches = pool.filter(
      (e) => normalizePersona(e.nombre, true) === candNorm
    );
    if (matches.length === 1) {
      return {
        empresaId: matches[0].id,
        empresaNombre: matches[0].nombre,
        via: "nombre_norm",
      };
    }
    if (matches.length > 1) return "ambiguous";
  }

  // Match por palabra distintiva única: si una palabra >= 5 chars del nombre
  // del Excel (excluyendo palabras genéricas del dominio como SEGURIDAD,
  // PROTECCION, etc.) aparece como substring en EXACTAMENTE una empresa de
  // BD, asumimos que es la misma. Cubre casos donde el nombre del Excel y
  // el de BD difieren en orden/cantidad de palabras (ej. "DASIT SERVICIOS
  // INTEGRALES, S.A." en Excel vs "DASIT, S.A." en BD).
  for (const candidato of candidatos) {
    const candNorm = normalizePersona(candidato, true);
    const distintivas = candNorm
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !PALABRAS_GENERICAS.has(w));
    for (const palabra of distintivas) {
      const matches = await prisma.empresa.findMany({
        where: { nombre: { contains: palabra, mode: "insensitive" } },
        select: { id: true, nombre: true },
        take: 5,
      });
      if (matches.length === 1) {
        return {
          empresaId: matches[0].id,
          empresaNombre: matches[0].nombre,
          via: "palabra_distintiva",
        };
      }
    }
  }

  return "none";
}

async function main() {
  console.log(
    APPLY
      ? "🛠️  Modo APLICAR — los contactos se crearán en BD."
      : "🔍 Modo dry-run — no se modifica nada. Usa APPLY=1 para aplicar."
  );
  console.log(`📄 Leyendo: ${FILE}\n`);

  const wb = XLSX.readFile(FILE);
  const sheetName = "Contactos Targets PCI";
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    throw new Error(
      `No se encontró la hoja "${sheetName}". Hojas disponibles: ${wb.SheetNames.join(", ")}`
    );
  }

  // Convertir a JSON con headers en la primera fila
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  });

  // Mapear columnas (los nombres pueden variar ligeramente; matcheamos por substring)
  const rows: ExcelRow[] = raw.flatMap((r) => {
    const keys = Object.keys(r);
    const find = (substr: string) => {
      const k = keys.find((k) => k.toLowerCase().includes(substr.toLowerCase()));
      return k ? clean(r[k]) : null;
    };
    const contacto = find("contacto");
    const empresa = find("empresa");
    if (!contacto || !empresa) return [];
    return [{
      ref: find("ref") ?? "",
      empresa: empresa,
      contacto: contacto,
      cargo: find("rol") ?? find("cargo"),
      email: find("email")?.toLowerCase() ?? null,
      telefono: find("teléfono") ?? find("telefono"),
      fuente: find("fuente"),
      notas: find("notas"),
    }];
  });

  console.log(`📋 ${rows.length} filas con contacto + empresa\n`);

  const stats = {
    crear: 0,
    skip_existe: 0,
    skip_ambiguous: 0,
    skip_no_empresa: 0,
  };
  const sinMatch: string[] = [];
  const ambiguos: string[] = [];

  // Agrupar por empresa para imprimir secciones legibles
  const porEmpresa = new Map<string, ExcelRow[]>();
  for (const row of rows) {
    const key = row.empresa;
    if (!porEmpresa.has(key)) porEmpresa.set(key, []);
    porEmpresa.get(key)!.push(row);
  }

  for (const [empresaExcel, rowList] of porEmpresa) {
    const match = await matchEmpresa(rowList[0]);

    console.log(`━━━ ${empresaExcel} (${rowList.length} contacto/s) ━━━`);

    if (match === "ambiguous") {
      console.log(`  ⚠️  Match ambiguo (>1 empresa). Skipping.`);
      ambiguos.push(empresaExcel);
      stats.skip_ambiguous += rowList.length;
      continue;
    }
    if (match === "none") {
      console.log(`  ❌ Sin match. Skipping.`);
      sinMatch.push(empresaExcel);
      stats.skip_no_empresa += rowList.length;
      continue;
    }

    console.log(
      `  ✓ Matched → [${match.empresaId}] ${match.empresaNombre} (via ${match.via})`
    );

    for (const row of rowList) {
      // ¿Ya existe ese contacto en esa empresa? (por nombre exact case-insensitive
      // O por email exact case-insensitive si hay email)
      const orClauses: Array<Record<string, unknown>> = [
        { nombre: { equals: row.contacto, mode: "insensitive" } },
      ];
      if (row.email) {
        orClauses.push({ email: { equals: row.email, mode: "insensitive" } });
      }
      const existing = await prisma.contacto.findFirst({
        where: { empresaId: match.empresaId, OR: orClauses },
        select: { id: true, nombre: true, email: true },
      });

      if (existing) {
        console.log(
          `    ⏭  Ya existe (Contacto.id=${existing.id}: "${existing.nombre}" / ${existing.email ?? "—"}): ${row.contacto}`
        );
        stats.skip_existe++;
        continue;
      }

      const flags: string[] = [];
      if (!row.email) flags.push("sin email");
      if (!row.telefono) flags.push("sin tel");
      const flagsStr = flags.length > 0 ? ` (${flags.join(", ")})` : "";

      console.log(
        `    ➕ ${row.contacto} | ${row.cargo ?? "—"} | ${row.email ?? "—"}${flagsStr}`
      );
      stats.crear++;

      if (APPLY) {
        const notasParts = [
          row.fuente ? `Fuente: ${row.fuente}` : null,
          row.notas,
        ].filter(Boolean);
        await prisma.contacto.create({
          data: {
            empresaId: match.empresaId,
            nombre: row.contacto,
            cargo: row.cargo,
            email: row.email,
            telefono: row.telefono,
            notas: notasParts.length > 0 ? notasParts.join("\n") : null,
          },
        });
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Resumen:`);
  console.log(
    `   ${stats.crear} contactos a crear ${APPLY ? "(aplicados)" : "(dry-run)"}`
  );
  console.log(`   ${stats.skip_existe} ya existían (skip)`);
  console.log(`   ${stats.skip_ambiguous} en empresa con match ambiguo`);
  console.log(`   ${stats.skip_no_empresa} en empresa sin match`);

  if (sinMatch.length > 0) {
    console.log(`\n⚠️  Empresas SIN match (revisar manualmente):`);
    for (const e of sinMatch) console.log(`   - ${e}`);
  }
  if (ambiguos.length > 0) {
    console.log(`\n⚠️  Empresas con match AMBIGUO (varias coincidencias):`);
    for (const e of ambiguos) console.log(`   - ${e}`);
  }

  if (!APPLY && stats.crear > 0) {
    console.log(
      `\nPara aplicar: \`APPLY=1 npx tsx scripts/import-contactos-excel.ts\``
    );
  }
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
