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

function renderEmail(opts: {
  titulo: string;
  mensaje: string;
  link: string;
}): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="padding:20px 28px 12px;border-bottom:1px solid #e5e7eb">
          <div style="font-size:11px;font-weight:800;color:#111827;letter-spacing:2px;text-transform:uppercase">FONTIBER WAR ROOM</div>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <h1 style="margin:0 0 12px;font-size:18px;color:#111827;font-weight:600">${escape(opts.titulo)}</h1>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.5;white-space:pre-wrap">${escape(opts.mensaje)}</p>
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
