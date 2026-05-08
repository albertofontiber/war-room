/**
 * Cliente Microsoft Graph compartido por módulos server-side.
 *
 * Autenticación: Application permissions (client_credentials flow), no usuario
 * delegado. Funciona desde server-side sin OAuth interactivo.
 *
 * Permisos requeridos en Azure App Registration "War Room - OneDrive Sync":
 *   - Files.Read.All / Sites.Read.All  (OneDrive — listar/crear carpetas)
 *   - Mail.Read                         (Email — leer SentItems)
 * Más Grant admin consent.
 *
 * Mail.Read está limitado a `alberto@` y `gabriel@` vía Application Access
 * Policy en Exchange Online (configurada con `New-ApplicationAccessPolicy`,
 * scope group `warroom-mail-scope@fontiber.com`). Esto significa que aunque
 * el scope `Mail.Read` sea técnicamente "all mailboxes", la policy bloquea
 * la lectura de cualquier buzón fuera de los autorizados.
 *
 * Env vars necesarias: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.
 */

const SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Cache de access token en memoria. Microsoft devuelve tokens válidos ~60min.
// Renovamos a los 50min para tener margen.
let tokenCache: { token: string; expiresAt: number } | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function getAccessToken(opts?: { forceFresh?: boolean }): Promise<string> {
  if (!opts?.forceFresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const tenantId = envOrThrow("AZURE_TENANT_ID");
  const clientId = envOrThrow("AZURE_CLIENT_ID");
  const clientSecret = envOrThrow("AZURE_CLIENT_SECRET");

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: SCOPE,
  });

  // `cache: "no-store"` es CRÍTICO: Next.js / runtime de Vercel cachea
  // por defecto las respuestas de fetch en functions, incluso POSTs. Si no
  // lo desactivamos explícitamente, recibimos respuestas cacheadas con
  // tokens ya expirados (issuedAt en el pasado, exp también en el pasado),
  // y todas las llamadas a Graph fallan con "Lifetime validation failed".
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Azure token request failed (${res.status}): ${errText}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + Math.min(TOKEN_TTL_MS, json.expires_in * 1000),
  };
  return tokenCache.token;
}

/**
 * Llama a Microsoft Graph autenticando con el token cacheado. Si Graph
 * devuelve 401 ("InvalidAuthenticationToken" / "Lifetime validation failed"),
 * invalida el cache, obtiene un token fresco y reintenta UNA vez.
 *
 * Esta retry es necesaria porque:
 *   1. Tras cambiar permisos en Azure AD (admin consent, Application Access
 *      Policy), los tokens emitidos antes pueden quedar invalidados sin que
 *      su `exp` haya pasado.
 *   2. El cache en memoria sobrevive durante toda la vida de la función
 *      serverless de Vercel — sin retry, esa instancia seguiría fallando
 *      hasta que muriera (varios minutos en frío, más en caliente).
 */
export async function graphFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown }
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const method = init?.method ?? "GET";
  const bodyStr = init?.body ? JSON.stringify(init.body) : undefined;

  // `cache: "no-store"` también aquí: las respuestas de Graph cambian con
  // el tiempo (SentItems, mailFolders, etc.) y queremos garantizar lectura
  // fresca cada vez. Sin esto, tras un fetch satisfactorio Next.js puede
  // cachear y servir respuestas viejas en peticiones siguientes.
  const doFetch = async (token: string) =>
    fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(bodyStr ? { "Content-Type": "application/json" } : {}),
      },
      body: bodyStr,
      cache: "no-store",
    });

  let token = await getAccessToken();
  let res = await doFetch(token);

  // Retry on 401: invalida cache, pide token fresco, reintenta.
  if (res.status === 401) {
    _resetGraphAuthCache();
    token = await getAccessToken({ forceFresh: true });
    res = await doFetch(token);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Graph ${path} failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as T;
}

/** Limpia el cache de token (útil en tests y tras 401 retry). */
export function _resetGraphAuthCache() {
  tokenCache = null;
}

/**
 * Decodifica un JWT sin verificar firma. Solo para diagnóstico (endpoint
 * `/api/cron/email-tasks/debug`) — NO usar para validación de seguridad.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const decoded = Buffer.from(
      padded.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf-8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}
