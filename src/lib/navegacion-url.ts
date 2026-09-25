/**
 * Esquema de URL de las vistas del War Room. La vista activa es un search
 * param de la portada (`/?vista=operaciones`), no una ruta propia:
 * `/operaciones` o `/tabla` no existen y dan 404.
 *
 * Sin "use client" a propósito: lo comparten el hook `useNavegacion`, que lee
 * la URL, y quien enlaza a una vista desde fuera de `/` (páginas de servidor
 * como `/daily/[fecha]`, la Navbar desde `/pipeline`). Así el enlace se
 * construye con las mismas constantes con las que luego se lee.
 */

import type { Vista } from "@/types";

export const VISTAS: readonly Vista[] = ["mapa", "tabla", "operaciones", "grupos"];

/** No se serializa: la portada queda en `/`, sin parámetros. */
export const VISTA_POR_DEFECTO: Vista = "mapa";

/** Vista que pide la URL; un valor ausente o desconocido cae en la de por defecto. */
export function leerVista(params: URLSearchParams): Vista {
  const v = params.get("vista");
  return VISTAS.includes(v as Vista) ? (v as Vista) : VISTA_POR_DEFECTO;
}

/** Enlace a una vista del War Room desde cualquier otra página. */
export function hrefVista(vista: Vista): string {
  return vista === VISTA_POR_DEFECTO ? "/" : `/?vista=${vista}`;
}
