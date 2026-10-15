/**
 * Emails de acceso: invitación al war room y recuperación de contraseña
 * (war room y portal de finders).
 *
 * Mismo estilo que las pantallas de acceso: cabecera navy con «Fontiber
 * War Room» (o «Finders») en cobre, tarjeta blanca, botón navy y el enlace en
 * claro por si el botón no funciona. Cada email lleva también versión en texto
 * plano.
 *
 * Si Resend falla, lo logueamos pero no rompemos el endpoint: la recuperación
 * responde siempre lo mismo (anti-enumeración) y la invitación enseña el enlace
 * en pantalla para pasarlo a mano.
 */

import { Resend } from "resend";
import { log } from "@/lib/logger";

// FROM dedicado del portal: separamos el remitente de los emails dirigidos a
// finders (`portal@fontiber.com`) del que reciben los admins en notifyAdmins
// (`warroom@fontiber.com`). Mismo dominio verificado en Resend, aliases
// distintos para que el destinatario lo identifique a primera vista.
const FROM = process.env.PORTAL_EMAIL_FROM ?? "portal@fontiber.com";
const ADMIN_FROM =
  process.env.ADMIN_EMAIL_FROM ??
  process.env.SUMMARY_EMAIL_FROM ??
  "warroom@fontiber.com";
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://warroom.fontiber.com";

const WAR_ROOM = "Fontiber War Room";
const PORTAL = "Fontiber Portal Finders";

type Email = { subject: string; text: string; html: string };

// ─── Plantillas ──────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

/** "7 días", "24 horas", "1 hora": se lee mejor que contar siempre en horas. */
export function caducidadTexto(expiresAt: Date, now = Date.now()): string {
  const horas = Math.max(1, Math.round((expiresAt.getTime() - now) / 3_600_000));
  if (horas >= 48) return `${Math.round(horas / 24)} días`;
  return `${horas} hora${horas === 1 ? "" : "s"}`;
}

// Colores de marca de las pantallas de acceso (`fontiber` en tailwind.config.ts).
const NAVY = "#0c1932";
const COPPER = "#c75b39";
const SAND = "#f5f3ef";

/**
 * Marco común. Cabecera navy con el logotipo «Fontiber <app>» en cobre, como
 * el login (`components/auth/AuthShell.tsx`). El navy va solo en la franja y
 * en una tabla con `bgcolor` para que Outlook lo pinte; el resto en blanco
 * aguanta el modo oscuro de los clientes. Los clientes de correo no cargan la
 * Playfair, así que el logotipo cae a Georgia.
 */
function layout(app: "War Room" | "Finders", footer: string, title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:${SAND};font-family:Arial,Helvetica,sans-serif;color:#171717">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border:1px solid #e7e2d9;border-radius:12px;overflow:hidden">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${NAVY}" align="center" style="background:${NAVY};padding:22px 28px">
          <span style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:24px;color:#ffffff;letter-spacing:-.01em">Fontiber <span style="color:${COPPER}">${app}</span></span>
        </td>
      </tr></table>
      <div style="padding:28px">
        <h1 style="font-size:18px;margin:0 0 8px;color:${NAVY}">${title}</h1>
        ${bodyHtml}
      </div>
    </div>
    <p style="font-size:12px;color:#a39e94;text-align:center;margin-top:16px;line-height:1.5">
      ${footer}<br/>Si no esperabas este correo, ignóralo.
    </p>
  </div></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">${label}</a></p>`;
}

function fallbackLink(url: string): string {
  return `<span style="color:#525252;word-break:break-all">${escapeHtml(url)}</span>`;
}

const P = `style="font-size:14px;line-height:1.6;color:#404040"`;
const SMALL = `style="font-size:12px;color:#737373;line-height:1.5"`;

export function invitationEmail(opts: {
  name: string;
  invitedBy: string;
  url: string;
  expiresAt: Date;
}): Email {
  const caduca = caducidadTexto(opts.expiresAt);
  const name = escapeHtml(opts.name);
  const by = escapeHtml(opts.invitedBy);
  // Dirección fija para entrar una vez creada la cuenta (el enlace del botón
  // es de un solo uso).
  const accessUrl = `${BASE_URL}/`;
  return {
    subject: `${opts.invitedBy} te ha invitado al War Room — ${WAR_ROOM}`,
    text: `Hola ${opts.name},

${opts.invitedBy} te ha invitado al War Room de Fontiber. Crea tu cuenta eligiendo una contraseña aquí:
${opts.url}

Este enlace caduca en ${caduca} y solo se puede usar una vez.

A partir de ahora entrarás en ${accessUrl} con este email y tu contraseña.

Si no esperabas esta invitación, ignora este correo.`,
    html: layout(
      "War Room",
      "Herramienta interna de Fontiber Industrial Partners.",
      "Te han invitado al War Room",
      `<p ${P}>Hola ${name}, <strong>${by}</strong> te ha invitado al War Room de Fontiber. Crea tu cuenta eligiendo una contraseña:</p>
       ${button(opts.url, "Crear mi cuenta")}
       <p ${P}>A partir de ahora entrarás en <a href="${escapeHtml(accessUrl)}" style="color:${NAVY};font-weight:600">${escapeHtml(accessUrl.replace(/^https?:\/\//, ""))}</a> con este email y tu contraseña.</p>
       <p ${SMALL}>El enlace de «Crear mi cuenta» caduca en ${caduca} y solo se puede usar una vez. Si el botón no funciona, copia esta dirección:<br/>${fallbackLink(opts.url)}</p>`
    ),
  };
}

