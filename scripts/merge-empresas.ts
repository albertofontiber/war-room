/**
 * Merge atómico de dos empresas duplicadas. Mueve TODAS las relaciones del
 * secundario al principal y borra el secundario.
 *
 * Uso:
 *   npx tsx scripts/merge-empresas.ts --principal=1608 --secundario=4447
 *   npx tsx scripts/merge-empresas.ts --principal=1608 --secundario=4447 --dry
 *
 * El flag `--dry` ejecuta toda la lógica dentro de una transacción y la
 * revierte al final, mostrando qué iba a pasar sin tocar BD.
 *
 * Campos del Empresa principal que se completan SOLO si están vacíos
 * (null/false/empty): descripcion, cepreven, aerme, finderSourceId,
 * oneDriveUrl, notionUrl, nombreComercial, anioConstitucion, ambitoGeo,
 * web, linkedin, logoUrl. El cif/nombre del principal SIEMPRE se respetan
 * (para fusionar "X-12345" en "X12345" mantén "X12345" como principal).
 *
 * Conflictos manejados:
 *   - Financiero @@unique([empresaId, anio]): se descarta el del secundario
 *     si el principal ya tiene ese año (no sobreescribe).
 *   - PersonaCargo @@unique([empresaId, nombreNorm]): mismo criterio.
 *   - CrmEstado empresaId @unique: si principal ya tiene crmEstado, se
 *     descarta el del secundario (no se fusionan dealStages — es mejor
 *     manual si difieren).
 */

import { prisma } from "../src/lib/prisma";

type Args = { principal: number; secundario: number; dry: boolean };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let principal = NaN;
  let secundario = NaN;
  let dry = false;
  for (const a of args) {
    if (a.startsWith("--principal=")) principal = parseInt(a.split("=")[1], 10);
    else if (a.startsWith("--secundario=")) secundario = parseInt(a.split("=")[1], 10);
    else if (a === "--dry") dry = true;
  }
  if (!Number.isFinite(principal) || !Number.isFinite(secundario)) {
    console.error("Uso: --principal=ID --secundario=ID [--dry]");
    process.exit(1);
  }
  if (principal === secundario) {
    console.error("Principal y secundario deben ser distintos");
    process.exit(1);
  }
  return { principal, secundario, dry };
}

