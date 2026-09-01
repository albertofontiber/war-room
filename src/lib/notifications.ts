/**
 * Notificaciones in-app + email para admins.
 *
 * Genera una `Notificacion` por cada admin activo (User.role="admin") y dispara
 * un email opcional vía Resend. Pensado para eventos discretos como "nueva
 * propuesta de finder". Fire-and-forget: si Resend falla, las notificaciones
 * en BD se conservan; si la BD falla, el caller recibe la excepción y decide.
 *
 * Recipientes del email:
 *   - Por defecto los emails de los admins activos en BD.
 *   - Sobreescribible vía env `NOTIFICATION_EMAIL_TO` (CSV) — útil mientras
 *     Gabriel no quiera recibir o para testing.
 */

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

const FROM = process.env.SUMMARY_EMAIL_FROM ?? "warroom@fontiber.com";
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://warroom.fontiber.com";

export type NotifyAdminsInput = {
  tipo: string;
  titulo: string;
  mensaje: string;
  /**
   * Cuerpo del email en HTML, cuando el contenido pide más que un párrafo
   * (tablas, sobre todo). La campanita usa siempre `mensaje`.
   */
  html?: string;
  link?: string | null;
  /** Si false, no envía email — solo persiste in-app. Default true. */
  email?: boolean;
};

export type NotifyUserInput = {
  userId: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  link?: string | null;
  /** Si false, no envía email — solo persiste in-app. Default false (campanita-only). */
  email?: boolean;
};

export type NotifyFinderInput = {
  finderId: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  /** Ruta dentro del PORTAL del finder (ej. "/portal/empresas/123"). */
  link?: string | null;
  /** Si false, no envía email. Default false (campanita-only). */
  email?: boolean;
};

/**
 * Crea notificaciones in-app para todos los admins activos y, opcionalmente,
 * envía un email. No lanza si Resend falla — solo loguea.
 */
export async function notifyAdmins(input: NotifyAdminsInput): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "admin", active: true },
    select: { id: true, email: true },
  });
  if (admins.length === 0) return;

  await prisma.notificacion.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      tipo: input.tipo,
      titulo: input.titulo,
      mensaje: input.mensaje,
      link: input.link ?? null,
    })),
  });

  if (input.email === false) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.warn("lib/notifications", "RESEND_API_KEY not set, skipping email");
    return;
  }

  const override = process.env.NOTIFICATION_EMAIL_TO;
  const to = override
    ? override.split(",").map((s) => s.trim()).filter(Boolean)
    : admins.map((a) => a.email);
  if (to.length === 0) return;

  const link = input.link ? `${BASE_URL}${input.link}` : BASE_URL;
  const html = renderEmail({
    titulo: input.titulo,
    mensaje: input.mensaje,
    cuerpoHtml: input.html,
    link,
  });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `War Room <${FROM}>`,
      to,
      subject: input.titulo,
      html,
    });
    if (error) log.error("lib/notifications", "Resend error", { error });
  } catch (err) {
    log.error("lib/notifications", err);
  }
}

/**
 * Notifica a un único admin (campanita in-app + email opcional). Útil para
 * eventos dirigidos como "te han respondido a tu nota" o "te han mencionado".
 * Default email=false porque estos eventos suelen ser de alta frecuencia y
 * conviene no inundar la bandeja.
 */
export async function notifyUser(input: NotifyUserInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, active: true },
  });
  if (!user || !user.active) return;

  await prisma.notificacion.create({
    data: {
      userId: user.id,
      tipo: input.tipo,
      titulo: input.titulo,
      mensaje: input.mensaje,
      link: input.link ?? null,
    },
  });

  if (input.email !== true) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.warn("lib/notifications", "RESEND_API_KEY not set, skipping email");
    return;
  }

  const link = input.link ? `${BASE_URL}${input.link}` : BASE_URL;
  const html = renderEmail({
    titulo: input.titulo,
    mensaje: input.mensaje,
    link,
  });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `War Room <${FROM}>`,
      to: [user.email],
      subject: input.titulo,
      html,
    });
    if (error) log.error("lib/notifications notifyUser", "Resend error", { error });
  } catch (err) {
    log.error("lib/notifications notifyUser", err);
  }
}

