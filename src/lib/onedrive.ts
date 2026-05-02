/**
 * Cliente Microsoft Graph para OneDrive.
 *
 * Autenticación: Application permissions (client_credentials flow), no usuario
 * delegado. Funciona desde server-side sin OAuth interactivo.
 *
 * Permisos requeridos en Azure App Registration:
 *   - Files.Read.All
 *   - Sites.Read.All
 * Más Grant admin consent.
 *
 * Env vars necesarias:
 *   - AZURE_TENANT_ID
 *   - AZURE_CLIENT_ID
 *   - AZURE_CLIENT_SECRET
 *   - ONEDRIVE_OWNER_UPN  (e.g. alberto@fontiber.com)
 *   - ONEDRIVE_TARGETS_PATH  (e.g. /Desktop/Roll-up/.../2. Targets)
 */

import { log } from "@/lib/logger";

const SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Cache de access token en memoria. Microsoft devuelve tokens válidos ~60min.
// Renovamos a los 50min para tener margen.
let tokenCache: { token: string; expiresAt: number } | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

export type OneDriveFolder = {
  id: string;
  name: string;
  webUrl: string;
};

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function getAccessToken(): Promise<string> {
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

async function graphFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Graph ${path} failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as T;
}

/**
 * Lista todas las carpetas hijas de la ruta `ONEDRIVE_TARGETS_PATH` dentro del
 * drive del usuario `ONEDRIVE_OWNER_UPN`. Pagina automáticamente.
 *
 * Solo devuelve carpetas (filtra archivos sueltos).
 *
 * Performance: cachea el resultado en memoria con TTL corto (5 min) para que
 * el matcher no machaque Graph al procesar muchas empresas.
 */
let foldersCache: { folders: OneDriveFolder[]; expiresAt: number } | null = null;
const FOLDERS_TTL_MS = 5 * 60 * 1000;

export async function listTargetFolders(opts?: { fresh?: boolean }): Promise<OneDriveFolder[]> {
  if (!opts?.fresh && foldersCache && foldersCache.expiresAt > Date.now()) {
    return foldersCache.folders;
  }

  const upn = envOrThrow("ONEDRIVE_OWNER_UPN");
  const path = envOrThrow("ONEDRIVE_TARGETS_PATH");
  // El path en Graph se codifica con URL-encoded segments.
  // Usamos el formato `/users/{upn}/drive/root:{path}:/children`.
  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  let nextUrl: string | null = `/users/${encodeURIComponent(upn)}/drive/root:/${encodedPath}:/children?$top=200&$select=id,name,webUrl,folder`;

  const all: OneDriveFolder[] = [];
  while (nextUrl) {
    type GraphChildrenResponse = {
      value: Array<{
        id: string;
        name: string;
        webUrl: string;
        folder?: { childCount: number };
      }>;
      "@odata.nextLink"?: string;
    };
    const json: GraphChildrenResponse = await graphFetch(nextUrl);
    for (const item of json.value) {
      // Solo carpetas. `folder` viene poblado para carpetas; ausente para archivos.
      if (item.folder) {
        all.push({ id: item.id, name: item.name, webUrl: item.webUrl });
      }
    }
    nextUrl = json["@odata.nextLink"] ?? null;
  }

  foldersCache = { folders: all, expiresAt: Date.now() + FOLDERS_TTL_MS };
  log.info("onedrive", `listTargetFolders: ${all.length} folders`, { path });
  return all;
}

/** Limpia el cache de carpetas y de token (útil en tests). */
export function _resetOneDriveCache() {
  tokenCache = null;
  foldersCache = null;
}
