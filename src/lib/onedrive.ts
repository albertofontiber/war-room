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

async function graphFetch<T>(
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

/**
 * Devuelve el siguiente número que debe usar una nueva carpeta `[N]. Nombre`
 * según la convención manual de Targets/. Lee las carpetas existentes,
 * extrae los prefijos numéricos (e.g. "33. Aize Bua" → 33, ignorando los
 * ficticios como "99. Otros") y devuelve max+1.
 *
 * Si no hay ninguna carpeta numerada, empieza por 1.
 *
 * NOTA: la carpeta `99. Otros` (cajón de sastre) se ignora deliberadamente
 * para que el siguiente target no se llame "100. ...".
 */
export async function getNextTargetNumber(): Promise<number> {
  const folders = await listTargetFolders({ fresh: true });
  let max = 0;
  for (const f of folders) {
    const m = f.name.match(/^\s*(\d+)\s*\./);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n)) continue;
    if (n >= 99) continue; // ignorar el cajón "99. Otros"
    if (n > max) max = n;
  }
  return max + 1;
}

/**
 * Crea una carpeta `[N]. {name}` dentro del path `ONEDRIVE_TARGETS_PATH`
 * y, dentro de ella, las 3 subcarpetas estándar (`Analyses`, `NDA`, `IRL`).
 *
 * Devuelve `webUrl` de la carpeta padre creada para guardar en
 * `Empresa.oneDriveUrl`. Invalida el cache de carpetas tras crear.
 *
 * Idempotente a nivel de Graph: si la carpeta ya existe (mismo nombre exacto),
 * Microsoft Graph devolvería 409. La protección contra duplicados se hace
 * en el caller (matcher pre-check + chequeo de oneDriveUrl null).
 */
export type CreatedFolder = {
  webUrl: string;
  name: string;
  number: number;
};

const STANDARD_SUBFOLDERS = ["Analyses", "NDA", "IRL"] as const;

export async function createTargetFolder(rawName: string): Promise<CreatedFolder> {
  const upn = envOrThrow("ONEDRIVE_OWNER_UPN");
  const path = envOrThrow("ONEDRIVE_TARGETS_PATH");
  const number = await getNextTargetNumber();
  const folderName = `${number}. ${rawName}`.trim();

  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  // 1) Crear carpeta padre `[N]. Nombre`
  type GraphItem = { id: string; name: string; webUrl: string };
  const parent: GraphItem = await graphFetch<GraphItem>(
    `/users/${encodeURIComponent(upn)}/drive/root:/${encodedPath}:/children`,
    {
      method: "POST",
      body: {
        name: folderName,
        folder: {},
        // Si por algún motivo ya existe, Graph devolverá 409. No usamos rename
        // automático para que el caller decida.
        "@microsoft.graph.conflictBehavior": "fail",
      },
    }
  );

  // 2) Crear las 3 subcarpetas estándar dentro de la recién creada
  for (const sub of STANDARD_SUBFOLDERS) {
    await graphFetch(
      `/users/${encodeURIComponent(upn)}/drive/items/${parent.id}/children`,
      {
        method: "POST",
        body: {
          name: sub,
          folder: {},
          "@microsoft.graph.conflictBehavior": "replace",
        },
      }
    );
  }

  // Invalidar cache para que el próximo listTargetFolders pille la carpeta
  foldersCache = null;

  log.info("onedrive", `createTargetFolder OK: "${folderName}"`, {
    parentId: parent.id,
    subfolders: STANDARD_SUBFOLDERS,
  });

  return { webUrl: parent.webUrl, name: folderName, number };
}

/** Limpia el cache de carpetas y de token (útil en tests). */
export function _resetOneDriveCache() {
  tokenCache = null;
  foldersCache = null;
}
