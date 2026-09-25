/**
 * Volver a la página pedida después del login.
 *
 * Sin sesión, el middleware manda al login de su zona con
 * `?callbackUrl=<ruta+query>` (la convención de NextAuth) y el login, tras
 * entrar, vuelve ahí en vez de a la portada. Así un enlace directo (el botón
 * del resumen diario, los emails de tareas, los avisos) sigue funcionando
 * aunque la sesión haya caducado.
 *
 * El destino llega en la URL y lo puede escribir cualquiera, así que solo se
 * acepta una ruta de la propia zona: nunca otro dominio (open redirect), ni el
 * propio login, ni una API, ni la otra zona (un admin no pinta nada en
 * `/portal`; un finder no entra al War Room).
 *
 * Módulo puro: lo usan el middleware (edge) y las páginas de login (servidor).
 */

export type Zona = "warroom" | "portal";

const ZONAS: Record<Zona, { login: string; inicio: string }> = {
  warroom: { login: "/login", inicio: "/" },
  portal: { login: "/portal/login", inicio: "/portal" },
};

// Origen ficticio para resolver el destino como URL: si al resolverlo cambia de
// origen es que apuntaba fuera ("//otro.com", "/\otro.com", "https://…").
const ORIGEN = "https://destino.invalid";

function rutaDeLaZona(zona: Zona, destino: string | null | undefined): string | null {
  if (!destino?.startsWith("/")) return null;
  let url: URL;
  try {
    url = new URL(destino, ORIGEN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGEN) return null;
  const { pathname, search } = url;
  // "/.//otro.com" se resuelve a la ruta "//otro.com": aquí es relativa, pero
  // el navegador la leería como otro dominio.
  if (pathname.startsWith("//")) return null;
  const { login } = ZONAS[zona];
  if (pathname === login || pathname.startsWith(`${login}/`)) return null;
  if (pathname.startsWith("/api/")) return null;
  const esPortal = pathname === "/portal" || pathname.startsWith("/portal/");
  if (esPortal !== (zona === "portal")) return null;
  return pathname + search;
}

/** Adónde ir tras entrar: el destino pedido si es válido; si no, la portada de la zona. */
export function destinoTrasLogin(zona: Zona, callbackUrl: string | null | undefined): string {
  return rutaDeLaZona(zona, callbackUrl) ?? ZONAS[zona].inicio;
}

/** URL del login que, tras entrar, vuelve a `destino` (la portada no hace falta pedirla). */
export function urlLogin(zona: Zona, destino: string): string {
  const { login, inicio } = ZONAS[zona];
  const ruta = rutaDeLaZona(zona, destino);
  if (!ruta || ruta === inicio) return login;
  return `${login}?${new URLSearchParams({ callbackUrl: ruta })}`;
}