export function passwordResetEmail(opts: {
  zona: "warroom" | "portal";
  name: string;
  url: string;
  expiresAt: Date;
}): Email {
  const brand = opts.zona === "portal" ? PORTAL : WAR_ROOM;
  const caduca = caducidadTexto(opts.expiresAt);
  const name = escapeHtml(opts.name);
  return {
    subject: `Restablece tu contraseña — ${brand}`,
    text: `Hola ${opts.name},\n\nHas solicitado restablecer tu contraseña. Abre este enlace para fijar una nueva (caduca en ${caduca}):\n${opts.url}\n\nSi no lo solicitaste, ignora este correo: tu contraseña no cambia.`,
    html: layout(
      opts.zona === "portal" ? "Finders" : "War Room",
      opts.zona === "portal"
        ? "Portal de colaboradores de Fontiber Industrial Partners."
        : "Herramienta interna de Fontiber Industrial Partners.",
      "Restablece tu contraseña",
      `<p ${P}>Hola ${name}, has solicitado restablecer tu contraseña. Pulsa para fijar una nueva:</p>
       ${button(opts.url, "Restablecer contraseña")}
       <p ${SMALL}>El enlace caduca en ${caduca}. Si no lo solicitaste, ignora este correo: tu contraseña no cambia. Si el botón no funciona, copia:<br/>${fallbackLink(opts.url)}</p>`
    ),
  };
}

// ─── Envío ───────────────────────────────────────────────────────────────────

/** Envía con Resend. Devuelve si lo aceptó; nunca lanza. */
async function send(from: string, to: string, email: Email): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.warn("lib/email-password-reset", "RESEND_API_KEY not set, skipping email");
    return false;
  }
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from, to, ...email });
    if (error) {
      log.error("lib/email-password-reset", "Resend error", { error });
      return false;
    }
    return true;
  } catch (err) {
    log.error("lib/email-password-reset", err);
    return false;
  }
}

export type SendPasswordResetEmailInput = {
  to: string;
  finderName: string;
  rawToken: string;
  expiresAt: Date;
};

export async function sendPasswordResetEmail(
  input: SendPasswordResetEmailInput
): Promise<void> {
  const url = `${BASE_URL}/portal/reset-password?token=${encodeURIComponent(
    input.rawToken
  )}`;
  await send(
    `Fontiber Portal <${FROM}>`,
    input.to,
    passwordResetEmail({
      zona: "portal",
      name: input.finderName,
      url,
      expiresAt: input.expiresAt,
    })
  );
}

export type SendAdminPasswordResetEmailInput = {
  to: string;
  adminName: string;
  rawToken: string;
  expiresAt: Date;
};

export async function sendAdminPasswordResetEmail(
  input: SendAdminPasswordResetEmailInput
): Promise<void> {
  const url = `${BASE_URL}/reset-password?token=${encodeURIComponent(
    input.rawToken
  )}`;
  await send(
    `${WAR_ROOM} <${ADMIN_FROM}>`,
    input.to,
    passwordResetEmail({
      zona: "warroom",
      name: input.adminName,
      url,
      expiresAt: input.expiresAt,
    })
  );
}

export type SendAdminInvitationEmailInput = {
  to: string;
  adminName: string;
  invitedBy: string;
  link: string;
  expiresAt: Date;
};

/**
 * Invitación a un usuario nuevo del war room. Devuelve si Resend aceptó el
 * envío, para que la pantalla de usuarios avise de copiar el enlace a mano.
 */
export async function sendAdminInvitationEmail(
  input: SendAdminInvitationEmailInput
): Promise<boolean> {
  return send(
    `${WAR_ROOM} <${ADMIN_FROM}>`,
    input.to,
    invitationEmail({
      name: input.adminName,
      invitedBy: input.invitedBy,
      url: input.link,
      expiresAt: input.expiresAt,
    })
  );
}
