/**
 * /api/cron/email-tasks/debug
 *
 * Healthcheck para diagnosticar el cron de email-tasks sin pegar credenciales
 * en una shell. Protegido por `CRON_SECRET` igual que el endpoint principal.
 *
 * Devuelve:
 *   - `roles`: roles del access token (debe incluir Mail.Read, Files.Read.All,
 *     Sites.Read.All).
 *   - `tokenExpiresIn`: segundos restantes hasta que el token caduque.
 *   - `tokenIssuedAt` / `tokenExpiresAt`: ISO strings del `iat`/`exp` claim.
 *   - `audience`, `tenantId`, `appId`: contexto del token.
 *   - `mailReadCheck[upn]`: resultado de un fetch test a Graph para cada UPN
 *     en `EMAIL_TASK_OWNER_UPNS` — `ok` o el error completo de Graph.
 *
 * NO devuelve el token entero (privacy). Solo el payload decodificado, que es
 * pública por diseño (lo emite Azure AD para identificar al cliente).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, decodeJwtPayload, _resetGraphAuthCache } from "@/lib/graph-auth";
import { log } from "@/lib/logger";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type MailCheckResult =
  | { upn: string; ok: true; sampleSubject: string | null }
  | { upn: string; ok: false; status: number; error: string };

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Param `?fresh=1` invalida el token cacheado antes de pedir uno nuevo.
  // Útil cuando se sospecha que el cache tiene un token con permisos viejos.
  const forceFresh = req.nextUrl.searchParams.get("fresh") === "1";
  if (forceFresh) _resetGraphAuthCache();

  let token: string;
  try {
    token = await getAccessToken({ forceFresh });
  } catch (err) {
    log.error("cron/email-tasks/debug:getToken", err);
    return NextResponse.json(
      {
        ok: false,
        stage: "getAccessToken",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 }
    );
  }

  const claims = decodeJwtPayload(token);
  if (!claims) {
    return NextResponse.json(
      { ok: false, stage: "decodeJwt", error: "JWT decoding failed" },
      { status: 200 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = typeof claims.exp === "number" ? claims.exp : null;
  const iat = typeof claims.iat === "number" ? claims.iat : null;

  // Test directo a Graph para cada UPN de EMAIL_TASK_OWNER_UPNS.
  const upnsRaw = process.env.EMAIL_TASK_OWNER_UPNS ?? "";
  const upns = upnsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const mailReadCheck: MailCheckResult[] = [];
  for (const upn of upns) {
    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}/mailFolders/SentItems/messages?$top=1&$select=subject`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );
      if (res.ok) {
        const json = (await res.json()) as { value: Array<{ subject: string | null }> };
        mailReadCheck.push({
          upn,
          ok: true,
          sampleSubject: json.value[0]?.subject ?? null,
        });
      } else {
        const errText = await res.text().catch(() => "");
        mailReadCheck.push({ upn, ok: false, status: res.status, error: errText });
      }
    } catch (err) {
      mailReadCheck.push({
        upn,
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: mailReadCheck.every((c) => c.ok),
    forceFresh,
    token: {
      audience: claims.aud ?? null,
      tenantId: claims.tid ?? null,
      appId: claims.appid ?? claims.azp ?? null,
      issuedAt: iat ? new Date(iat * 1000).toISOString() : null,
      expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
      expiresInSec: exp ? exp - now : null,
      // Roles concedidos a la app — los importantes son Mail.Read,
      // Files.Read.All, Sites.Read.All.
      roles: Array.isArray(claims.roles) ? claims.roles : null,
    },
    mailReadCheck,
  });
}
