/**
 * Email helper para el self-service reset de password del portal de finders.
 *
 * Diseño paralelo a `lib/notifications.ts` (admins) — misma plantilla visual,
 * misma estrategia fire-and-forget: si Resend falla, lo logueamos pero no
 * bloqueamos al endpoint. El finder verá la respuesta genérica del endpoint
 * (anti-enumeración) y, si no recibe email, puede contactar al admin.
 */

import { Resend } from "resend";
import { log } from "@/lib/logger";

// FROM dedicado del portal: separamos el remitente de los emails dirigidos a
// finders (`portal@fontiber.com`) del que reciben los admins en notifyAdmins
// (`warroom@fontiber.com`). Mismo dominio verificado en Resend, aliases
// distintos para que el destinatario lo identifique a primera vista.
const FROM = process.env.PORTAL_EMAIL_FROM ?? "portal@fontiber.com";
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://warroom.fontiber.com";

export type SendPasswordResetEmailInput = {
  to: string;
  finderName: string;
  rawToken: string;
  expiresAt: Date;
};

export async function sendPasswordResetEmail(
  input: SendPasswordResetEmailInput
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.warn("lib/email-password-reset", "RESEND_API_KEY not set, skipping email");
    return;
  }

  const link = `${BASE_URL}/portal/reset-password?token=${encodeURIComponent(
    input.rawToken
  )}`;
  const html = renderEmail({
    finderName: input.finderName,
    link,
    expiresAt: input.expiresAt,
  });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `Fontiber Portal <${FROM}>`,
      to: input.to,
      subject: "Restablece tu contraseña — Portal Fontiber",
      html,
    });
    if (error) log.error("lib/email-password-reset", "Resend error", { error });
  } catch (err) {
    log.error("lib/email-password-reset", err);
  }
}

function renderEmail(opts: {
  finderName: string;
  link: string;
  expiresAt: Date;
}): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const horas = Math.round(
    (opts.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)
  );
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
          <h1 style="margin:0 0 12px;font-size:18px;color:#111827;font-weight:600">Restablecer contraseña</h1>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5">
            Hola ${escape(opts.finderName)},
          </p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5">
            Hemos recibido una solicitud para restablecer la contraseña de tu
            cuenta del portal. Si fuiste tú, pulsa el botón de abajo para
            elegir una nueva. El enlace caduca en aproximadamente
            ${horas} hora${horas === 1 ? "" : "s"}.
          </p>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.5">
            Si no fuiste tú, ignora este email — tu contraseña actual seguirá
            siendo válida.
          </p>
        </td></tr>
        <tr><td style="padding:0 28px 28px;text-align:center">
          <a href="${escape(opts.link)}" style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:6px">
            Establecer nueva contraseña &rarr;
          </a>
        </td></tr>
        <tr><td style="padding:14px 28px;border-top:1px solid #e5e7eb;background:#f9fafb;font-size:10px;color:#9ca3af">
          <a href="${escape(BASE_URL)}/portal" style="color:#3b82f6;text-decoration:none;font-weight:600">portal.fontiber.com</a>
          &nbsp;&middot;&nbsp;Fontiber Industrial Partners
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
