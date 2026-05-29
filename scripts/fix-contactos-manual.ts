/**
 * fix-contactos-manual.ts
 *
 * Correcciones manuales de contactos (cargo / notas / nombre + altas) dictadas
 * por Alberto el 2026-05-29 en el chat. La fuente de verdad es la BD (NO el
 * Excel): este script aplica exactamente lo indicado, por Contacto.id, con un
 * guard `expect` (substring del nombre actual) para abortar si un id no
 * corresponde a quien creemos.
 *
 * Dry-run por defecto. APPLY=1 para escribir.
 * NOTAS_REPLACE=1 → reemplaza el campo notas; por defecto añade la nota nueva
 * delante y conserva el texto existente (p.ej. la línea "Fuente: ...").
 *
 *   npx tsx scripts/fix-contactos-manual.ts                  (dry-run)
 *   APPLY=1 npx tsx scripts/fix-contactos-manual.ts          (aplica, notas append)
 *   APPLY=1 NOTAS_REPLACE=1 npx tsx scripts/fix-contactos-manual.ts
 */
import { prisma } from "../src/lib/prisma";

const APPLY = process.env.APPLY === "1";
const NOTAS_REPLACE = process.env.NOTAS_REPLACE === "1";

interface Upd {
  id: number;
  expect: string; // substring del nombre actual — guard anti-id-erróneo
  nombre?: string; // si se renombra
  cargo?: string | null; // null = vaciar
  notas?: string; // nota nueva
}
interface New {
  siblingId: number; // empresa = la del contacto hermano
  nombre: string;
  cargo?: string;
  email?: string;
  notas?: string;
}

const updates: Upd[] = [
  // ── Tratein ──
  { id: 2, expect: "Feltrero", cargo: "Apoderado Solidario", notas: "70% de las acciones" },
  { id: 3, expect: "Herrero", cargo: "Administrador Único", notas: "15% de las acciones" },
  { id: 4, expect: "García López", cargo: "Apoderado Solidario", notas: "15% de las acciones" },
  // ── MCI Cosmos ──
  { id: 5, expect: "Serrano", cargo: "Administrador único / Vendedor" },
  // ── Lula ──
  { id: 6, expect: "Zafra", cargo: "Socio", notas: "OVIDI INVERSIONS, S.L." },
  { id: 7, expect: "Francesc", cargo: "Socio", notas: "MIKA'N MIKA, S.L." },
  { id: 8, expect: "David Jiménez", cargo: "Socio", notas: "AMG COSTA BRAVA 2004, S.L." },
  // ── Seguridad Velar (OK: valores del dry-run) ──
  { id: 9, expect: "Lorenzo Vela", cargo: "Administrador / Vendedor" },
  { id: 10, expect: "Adrián Vela", cargo: "Familiar / segunda generación" },
  // ── Seyman ──
  { id: 11, expect: "Velasco", cargo: "Gerente y socio" },
  { id: 12, expect: "Martín", cargo: "Socio" },
  // ── DASIT (Carlos Martínez García, id 16, NO se toca) ──
  { id: 13, expect: "Manuel Ruiz", cargo: "Socio" },
  { id: 14, expect: "Javierre", cargo: "Socio" },
  { id: 15, expect: "Yolanda", cargo: "Socio" },
  // ── Aize Bua (OK) ──
  { id: 18, expect: "Aira", cargo: "Gerente / Vendedor" },
  // ── Firex ──
  { id: 19, expect: "Ángel Vela", cargo: "Gerente y socio único" },
  // ── Protel (id 20) NO se toca ──
  // ── APAGA-FOC ──
  { id: 21, expect: "Marcos Moreno", cargo: "Gerente" },
  // ── Sugain (rename + cargo) ──
  { id: 22, expect: "Alberto", nombre: "Alberto Blanco Estébanez", cargo: "Gerente y Socio" },
  { id: 23, expect: "Saioa", nombre: "Saioa Urrestarazu Aguirre", cargo: "Socio y encargada de administración" },
  // ── Castellana (OK) ──
  { id: 24, expect: "Alfredo Medel", cargo: "Vendedor — Admin. Solidario (fundador, 1987)" },
  { id: 25, expect: "Gil Triana", cargo: "Vendedor — Admin. Solidario (cofundador)" },
  { id: 26, expect: "Presencio", cargo: "Vendedor" },
  { id: 27, expect: "Palacios", cargo: "Vendedor" },
  { id: 28, expect: "Gil Olalla", cargo: "Gerente Compañía — hijo Alfredo Gil (NO vendedor)" },
  { id: 29, expect: "Medel Díez", cargo: "Director área Seguridad — hijo Alfredo Medel (NO vendedor)" },
  // ── Orsei (OK) ──
  { id: 30, expect: "Seijas", cargo: "Vendedor — Administrador / Interlocutor principal" },
  { id: 31, expect: "Álvarez", cargo: "Vendedora — accionista (esposa de David)" },
  // ── Fireprotect (rename placeholder → Ramón) ──
  { id: 32, expect: "pendiente de identificar", nombre: "Ramón Urdaniz Murga", cargo: "Gerente y Socio" },
  // ── Catalana (Email genérico id 35 NO se toca) ──
  { id: 33, expect: "Carlos Ramos", cargo: "Socio", notas: "interlocutor principal" },
  { id: 34, expect: "Marta Ramos", cargo: "Socio", notas: "Directora financiera" },
  // ── Eldur ──
  { id: 36, expect: "Callejo", cargo: "Socio y Gerente" },
  // ── Point Fire (OK) ──
  { id: 37, expect: "Admin pendiente", cargo: "Admin. — sin NDA visible en mi acceso" },
  // ── Berini (OK: cargo vacío) ──
  { id: 38, expect: "Contacto pendiente", cargo: null },
];

