/**
 * Carga la extracción de SABI/Informa con las cuentas anuales (oct 2026).
 *
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/import-sabi-financieros.ts <extraccion.xlsx>            # simulación
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/import-sabi-financieros.ts <extraccion.xlsx> --apply    # escribe
 *
 * Opciones: --fecha AAAA-MM-DD (fecha de la extracción; por defecto, hoy)
 *           --hoja "Copia Valores" (pestaña con valores; la de fórmulas viene sin caché)
 *           --informe <ruta.csv> (detalle por empresa de lo que cambia)
 *
 * Qué hace:
 *   1. Guarda el estado de SABI (activa, disuelta, no encontrada…) en TODAS las
 *      empresas del Excel. Ninguna sale del universo: siguen buscables.
 *   2. Solo para activas y en concurso: upsert de Financiero por año
 *      (ingresos = Importe neto de la cifra de negocios, margenBruto =
 *      Resultado bruto de SABI, EBITDA, resultado neto) y empleados del
 *      último año. Un dato que SABI no trae no pisa el que ya había.
 *   3. El resto (disueltas, no encontradas…) conserva su histórico; la ficha
 *      avisa del estado y de la antigüedad de las cuentas.
 *   4. Borra los años que quedan con «Ingresos de explotación» (fuente
 *      informa_2026, seguridad electrónica, abril 2026) y que SABI no ha
 *      sustituido, para que ningún ingreso de la base use esa definición
 *      (decisión de Alberto, 23/10/2026). Si la empresa se queda sin años,
 *      la ficha dice que no hay información financiera.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { readWorkbook } from "./lib/excel";
import { mapearColumnas, parsearFila, type FilaSabi } from "../src/lib/sabi-financieros";
import { cargaFinancieros, type EstadoEmpresa } from "../src/lib/empresa-estado";

const prisma = new PrismaClient();
const FUENTE = "sabi_2610";
const CHUNK = 500;

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const RUTA = args.find((a) => !a.startsWith("--") && a !== opt("--fecha") && a !== opt("--hoja") && a !== opt("--informe"));
const APPLY = args.includes("--apply");
const FECHA = new Date(`${opt("--fecha") ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
const HOJA = opt("--hoja") ?? "Copia Valores";
const INFORME = opt("--informe");

const log = (...p: unknown[]) => console.log(...p);
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.abs(a - b) / Math.abs(b));

async function leer(): Promise<FilaSabi[]> {
  if (!RUTA) throw new Error("Uso: import-sabi-financieros.ts <extraccion.xlsx> [--apply]");
  const libro = await readWorkbook(path.resolve(RUTA));
  const hoja = libro.find((h) => h.sheet === HOJA);
  if (!hoja) throw new Error(`No existe la pestaña «${HOJA}» (hay: ${libro.map((h) => h.sheet).join(", ")})`);
  const iCab = hoja.data.findIndex((r) => String(r[0] ?? "").trim().toUpperCase() === "CIF");
  if (iCab === -1) throw new Error("No encuentro la fila de cabecera (columna A = «CIF»)");
  const cols = mapearColumnas(hoja.data[iCab]);
  return hoja.data
    .slice(iCab + 1)
    .map((r) => parsearFila(r, cols))
    .filter((r): r is FilaSabi => r !== null);
}

async function main() {
  log(APPLY ? "== APLICANDO ==" : "== SIMULACIÓN (usa --apply para escribir) ==");
  log(`Extracción: ${RUTA} · pestaña «${HOJA}» · fecha ${FECHA.toISOString().slice(0, 10)}\n`);

  const filas = await leer();
  const empresas = await prisma.empresa.findMany({
    select: {
      id: true, cif: true, nombre: true, sector: true, empleados: true,
      financieros: { select: { anio: true, ingresos: true, margenBruto: true, ebitda: true, resultadoNeto: true, fuente: true } },
    },
  });
  const porCif = new Map(empresas.map((e) => [e.cif.trim().toUpperCase(), e]));

  const cifsRepetidos = filas.length - new Set(filas.map((f) => f.cif)).size;
  if (cifsRepetidos > 0) throw new Error(`${cifsRepetidos} CIFs repetidos en el Excel`);

  const sinEmpresa: string[] = [];
  const porEstado = new Map<EstadoEmpresa, number>();
  const estados: { id: number; estado: EstadoEmpresa }[] = [];
  const upserts: { empresaId: number; a: FilaSabi["anios"][number] }[] = [];
  const empleados: { id: number; n: number }[] = [];
  const informe: string[] = ["cif;nombre;sector;estado;ultimoAnio;anio;accion;ingresosAntes;ingresosSabi"];
  let nuevos = 0, actualizados = 0, cambiaIngresos = 0, empleadosCambian = 0;
  const aniosNuevos = new Map<number, number>();
  let activasSinCifras = 0;

  for (const f of filas) {
    const e = porCif.get(f.cif);
    if (!e) { sinEmpresa.push(f.cif); continue; }
    porEstado.set(f.estado, (porEstado.get(f.estado) ?? 0) + 1);
    estados.push({ id: e.id, estado: f.estado });
    if (!cargaFinancieros(f.estado)) continue;
    if (f.anios.length === 0) activasSinCifras++;

    for (const a of f.anios) {
      const antes = e.financieros.find((x) => x.anio === a.anio);
      upserts.push({ empresaId: e.id, a });
      if (!antes) {
        nuevos++;
        aniosNuevos.set(a.anio, (aniosNuevos.get(a.anio) ?? 0) + 1);
      } else {
        actualizados++;
        if (a.ingresos !== null && antes.ingresos !== null && pct(a.ingresos, antes.ingresos) > 0.01) cambiaIngresos++;
      }
      informe.push([f.cif, `"${e.nombre.replace(/"/g, "'")}"`, e.sector, f.estado, f.ultimoAnio, a.anio,
        antes ? "actualiza" : "crea", antes?.ingresos ?? "", a.ingresos ?? ""].join(";"));
    }
    if (f.empleados !== null) {
      empleados.push({ id: e.id, n: f.empleados });
      if (e.empleados !== f.empleados) empleadosCambian++;
    }
  }

  // Seguridad electrónica que se queda con «Ingresos de explotación» (abril 2026)
  const tocados = new Set(upserts.map((u) => `${u.empresaId}:${u.a.anio}`));
  const restoInforma = empresas.filter((e) =>
    e.financieros.some((x) => x.fuente === "informa_2026" && !tocados.has(`${e.id}:${x.anio}`))
  );

  log("Estado según SABI:");
  for (const [k, v] of [...porEstado].sort((a, b) => b[1] - a[1])) log(`  ${k.padEnd(14)} ${v}`);
  log(`\nCIFs del Excel que no están en la base: ${sinEmpresa.length}${sinEmpresa.length ? " → " + sinEmpresa.slice(0, 10).join(", ") : ""}`);
  log(`\nFinancieros (solo activas y en concurso):`);
  log(`  años nuevos ........... ${nuevos}  ${[...aniosNuevos].sort().map(([a, n]) => `${a}:${n}`).join(" ")}`);
  log(`  años que se actualizan  ${actualizados}  (ingresos cambian >1 %: ${cambiaIngresos})`);
  log(`  activas sin ningún año con cifras: ${activasSinCifras}`);
  log(`  empleados: ${empleados.length} con dato, ${empleadosCambian} cambian`);
  const borrarInforma = restoInforma.flatMap((e) =>
    e.financieros
      .filter((x) => x.fuente === "informa_2026" && !tocados.has(`${e.id}:${x.anio}`))
      .map((x) => ({ empresaId: e.id, anio: x.anio }))
  );
  log(`\nAños con «Ingresos de explotación» que SABI no sustituye → se borran ${borrarInforma.length} (${restoInforma.length} empresas):`);
  for (const e of restoInforma) {
    const anios = borrarInforma.filter((x) => x.empresaId === e.id).map((x) => x.anio);
    const queda = anios.length === e.financieros.length ? " → sin financieros" : "";
    log(`  ${e.cif} ${e.nombre.slice(0, 40).padEnd(40)} ${anios.join(",")}${queda}`);
  }

  if (INFORME) {
    fs.writeFileSync(INFORME, informe.join("\n"), "utf8");
    log(`\nDetalle por empresa y año → ${INFORME}`);
  }

  if (!APPLY) { await prisma.$disconnect(); return; }

  // Todo en una transacción: o entra la extracción entera o no entra nada.
  await prisma.$transaction(async (tx) => {
  // 1. Estado: un UPDATE por estado.
  for (const estado of new Set(estados.map((x) => x.estado))) {
    const ids = estados.filter((x) => x.estado === estado).map((x) => x.id);
    await tx.empresa.updateMany({ where: { id: { in: ids } }, data: { estado, estadoAt: FECHA } });
  }
  log(`\n✓ estado guardado en ${estados.length} empresas`);

  // 2. Financieros: INSERT … ON CONFLICT en bloques. Un dato que SABI no trae
  //    (null) no pisa el existente.
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const filasSql = upserts.slice(i, i + CHUNK).map(({ empresaId, a }) =>
      Prisma.sql`(${empresaId}, ${a.anio}, ${a.ingresos}::float8, ${a.margenBruto}::float8, ${a.ebitda}::float8, ${a.resultadoNeto}::float8, ${FUENTE}, now())`
    );
    await tx.$executeRaw`
      INSERT INTO "Financiero" ("empresaId", anio, ingresos, "margenBruto", ebitda, "resultadoNeto", fuente, "updatedAt")
      VALUES ${Prisma.join(filasSql)}
      ON CONFLICT ("empresaId", anio) DO UPDATE SET
        ingresos        = COALESCE(EXCLUDED.ingresos, "Financiero".ingresos),
        "margenBruto"   = COALESCE(EXCLUDED."margenBruto", "Financiero"."margenBruto"),
        ebitda          = COALESCE(EXCLUDED.ebitda, "Financiero".ebitda),
        "resultadoNeto" = COALESCE(EXCLUDED."resultadoNeto", "Financiero"."resultadoNeto"),
        fuente          = EXCLUDED.fuente,
        "updatedAt"     = now()`;
  }
  log(`✓ ${upserts.length} años de financieros escritos`);

  // 3. Empleados del último año disponible.
  for (let i = 0; i < empleados.length; i += CHUNK) {
    const v = empleados.slice(i, i + CHUNK).map((x) => Prisma.sql`(${x.id}::int, ${x.n}::int)`);
    await tx.$executeRaw`
      UPDATE "Empresa" e SET empleados = v.n, "updatedAt" = now()
      FROM (VALUES ${Prisma.join(v)}) AS v(id, n) WHERE e.id = v.id`;
  }
  log(`✓ empleados actualizados en ${empleados.length} empresas`);

  // 4. Años con «Ingresos de explotación» que SABI no ha sustituido.
  if (borrarInforma.length > 0) {
    const borrados = await tx.financiero.deleteMany({
      where: { OR: borrarInforma.map((x) => ({ ...x, fuente: "informa_2026" })) },
    });
    log(`✓ ${borrados.count} años de «Ingresos de explotación» borrados`);
  }
  }, { timeout: 600_000, maxWait: 30_000 });

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});
