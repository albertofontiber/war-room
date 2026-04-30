/**
 * Task digest email — para cada admin activo, envía un email con:
 *   - Tus tareas:
 *       Vencidas (fechaLimite < hoy 00:00)
 *       Hoy (fechaLimite entre hoy 00:00 y mañana 00:00)
 *       Próximos 7 días (fechaLimite entre mañana 00:00 y hoy+8 días 00:00)
 *       Sin fecha (las suyas, pendientes)
 *   - CRM update — actividad de finders en las últimas 24h (compartido a todos los admins):
 *       Tareas nuevas (creadas por finder, pendientes)
 *       Completadas (por finder, sea autor o asignado)
 *       Notas nuevas (creadas por finder)
 *
 * Se llama desde /api/cron/task-digest.
 * Un admin sin tareas y sin actividad de finders no recibe email (no hacer ruido).
 */

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { TAREA_TIPO_LABEL } from "@/lib/crm";
import type { TareaTipo } from "@/types";

const FROM     = process.env.SUMMARY_EMAIL_FROM ?? "warroom@fontiber.com";
const BASE_URL = "https://warroom.fontiber.com";

type TareaRow = {
  id: number;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  fechaLimite: Date | null;
  empresa: { id: number; nombre: string };
};

type Bucket = {
  vencidas: TareaRow[];
  hoy: TareaRow[];
  proximos7: TareaRow[];
  sinFecha: TareaRow[];
};

// Items del bloque "CRM update" — actividad de finders en las últimas 24h.
type ActividadFinderRow = {
  empresa: { id: number; nombre: string };
  finderName: string;
  titulo: string;       // tarea: titulo · nota: preview del contenido
  tipo?: string;        // solo tareas
  fecha: Date;          // createdAt o completadaAt según el caso
};

type FinderActivity = {
  tareasNuevas: ActividadFinderRow[];     // creadas por finder, pendientes
  completadas: ActividadFinderRow[];      // completadas por finder
  notasNuevas: ActividadFinderRow[];      // creadas por finder
};

function tipoLabel(tipo: string): string {
  return TAREA_TIPO_LABEL[tipo as TareaTipo] ?? tipo;
}

