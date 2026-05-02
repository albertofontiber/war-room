/**
 * Cliente Notion API para extraer páginas hijas de la página padre "Targets".
 *
 * Cada target tiene una sub-página dentro de la página padre cuyo ID está en
 * `NOTION_TARGETS_PAGE_ID`. La integration "War Room" debe estar conectada a
 * esa página padre desde el menu Connections de Notion (las hijas heredan el
 * acceso automáticamente).
 *
 * Env vars necesarias:
 *   - NOTION_API_KEY            (Internal Integration Secret)
 *   - NOTION_TARGETS_PAGE_ID    (e.g. 273b7e7ca2ea80c78a94d439f08de0b1)
 */

import { log } from "@/lib/logger";

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export type NotionPage = {
  id: string;
  title: string;
  url: string;
};

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function notionFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = envOrThrow("NOTION_API_KEY");
  const res = await fetch(`${NOTION_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Notion ${path} failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as T;
}

/**
 * Lista todas las páginas hijas de la página `NOTION_TARGETS_PAGE_ID`.
 *
 * Notion expone los hijos como bloques (`/blocks/{id}/children`); los hijos
 * que son sub-páginas tienen `type: "child_page"` y `child_page.title`.
 * Para construir la URL pública usamos `/pages/{id}` que devuelve el campo `url`.
 *
 * Performance: cachea en memoria con TTL 5min (mismo patrón que onedrive.ts).
 * Para 100+ targets, una sola pasada de paginación basta.
 */
let pagesCache: { pages: NotionPage[]; expiresAt: number } | null = null;
const PAGES_TTL_MS = 5 * 60 * 1000;

export async function listTargetPages(opts?: { fresh?: boolean }): Promise<NotionPage[]> {
  if (!opts?.fresh && pagesCache && pagesCache.expiresAt > Date.now()) {
    return pagesCache.pages;
  }

  const parentId = envOrThrow("NOTION_TARGETS_PAGE_ID");

  const all: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    type BlockChild = {
      id: string;
      type: string;
      child_page?: { title: string };
    };
    type BlocksResponse = {
      results: BlockChild[];
      next_cursor: string | null;
      has_more: boolean;
    };
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : `?page_size=100`;
    const json: BlocksResponse = await notionFetch(`/blocks/${parentId}/children${qs}`);

    for (const block of json.results) {
      if (block.type !== "child_page" || !block.child_page) continue;
      // Construir la URL canónica de Notion: el formato público es
      // https://www.notion.so/{title-slug}-{id-without-dashes}
      // Lo más fiable es pedir /pages/{id} para obtener `url` exacto, pero
      // hace un round-trip por página. Para empezar construimos la URL en local
      // (Notion la acepta independientemente del slug, es el id la clave).
      const idClean = block.id.replace(/-/g, "");
      const slug = block.child_page.title
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase();
      const url = `https://www.notion.so/${slug}-${idClean}`;
      all.push({
        id: block.id,
        title: block.child_page.title,
        url,
      });
    }

    cursor = json.has_more && json.next_cursor ? json.next_cursor : undefined;
  } while (cursor);

  pagesCache = { pages: all, expiresAt: Date.now() + PAGES_TTL_MS };
  log.info("notion", `listTargetPages: ${all.length} pages`, { parentId });
  return all;
}

/**
 * Crea una sub-página vacía bajo la página padre `NOTION_TARGETS_PAGE_ID`
 * con `title` como título. Devuelve la página creada (id + url).
 *
 * La integration "War Room" debe estar conectada a la página padre para
 * que pueda crear hijas (eso ya está hecho).
 *
 * Invalida el cache de páginas tras crear para que un siguiente
 * listTargetPages la incluya.
 */
export type CreatedPage = {
  id: string;
  url: string;
  title: string;
};

export async function createTargetPage(title: string): Promise<CreatedPage> {
  const parentId = envOrThrow("NOTION_TARGETS_PAGE_ID");

  type CreatePageResponse = {
    id: string;
    url: string;
  };
  const json = await notionFetch<CreatePageResponse>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentId },
      properties: {
        title: [{ type: "text", text: { content: title } }],
      },
    }),
  });

  pagesCache = null;
  log.info("notion", `createTargetPage OK: "${title}"`, { id: json.id });
  return { id: json.id, url: json.url, title };
}

/** Limpia el cache (útil en tests / scripts one-off). */
export function _resetNotionCache() {
  pagesCache = null;
}
