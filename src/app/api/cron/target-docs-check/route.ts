/**
 * /api/cron/target-docs-check
 * Vercel cron job — lunes 07:30 UTC.
 *
 * Fallback al trigger en PATCH /stage para empresas que ya están en stage
 * con docs pero sin URLs poblados (porque entraron antes de que existiera
 * el feature, o porque la creación falló esa vez).
 *
 * Estrategia:
 *   1. Pasada 1 — matcher (todos los stages con docs, incluido on_hold/
 *      muerto): si ya existe carpeta/página en OneDrive/Notion con el
 *      nombre normalizado de la empresa, popular sin crear nada.
 *   2. Pasada 2 — auto-create (solo stages ACTIVOS): para las que sigan
 *      sin URLs tras el matcher, crear carpeta + 3 subcarpetas + página
 *      Notion. Excluye on_hold/muerto deliberadamente: no se crean docs
 *      para empresas pausadas o descartadas — si están sin docs, es
 *      probablemente porque nunca llegaron a 1ª reunión real.
 *   3. Notificar el resultado consolidado a admins.
 *
 * No bloqueante: si una empresa falla, sigue con la siguiente y reporta
 * todas al final.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { matchEmpresasLinks } from "@/lib/empresa-link-matcher";
import { createEmpresaLinks } from "@/lib/empresa-link-builder";
import { notifyAdmins } from "@/lib/notifications";
import { log } from "@/lib/logger";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Stages a partir de los cuales una empresa puede TENER docs (rango amplio:
// también on_hold/muerto, por si en su día estuvieron en stages activos
// y se les creó carpeta).
const STAGES_WITH_DOCS = [
  "primera_reunion",
  "analisis",
  "LOI enviada",
  "execution",
  "portfolio",
  "on_hold",
  "muerto",
];

// Stages para los que SÍ creamos docs cuando faltan. Excluye on_hold/muerto:
// si una empresa pausada/descartada nunca tuvo docs, no las creamos ahora.
const ACTIVE_STAGES_FOR_CREATION = new Set([
  "primera_reunion",
  "analisis",
  "LOI enviada",
  "execution",
  "portfolio",
]);

export async function GET(req: NextRequest) {
  // Auth de cron: el mismo CRON_SECRET de Vercel.
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const empresasSinUrls = await prisma.empresa.findMany({
      where: {
        crmEstado: { dealStage: { in: STAGES_WITH_DOCS } },
        oneDriveUrl: null,
        notionUrl: null,
      },
      select: {
        id: true,
        nombre: true,
        nombreComercial: true,
        crmEstado: { select: { dealStage: true } },
      },
      orderBy: { nombre: "asc" },
    });

    log.info("cron/target-docs-check", `${empresasSinUrls.length} empresas sin URLs`);

    if (empresasSinUrls.length === 0) {
      return NextResponse.json({ ok: true, total: 0, matched: 0, created: 0, errors: 0, skipped: 0 });
    }

    // Pasada 1 — matcher (todos los stages con docs)
    const matches = await matchEmpresasLinks(empresasSinUrls);
    let matched = 0;
    const stillNeedCreation: typeof empresasSinUrls = [];
    for (let i = 0; i < empresasSinUrls.length; i++) {
      const e = empresasSinUrls[i];
      const r = matches[i];
      const patch: { oneDriveUrl?: string; notionUrl?: string } = {};
      if (r.oneDrive.kind === "match") patch.oneDriveUrl = r.oneDrive.item.webUrl;
      if (r.notion.kind === "match") patch.notionUrl = r.notion.item.url;
      if (Object.keys(patch).length > 0) {
        await prisma.empresa.update({ where: { id: e.id }, data: patch });
        matched++;
        // Si ambos quedaron poblados, no necesita creación. Si solo uno, tampoco
        // recreamos lo que falta (asumimos que el user lo creará manual con
        // alias). Solo creamos cuando AMBOS siguen vacíos tras matcher.
      } else {
        stillNeedCreation.push(e);
      }
    }

    // Pasada 2 — auto-create SOLO para empresas en stages activos.
    // Las en on_hold/muerto sin URLs se quedan así: se omite la creación.
    let created = 0;
    let errors = 0;
    let skipped = 0;
    const errorDetails: string[] = [];
    const createdNames: string[] = [];
    const skippedNames: string[] = [];

    for (const e of stillNeedCreation) {
      const stage = e.crmEstado?.dealStage;
      if (!stage || !ACTIVE_STAGES_FOR_CREATION.has(stage)) {
        skipped++;
        skippedNames.push(`${e.nombre} (${stage ?? "?"})`);
        continue;
      }
      try {
        const result = await createEmpresaLinks(e.nombre);
        await prisma.empresa.update({
          where: { id: e.id },
          data: { oneDriveUrl: result.oneDriveUrl, notionUrl: result.notionUrl },
        });
        created++;
        createdNames.push(result.folder.name);
      } catch (err) {
        errors++;
        errorDetails.push(
          `${e.nombre}: ${err instanceof Error ? err.message : String(err)}`
        );
        log.error("cron/target-docs-check", err, { empresaId: e.id });
      }
    }

    // Notificación consolidada (solo si hubo cambios o errores; skipped no
    // se notifica porque el comportamiento es por diseño).
    if (matched + created + errors > 0) {
      const partes: string[] = [];
      if (matched > 0) partes.push(`✅ ${matched} empresas vinculadas a docs ya existentes`);
      if (created > 0)
        partes.push(`✨ ${created} carpetas + páginas creadas: ${createdNames.join(", ")}`);
      if (errors > 0)
        partes.push(`⚠️ ${errors} fallos:\n${errorDetails.slice(0, 5).join("\n")}`);
      if (skipped > 0)
        partes.push(`(${skipped} omitidas por estar en on_hold/muerto sin docs)`);

      await notifyAdmins({
        tipo: "docs_cron_check",
        titulo: "📁 Repaso semanal de docs externos",
        mensaje: partes.join("\n\n"),
        link: "/pipeline",
        // Solo email si hay creación o error (matched silencioso).
        email: created > 0 || errors > 0,
      });
    }

    return NextResponse.json({
      ok: true,
      total: empresasSinUrls.length,
      matched,
      created,
      errors,
      skipped,
      errorDetails,
      skippedNames,
    });
  } catch (err) {
    log.error("cron/target-docs-check", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