/**
 * Notifica a un único finder (campanita in-app + email opcional). Mismo
 * patrón que `notifyUser` pero apunta a `Finder` en vez de `User`. La
 * campanita aparece en el portal del finder, no en el war room admin.
 *
 * El portal del finder tiene su propio dominio (`portal.fontiber.com`); el
 * `link` debe ser una ruta absoluta tipo `/portal/empresas/123`. Para los
 * emails se usa el FROM del portal (`PORTAL_EMAIL_FROM`) en lugar del
 * `SUMMARY_EMAIL_FROM` que va a admins.
 */
export async function notifyFinder(input: NotifyFinderInput): Promise<void> {
  const finder = await prisma.finder.findUnique({
    where: { id: input.finderId },
    select: { id: true, email: true, active: true },
  });
  if (!finder || !finder.active) return;

  await prisma.notificacion.create({
    data: {
      finderId: finder.id,
      tipo: input.tipo,
      titulo: input.titulo,
      mensaje: input.mensaje,
      link: input.link ?? null,
    },
  });

  if (input.email !== true) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.warn("lib/notifications", "RESEND_API_KEY not set, skipping email");
    return;
  }

  const portalFrom = process.env.PORTAL_EMAIL_FROM ?? "portal@fontiber.com";
  const portalBaseUrl =
    process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.fontiber.com";
  const link = input.link ? `${portalBaseUrl}${input.link}` : portalBaseUrl;
  const html = renderEmail({
    titulo: input.titulo,
    mensaje: input.mensaje,
    link,
  });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `Fontiber Portal <${portalFrom}>`,
      to: [finder.email],
      subject: input.titulo,
      html,
    });
    if (error) log.error("lib/notifications notifyFinder", "Resend error", { error });
  } catch (err) {
    log.error("lib/notifications notifyFinder", err);
  }
}

/**
 * Plantilla del correo.
 *
 * `cuerpoHtml` sustituye al párrafo de texto cuando el aviso trae maquetación
 * propia. Sin él, el texto plano se pinta convirtiendo los saltos de línea en
 * `<br>`: `white-space:pre-wrap` no vale, porque Outlook lo ignora y deja el
 * mensaje entero pegado en un solo párrafo.
 *
 * Exportada para poder previsualizar el correo sin enviarlo.
 */
export function renderEmail(opts: {
  titulo: string;
  mensaje: string;
  cuerpoHtml?: string;
  link: string;
}): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // Una tabla necesita más sitio que un párrafo, pero sin pasar de los 640px
  // que aguanta bien Outlook.
  const ancho = opts.cuerpoHtml ? 640 : 520;
  const cuerpo =
    opts.cuerpoHtml ??
    `<p style="margin:0;font-size:14px;color:#374151;line-height:1.5">${escape(opts.mensaje).replace(/\n/g, "<br>")}</p>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
    <tr><td align="center">
      <table width="${ancho}" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="padding:20px 28px 12px;border-bottom:1px solid #e5e7eb">
          <div style="font-size:11px;font-weight:800;color:#111827;letter-spacing:2px;text-transform:uppercase">FONTIBER WAR ROOM</div>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <h1 style="margin:0 0 12px;font-size:18px;color:#111827;font-weight:600">${escape(opts.titulo)}</h1>
          ${cuerpo}
        </td></tr>
        <tr><td style="padding:0 28px 28px;text-align:center">
          <a href="${escape(opts.link)}" style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px">
            Abrir en War Room &rarr;
          </a>
        </td></tr>
        <tr><td style="padding:14px 28px;border-top:1px solid #e5e7eb;background:#f9fafb;font-size:10px;color:#9ca3af">
          <a href="${escape(BASE_URL)}" style="color:#3b82f6;text-decoration:none;font-weight:600">warroom.fontiber.com</a>
          &nbsp;&middot;&nbsp;Fontiber Industrial Partners
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
