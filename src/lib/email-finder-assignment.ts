/**
 * Emails al finder cuando un admin le asigna un target o una tarea.
 *
 * Patrón paralelo a `email-password-reset.ts`: fire-and-forget, mismo FROM
 * (`PORTAL_EMAIL_FROM`), misma plantilla visual.
 */

import { Resend } from "resend";
import { log } from "@/lib/logger";
import { fmtDate } from "@/lib/format";

const FROM = process.env.PORTAL_EMAIL_FROM ?? "portal@fontiber.com";
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://warroom.fontiber.com";
const PORTAL_URL = BASE_URL.replace("warroom.", "portal.");

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  scope: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.warn(opts.scope, "RESEND_API_KEY not set, skipping email");
    return;
  }
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `Fontiber Portal <${FROM}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) log.error(opts.scope, "Resend error", { error });
  } catch (err) {
    log.error(opts.scope, err);
  }
}

/* ─── Target assigned ────────────────────────────────────────────────── */

export type SendFinderTargetAssignedInput = {
  to: string;
  finderName: string;
  empresaId: number;
  empresaNombre: string;
  asignadoPor: string; // admin name
};

export async function sendFinderTargetAssignedEmail(
  input: SendFinderTargetAssignedInput
): Promise<void> {
  const link = `${PORTAL_URL}/portal/empresas/${input.empresaId}`;
  const html = renderTargetEmail({
    finderName: input.finderName,
    empresaNombre: input.empresaNombre,
    asignadoPor: input.asignadoPor,
    link,
  });
  await sendViaResend({
    to: input.to,
    subject: `Nuevo target asignado: ${input.empresaNombre}`,
    html,
    scope: "lib/email-finder-assignment:target",
  });
}

function renderTargetEmail(opts: {
  finderName: string;
  empresaNombre: string;
  asignadoPor: string;
  link: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="padding:20px 28px 12px;border-bottom:1px solid #e5e7eb">
          <div style="font-size:11px;font-weight:800;color:#111827;letter-spacing:2px;text-transform:uppercase">FONTIBER · PORTAL FINDERS</div>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <h1 style="margin:0 0 12px;font-size:18px;color:#111827;font-weight:600">Nuevo target asignado</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5">
            Hola ${escape(opts.finderName)},
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5">
            ${escape(opts.asignadoPor)} te ha asignado un nuevo target:
          </p>
          <p style="margin:0 0 20px;font-size:16px;color:#111827;font-weight:600;background:#f3f4f6;padding:12px 16px;border-radius:6px">
            ${escape(opts.empresaNombre)}
          </p>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">
            Entra en el portal para ver los detalles, registrar avances y
            consultar tareas asociadas.
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 28px;text-align:center">
          <a href="${escape(opts.link)}" style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px">
            Abrir target en el portal &rarr;
          </a>
        </td></tr>
        <tr><td style="padding:14px 28px;border-top:1px solid #e5e7eb;background:#f9fafb;font-size:10px;color:#9ca3af">
          <a href="${escape(PORTAL_URL)}/portal" style="color:#3b82f6;text-decoration:none;font-weight:600">portal.fontiber.com</a>
          &nbsp;&middot;&nbsp;Fontiber Industrial Partners
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ─── Task assigned ──────────────────────────────────────────────────── */

export type SendFinderTaskAssignedInput = {
  to: string;
  finderName: string;
  empresaId: number;
  empresaNombre: string;
  tareaTitulo: string;
  tareaDescripcion: string | null;
  tareaFechaLimite: Date | null;
  asignadoPor: string;
};

export async function sendFinderTaskAssignedEmail(
  input: SendFinderTaskAssignedInput
): Promise<void> {
  const link = `${PORTAL_URL}/portal/empresas/${input.empresaId}`;
  const html = renderTaskEmail({
    finderName: input.finderName,
    empresaNombre: input.empresaNombre,
    tareaTitulo: input.tareaTitulo,
    tareaDescripcion: input.tareaDescripcion,
    tareaFechaLimite: input.tareaFechaLimite,
    asignadoPor: input.asignadoPor,
    link,
  });
  await sendViaResend({
    to: input.to,
    subject: `Nueva tarea: ${input.tareaTitulo}`,
    html,
    scope: "lib/email-finder-assignment:task",
  });
}

function renderTaskEmail(opts: {
  finderName: string;
  empresaNombre: string;
  tareaTitulo: string;
  tareaDescripcion: string | null;
  tareaFechaLimite: Date | null;
  asignadoPor: string;
  link: string;
}): string {
  const fechaStr = opts.tareaFechaLimite
    ? fmtDate(opts.tareaFechaLimite.toISOString())
    : null;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="padding:20px 28px 12px;border-bottom:1px solid #e5e7eb">
          <div style="font-size:11px;font-weight:800;color:#111827;letter-spacing:2px;text-transform:uppercase">FONTIBER · PORTAL FINDERS</div>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <h1 style="margin:0 0 12px;font-size:18px;color:#111827;font-weight:600">Nueva tarea asignada</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5">
            Hola ${escape(opts.finderName)},
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5">
            ${escape(opts.asignadoPor)} te ha asignado una tarea sobre <strong>${escape(opts.empresaNombre)}</strong>:
          </p>
          <div style="margin:0 0 16px;background:#f3f4f6;padding:14px 16px;border-radius:6px">
            <p style="margin:0 0 6px;font-size:15px;color:#111827;font-weight:600">${escape(opts.tareaTitulo)}</p>
            ${opts.tareaDescripcion ? `<p style="margin:0 0 6px;font-size:13px;color:#374151;line-height:1.5;white-space:pre-wrap">${escape(opts.tareaDescripcion)}</p>` : ""}
            ${fechaStr ? `<p style="margin:6px 0 0;font-size:12px;color:#6b7280">Fecha límite: <strong style="color:#374151">${fechaStr}</strong></p>` : ""}
          </div>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">
            Entra en el portal para ver el detalle y marcarla como hecha cuando
            la completes.
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 28px;text-align:center">
          <a href="${escape(opts.link)}" style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px">
            Abrir tarea en el portal &rarr;
          </a>
        </td></tr>
        <tr><td style="padding:14px 28px;border-top:1px solid #e5e7eb;background:#f9fafb;font-size:10px;color:#9ca3af">
          <a href="${escape(PORTAL_URL)}/portal" style="color:#3b82f6;text-decoration:none;font-weight:600">portal.fontiber.com</a>
          &nbsp;&middot;&nbsp;Fontiber Industrial Partners
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
