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

export async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;

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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
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

export async function graphFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown }
): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Graph ${path} failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as T;
}

/** Limpia el cache de token (útil en tests). */
export function _resetGraphAuthCache() {
  tokenCache = null;
}