function fmtFecha(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function renderBlock(title: string, color: string, tareas: TareaRow[]): string {
  if (tareas.length === 0) return "";
  const rows = tareas
    .map((t) => {
      const fecha = t.fechaLimite ? fmtFecha(t.fechaLimite) : "—";
      const empresaUrl = `${BASE_URL}/?empresa=${t.empresa.id}`;
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#111827;vertical-align:top">
            <div style="font-weight:600">${escapeHtml(t.titulo)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">
              <a href="${empresaUrl}" style="color:#3b82f6;text-decoration:none">${escapeHtml(t.empresa.nombre)}</a>
              &nbsp;·&nbsp;${escapeHtml(tipoLabel(t.tipo))}
            </div>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#6b7280;white-space:nowrap;text-align:right;vertical-align:top">
            ${fecha}
          </td>
        </tr>`;
    })
    .join("");

  return `
    <tr>
      <td style="padding:18px 28px 6px">
        <div style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1px">
          ${title} · ${tareas.length}
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 4px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;border-collapse:separate;border-spacing:0;overflow:hidden">
          ${rows}
        </table>
      </td>
    </tr>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Carga la actividad del portal de finders en las últimas 24h (rolling, desde
 * `now - 24h` hasta `now`). Compartido entre todos los admins — se calcula una
 * sola vez por ejecución del cron y se inyecta en cada email.
 *
 * Captura: tareas nuevas pendientes creadas por finder, tareas completadas por
 * finder (autor o asignado), notas nuevas creadas por finder. NO captura
 * ediciones de `resultado` ni de notas — esas tienen campanita inmediata.
 */
async function loadFinderActivity(now: Date): Promise<FinderActivity> {
  const desde = new Date(now);
  desde.setDate(desde.getDate() - 1);

  const [tareasNuevasRaw, completadasRaw, notasNuevasRaw] = await Promise.all([
    prisma.tarea.findMany({
      where: {
        createdAt: { gte: desde, lte: now },
        autorFinderId: { not: null },
        completada: false,
      },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        createdAt: true,
        empresa: { select: { id: true, nombre: true } },
        autorFinder: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tarea.findMany({
      where: {
        completadaAt: { gte: desde, lte: now },
        OR: [
          { autorFinderId: { not: null } },
          { asignadoFinderId: { not: null } },
        ],
      },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        completadaAt: true,
        empresa: { select: { id: true, nombre: true } },
        autorFinder: { select: { name: true } },
        asignadoFinder: { select: { name: true } },
      },
      orderBy: { completadaAt: "desc" },
    }),
    prisma.nota.findMany({
      where: {
        createdAt: { gte: desde, lte: now },
        autorFinderId: { not: null },
      },
      select: {
        id: true,
        contenido: true,
        createdAt: true,
        empresa: { select: { id: true, nombre: true } },
        autorFinder: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    tareasNuevas: tareasNuevasRaw.map((t) => ({
      empresa: t.empresa,
      finderName: t.autorFinder?.name ?? "—",
      titulo: t.titulo,
      tipo: t.tipo,
      fecha: t.createdAt,
    })),
    completadas: completadasRaw.map((t) => ({
      empresa: t.empresa,
      // El finder que completó es el asignado si existe, si no el autor.
      finderName: t.asignadoFinder?.name ?? t.autorFinder?.name ?? "—",
      titulo: t.titulo,
      tipo: t.tipo,
      fecha: t.completadaAt!, // completadaAt no es null por el WHERE
    })),
    notasNuevas: notasNuevasRaw.map((n) => ({
      empresa: n.empresa,
      finderName: n.autorFinder?.name ?? "—",
      titulo: n.contenido.length > 80 ? n.contenido.slice(0, 80) + "…" : n.contenido,
      fecha: n.createdAt,
    })),
  };
}

function renderActivityBlock(title: string, color: string, items: ActividadFinderRow[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map((it) => {
      const empresaUrl = `${BASE_URL}/?empresa=${it.empresa.id}`;
      const tipoLabel = it.tipo ? (TAREA_TIPO_LABEL[it.tipo as TareaTipo] ?? it.tipo) : null;
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#111827;vertical-align:top">
            <div style="font-weight:600">${escapeHtml(it.titulo)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">
              <a href="${empresaUrl}" style="color:#3b82f6;text-decoration:none">${escapeHtml(it.empresa.nombre)}</a>
              &nbsp;·&nbsp;${escapeHtml(it.finderName)}${tipoLabel ? `&nbsp;·&nbsp;${escapeHtml(tipoLabel)}` : ""}
            </div>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#6b7280;white-space:nowrap;text-align:right;vertical-align:top">
            ${fmtFecha(it.fecha)}
          </td>
        </tr>`;
    })
    .join("");

  return `
    <tr>
      <td style="padding:18px 28px 6px">
        <div style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1px">
          ${title} · ${items.length}
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 4px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;border-collapse:separate;border-spacing:0;overflow:hidden">
          ${rows}
        </table>
      </td>
    </tr>`;
}

export async function sendTaskDigest(
  options?: { to?: string; force?: boolean }
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: 0, skipped: 0, errors: ["RESEND_API_KEY not set"] };
  }
  const resend = new Resend(apiKey);

  const now = new Date();
  const hoy0 = startOfDay(now);
  const maniana0 = new Date(hoy0); maniana0.setDate(maniana0.getDate() + 1);
  const enOcho0 = new Date(hoy0); enOcho0.setDate(enOcho0.getDate() + 8);

  // Cargamos en paralelo:
  //   - Lista de admins activos (todos reciben el digest aunque no tengan tareas
  //     asignadas, si hay actividad de finders que mostrar).
  //   - Tareas pendientes asignadas a admins (para la sección "Tus tareas").
  //   - Actividad del portal de finders en las últimas 24h (compartida en
  //     "CRM update" para todos los admins).
  const [adminsActivos, pendientes, finderActivity] = await Promise.all([
    prisma.user.findMany({
      where: { role: "admin", active: true },
      select: { id: true, email: true, name: true },
    }),
    prisma.tarea.findMany({
      where: {
        completada: false,
        asignadoId: { not: null },
      },
      include: {
        empresa: { select: { id: true, nombre: true } },
        asignado: { select: { id: true, email: true, name: true, active: true } },
      },
      orderBy: [{ fechaLimite: "asc" }],
    }),
    loadFinderActivity(now),
  ]);

  const totalActividadFinders =
    finderActivity.tareasNuevas.length +
    finderActivity.completadas.length +
    finderActivity.notasNuevas.length;

  // Agrupar por usuario. Inicializamos con TODOS los admins activos para que
  // reciban email aunque no tengan tareas, si hay actividad de finders.
  const porUsuario = new Map<string, { email: string; name: string; bucket: Bucket }>();
  for (const a of adminsActivos) {
    porUsuario.set(a.id, {
      email: a.email,
      name: a.name,
      bucket: { vencidas: [], hoy: [], proximos7: [], sinFecha: [] },
    });
  }

  for (const t of pendientes) {
    const u = t.asignado;
    if (!u || !u.active) continue;
    let entry = porUsuario.get(u.id);
    if (!entry) {
      // Asignado a un usuario que NO es admin activo (caso raro, p.ej.
      // user role distinto). Lo creamos al vuelo para no perder la tarea.
      entry = {
        email: u.email,
        name: u.name,
        bucket: { vencidas: [], hoy: [], proximos7: [], sinFecha: [] },
      };
      porUsuario.set(u.id, entry);
    }
    const row: TareaRow = {
      id: t.id,
      titulo: t.titulo,
      descripcion: t.descripcion,
      tipo: t.tipo,
      fechaLimite: t.fechaLimite,
      empresa: t.empresa,
    };
    if (!t.fechaLimite) {
      entry.bucket.sinFecha.push(row);
    } else if (t.fechaLimite < hoy0) {
      entry.bucket.vencidas.push(row);
    } else if (t.fechaLimite < maniana0) {
      entry.bucket.hoy.push(row);
    } else if (t.fechaLimite < enOcho0) {
      entry.bucket.proximos7.push(row);
    }
    // Tareas con fechaLimite > hoy+7 no entran en el digest.
  }

  const dateLabel = hoy0.toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long",
  });
  const dateCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  const overrideTo = options?.to ? options.to.split(",").map((s) => s.trim()) : null;

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const { email, name, bucket } of Array.from(porUsuario.values())) {
    const totalTareas =
      bucket.vencidas.length + bucket.hoy.length +
      bucket.proximos7.length + bucket.sinFecha.length;

    // Sin tareas y sin actividad de finders → no enviar (no hacer ruido).
    // Force solo aplica al usuario actual; CRM update se envía si hay algo.
    if (totalTareas === 0 && totalActividadFinders === 0 && !options?.force) {
      skipped++;
      continue;
    }

    const to = overrideTo ?? [email];

    // Subject: prioriza tareas si las hay; si no, refleja CRM update.
    const tareasSummary = totalTareas > 0
      ? `${bucket.vencidas.length > 0 ? `${bucket.vencidas.length} vencidas · ` : ""}${bucket.hoy.length} hoy · ${bucket.proximos7.length} próx. 7d`
      : null;
    const finderSummary = totalActividadFinders > 0
      ? `${totalActividadFinders} acción${totalActividadFinders === 1 ? "" : "es"} de finders`
      : null;
    const subject = tareasSummary && finderSummary
      ? `⚡ Tus tareas — ${tareasSummary} · ${finderSummary}`
      : tareasSummary
      ? `⚡ Tus tareas — ${tareasSummary}`
      : `⚡ CRM update — ${finderSummary}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>War Room — Diario</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
          <tr>
            <td style="padding:20px 28px 16px;border-bottom:1px solid #e5e7eb">
              <div style="font-size:11px;font-weight:800;color:#111827;letter-spacing:2px;text-transform:uppercase">Fontiber War Room — Diario</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:2px">${dateCap} · ${escapeHtml(name)}</div>
            </td>
          </tr>

          <!-- Sección: Tus tareas (personal del destinatario) -->
          <tr>
            <td style="padding:18px 28px 0">
              <div style="font-size:11px;font-weight:800;color:#111827;text-transform:uppercase;letter-spacing:1.5px">Tus tareas</div>
            </td>
          </tr>

          ${renderBlock("Vencidas",       "#dc2626", bucket.vencidas)}
          ${renderBlock("Hoy",            "#f59e0b", bucket.hoy)}
          ${renderBlock("Próximos 7 días","#3b82f6", bucket.proximos7)}
          ${renderBlock("Sin fecha",      "#6b7280", bucket.sinFecha)}

          ${totalTareas === 0 ? `
          <tr>
            <td style="padding:14px 28px;text-align:center;font-size:13px;color:#6b7280">
              No tienes tareas pendientes. 🎉
            </td>
          </tr>` : ""}

          ${totalActividadFinders > 0 ? `
          <!-- Sección: CRM update (compartido a todos los admins) -->
          <tr>
            <td style="padding:24px 28px 0;border-top:1px solid #e5e7eb">
              <div style="font-size:11px;font-weight:800;color:#111827;text-transform:uppercase;letter-spacing:1.5px">CRM update — actividad de finders (24h)</div>
            </td>
          </tr>

          ${renderActivityBlock("Tareas nuevas",   "#3b82f6", finderActivity.tareasNuevas)}
          ${renderActivityBlock("Completadas",     "#22c55e", finderActivity.completadas)}
          ${renderActivityBlock("Notas nuevas",    "#8b5cf6", finderActivity.notasNuevas)}
          ` : ""}

          <tr>
            <td style="padding:20px 28px 24px;text-align:center">
              <a href="${BASE_URL}/pipeline?owner=${email}"
                 style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:6px">
                Abrir pipeline &rarr;
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 28px;border-top:1px solid #e5e7eb;background:#f9fafb;font-size:10px;color:#9ca3af">
              <a href="${BASE_URL}" style="color:#3b82f6;text-decoration:none;font-weight:600">warroom.fontiber.com</a>
              &nbsp;·&nbsp;Fontiber Industrial Partners
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const { error } = await resend.emails.send({
      from: `War Room <${FROM}>`,
      to,
      subject,
      html,
    });

    if (error) {
      errors.push(`${email}: ${String(error)}`);
    } else {
      sent++;
    }
  }

  return { sent, skipped, errors };
}