async function main() {
  const { principal, secundario, dry } = parseArgs();
  console.log(`\nMerge: principal=${principal} ← secundario=${secundario}${dry ? " (DRY RUN)" : ""}\n`);

  await prisma.$transaction(
    async (tx) => {
      const p = await tx.empresa.findUnique({ where: { id: principal } });
      const s = await tx.empresa.findUnique({ where: { id: secundario } });
      if (!p) throw new Error(`Empresa principal ${principal} no encontrada`);
      if (!s) throw new Error(`Empresa secundario ${secundario} no encontrada`);

      console.log(`  Principal:  [${p.id}] CIF="${p.cif}" "${p.nombre}"`);
      console.log(`  Secundario: [${s.id}] CIF="${s.cif}" "${s.nombre}"\n`);

      // ─── 1. Relaciones simples (UPDATE empresaId del secundario al principal) ──
      const updates: Record<string, number> = {};

      updates["Tarea"] = (
        await tx.tarea.updateMany({ where: { empresaId: secundario }, data: { empresaId: principal } })
      ).count;
      updates["Nota"] = (
        await tx.nota.updateMany({ where: { empresaId: secundario }, data: { empresaId: principal } })
      ).count;
      updates["BormeAlerta"] = (
        await tx.bormeAlerta.updateMany({
          where: { empresaId: secundario },
          data: { empresaId: principal },
        })
      ).count;
      updates["BormePersona"] = (
        await tx.bormePersona.updateMany({
          where: { empresaId: secundario },
          data: { empresaId: principal },
        })
      ).count;
      updates["FinderNote"] = (
        await tx.finderNote.updateMany({
          where: { empresaId: secundario },
          data: { empresaId: principal },
        })
      ).count;
      updates["TargetProposal"] = (
        await tx.targetProposal.updateMany({
          where: { empresaId: secundario },
          data: { empresaId: principal },
        })
      ).count;
      updates["CrmLog"] = (
        await tx.crmLog.updateMany({
          where: { empresaId: secundario },
          data: { empresaId: principal },
        })
      ).count;
      updates["Contacto"] = (
        await tx.contacto.updateMany({
          where: { empresaId: secundario },
          data: { empresaId: principal },
        })
      ).count;
      // EmailIngest tiene empresaId denormalizado (no FK con cascade). Si lo
      // usaste alguna vez, mover los registros también.
      updates["EmailIngest"] = (
        await tx.emailIngest.updateMany({
          where: { empresaId: secundario },
          data: { empresaId: principal },
        })
      ).count;

      // ─── 2. Financiero respetando unique [empresaId, anio] ──────────────────
      const finsSec = await tx.financiero.findMany({
        where: { empresaId: secundario },
        select: { id: true, anio: true },
      });
      const principalAnios = new Set(
        (
          await tx.financiero.findMany({
            where: { empresaId: principal },
            select: { anio: true },
          })
        ).map((f) => f.anio)
      );
      let finsMoved = 0;
      let finsDiscarded = 0;
      for (const f of finsSec) {
        if (principalAnios.has(f.anio)) {
          // Conflicto: el principal ya tiene ese año → descartamos el del secundario.
          await tx.financiero.delete({ where: { id: f.id } });
          finsDiscarded++;
        } else {
          await tx.financiero.update({
            where: { id: f.id },
            data: { empresaId: principal },
          });
          finsMoved++;
        }
      }
      updates["Financiero (moved)"] = finsMoved;
      updates["Financiero (discarded by year conflict)"] = finsDiscarded;

      // ─── 3. PersonaCargo respetando unique [empresaId, nombreNorm] ──────────
      const pcSec = await tx.personaCargo.findMany({
        where: { empresaId: secundario },
        select: { id: true, nombreNorm: true },
      });
      const principalPcKeys = new Set(
        (
          await tx.personaCargo.findMany({
            where: { empresaId: principal },
            select: { nombreNorm: true },
          })
        ).map((p) => p.nombreNorm)
      );
      let pcMoved = 0;
      let pcDiscarded = 0;
      for (const pc of pcSec) {
        if (principalPcKeys.has(pc.nombreNorm)) {
          await tx.personaCargo.delete({ where: { id: pc.id } });
          pcDiscarded++;
        } else {
          await tx.personaCargo.update({
            where: { id: pc.id },
            data: { empresaId: principal },
          });
          pcMoved++;
        }
      }
      updates["PersonaCargo (moved)"] = pcMoved;
      updates["PersonaCargo (discarded as duplicate)"] = pcDiscarded;

      // ─── 4. CrmEstado: solo si principal no tiene ────────────────────────────
      const crmP = await tx.crmEstado.findUnique({ where: { empresaId: principal } });
      const crmS = await tx.crmEstado.findUnique({ where: { empresaId: secundario } });
      if (crmS && !crmP) {
        await tx.crmEstado.update({
          where: { empresaId: secundario },
          data: { empresaId: principal },
        });
        updates["CrmEstado (moved)"] = 1;
      } else if (crmS && crmP) {
        await tx.crmEstado.delete({ where: { empresaId: secundario } });
        updates["CrmEstado (discarded — principal ya tiene)"] = 1;
      }

      // ─── 5. Copiar campos selectivos solo si el principal está vacío ────────
      type EmpresaPatch = {
        descripcion?: string;
        cepreven?: string;
        aerme?: boolean;
        finderSourceId?: string;
        oneDriveUrl?: string;
        notionUrl?: string;
        nombreComercial?: string;
        anioConstitucion?: number;
        ambitoGeo?: string;
        web?: string;
        linkedin?: string;
        logoUrl?: string;
      };
      const patch: EmpresaPatch = {};
      if (!p.descripcion && s.descripcion) patch.descripcion = s.descripcion;
      if (!p.cepreven && s.cepreven) patch.cepreven = s.cepreven;
      if (!p.aerme && s.aerme) patch.aerme = s.aerme;
      if (!p.finderSourceId && s.finderSourceId) patch.finderSourceId = s.finderSourceId;
      if (!p.oneDriveUrl && s.oneDriveUrl) patch.oneDriveUrl = s.oneDriveUrl;
      if (!p.notionUrl && s.notionUrl) patch.notionUrl = s.notionUrl;
      if (!p.nombreComercial && s.nombreComercial) patch.nombreComercial = s.nombreComercial;
      if (!p.anioConstitucion && s.anioConstitucion) patch.anioConstitucion = s.anioConstitucion;
      if (!p.ambitoGeo && s.ambitoGeo) patch.ambitoGeo = s.ambitoGeo;
      if (!p.web && s.web) patch.web = s.web;
      if (!p.linkedin && s.linkedin) patch.linkedin = s.linkedin;
      if (!p.logoUrl && s.logoUrl) patch.logoUrl = s.logoUrl;

      if (Object.keys(patch).length > 0) {
        await tx.empresa.update({ where: { id: principal }, data: patch });
        updates["Empresa principal (campos completados)"] = Object.keys(patch).length;
        console.log(`  Campos copiados al principal:`, Object.keys(patch).join(", "));
      }

      // ─── 6. Borrar el secundario ─────────────────────────────────────────────
      await tx.empresa.delete({ where: { id: secundario } });
      updates["Empresa secundario (borrado)"] = 1;

      console.log("\n  Resumen de movimientos:");
      for (const [k, v] of Object.entries(updates)) {
        if (v > 0) console.log(`    ${k}: ${v}`);
      }

      if (dry) {
        console.log("\n  ⚠️  DRY RUN — abortando transacción.");
        throw new Error("__DRY_RUN_ROLLBACK__");
      }
    },
    { timeout: 30000 }
  ).catch((err: Error) => {
    if (err.message === "__DRY_RUN_ROLLBACK__") return;
    throw err;
  });

  if (!dry) console.log("\n✅ Merge completado.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("\n❌ Error:", e);
  process.exit(1);
});