const creates: New[] = [
  { siblingId: 5, nombre: "Borja Armañanzas Guisasola", cargo: "Asesor", email: "barmananzas@icaestella.com" },
  { siblingId: 5, nombre: "Estela", cargo: "Asesor", email: "estela@ateasesores.com" },
  { siblingId: 22, nombre: "Maria Rosario Blanco Estébanez", cargo: "Socio" },
  { siblingId: 32, nombre: "Ricardo Viejo", cargo: "Gerente y Socio" },
];

function mergeNotas(existing: string | null, nueva: string): string {
  if (NOTAS_REPLACE || !existing) return nueva;
  if (existing.includes(nueva)) return existing;
  return `${nueva}\n${existing}`;
}

async function main() {
  console.log(APPLY ? "🛠️  APLICAR — escribe en BD." : "🔍 dry-run — no escribe. APPLY=1 para aplicar.");
  console.log(`notas: ${NOTAS_REPLACE ? "REEMPLAZAR" : "añadir nota nueva + conservar existente"}\n`);

  let okU = 0;
  let warn = 0;
  console.log("━━━ Updates ━━━");
  for (const u of updates) {
    const c = await prisma.contacto.findUnique({
      where: { id: u.id },
      select: { id: true, nombre: true, cargo: true, notas: true },
    });
    if (!c) {
      console.log(`  ⚠️  id=${u.id} NO existe — SKIP`);
      warn++;
      continue;
    }
    if (!c.nombre.toLowerCase().includes(u.expect.toLowerCase())) {
      console.log(`  ⚠️  id=${u.id} nombre="${c.nombre}" no contiene "${u.expect}" — SKIP por seguridad`);
      warn++;
      continue;
    }

    const data: Record<string, unknown> = {};
    if (u.nombre !== undefined && u.nombre !== c.nombre) data.nombre = u.nombre;
    if (u.cargo !== undefined && u.cargo !== c.cargo) data.cargo = u.cargo;
    if (u.notas !== undefined) {
      const merged = mergeNotas(c.notas, u.notas);
      if (merged !== c.notas) data.notas = merged;
    }

    if (Object.keys(data).length === 0) {
      console.log(`  ·  id=${u.id} ${c.nombre}: sin cambios`);
      continue;
    }

    console.log(`  ✏️  id=${u.id} ${c.nombre}`);
    if ("nombre" in data) console.log(`        nombre: "${c.nombre}" → "${data.nombre as string}"`);
    if ("cargo" in data) console.log(`        cargo:  "${c.cargo ?? "—"}" → "${(data.cargo as string) ?? "—"}"`);
    if ("notas" in data)
      console.log(`        notas:  ${JSON.stringify(c.notas ?? "—")} → ${JSON.stringify(data.notas)}`);
    okU++;
    if (APPLY) await prisma.contacto.update({ where: { id: u.id }, data });
  }

  let okC = 0;
  console.log("\n━━━ Altas ━━━");
  for (const n of creates) {
    const sib = await prisma.contacto.findUnique({
      where: { id: n.siblingId },
      select: { empresaId: true, empresa: { select: { nombre: true } } },
    });
    if (!sib) {
      console.log(`  ⚠️  hermano id=${n.siblingId} no existe — SKIP ${n.nombre}`);
      warn++;
      continue;
    }
    const orClauses: Array<Record<string, unknown>> = [
      { nombre: { equals: n.nombre, mode: "insensitive" } },
    ];
    if (n.email) orClauses.push({ email: { equals: n.email, mode: "insensitive" } });
    const dup = await prisma.contacto.findFirst({
      where: { empresaId: sib.empresaId, OR: orClauses },
      select: { id: true },
    });
    if (dup) {
      console.log(`  ⏭  ya existe (id=${dup.id}): ${n.nombre} @ ${sib.empresa.nombre}`);
      continue;
    }
    console.log(
      `  ➕  ${n.nombre} | ${n.cargo ?? "—"} | ${n.email ?? "—"} → [${sib.empresaId}] ${sib.empresa.nombre}`
    );
    okC++;
    if (APPLY) {
      await prisma.contacto.create({
        data: {
          empresaId: sib.empresaId,
          nombre: n.nombre,
          cargo: n.cargo ?? null,
          email: n.email ?? null,
          notas: n.notas ?? null,
        },
      });
    }
  }

  console.log(
    `\n📊 ${okU} updates, ${okC} altas${warn ? `, ${warn} ⚠️ revisar` : ""} ${APPLY ? "(APLICADO)" : "(dry-run)"}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
