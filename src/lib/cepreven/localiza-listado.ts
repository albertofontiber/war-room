/**
 * Localiza y descarga el "Listado CALIFICACIÓN" vigente de Cepreven.
 *
 * El nombre del fichero lleva número de edición y fecha —"Listado
 * CALIFICACIÓN 62 20260720.pdf"—, así que cambia con cada edición y no se
 * puede fijar: hay que leerlo de la página de descargas.
 *
 * El HTML de esa página está escrito a mano y es inconsistente: dentro del
 * mismo documento conviven `href="…"` y `href ="…"` con espacio antes del
 * igual. En septiembre de 2026 el enlace al listado pasó a la variante con
 * espacio y el cron dejó de encontrarlo, así que el patrón admite las dos
 * grafías y las comillas simples.
 */

import { fetchConReintento } from "@/lib/registros/red";

const URL_DESCARGAS = "https://www.calificacioncepreven.com/Descarga-Documentos.html";

/**
 * Saca del HTML el enlace al PDF del listado de calificación.
 *
 * Función pura para poder probar el patrón contra las grafías vistas sin
 * salir a la red, que es justo lo que se rompió.
 *
 * @returns La URL absoluta, o null si la página ya no lleva el enlace.
 */
export function enlaceListado(html: string): string | null {
  const enlaces = [...html.matchAll(/href\s*=\s*["']([^"']*Listado[^"']*\.pdf)["']/gi)].map(
    (m) => m[1]
  );
  if (enlaces.length === 0) return null;

  // Los espacios del nombre de fichero hay que escaparlos a mano: `new URL`
  // no los toca, y el servidor devuelve 404 con el espacio crudo.
  return new URL(enlaces[0].replace(/ /g, "%20"), URL_DESCARGAS).toString();
}

/** Baja el PDF de calificadas vigente. */
export async function descargaListadoCepreven(): Promise<Buffer> {
  const portada = await fetchConReintento(URL_DESCARGAS);
  if (!portada.ok) throw new Error(`HTTP ${portada.status} al abrir la página de descargas`);

  const html = await portada.text();
  const url = enlaceListado(html);
  if (!url) {
    // Cuántos PDF hay en la página distingue "han cambiado el enlace" de
    // "han rehecho la web", que es lo primero que se querrá saber.
    const pdfs = [...html.matchAll(/\.pdf/gi)].length;
    throw new Error(
      `No se encontró el enlace al listado de calificación en ${URL_DESCARGAS} ` +
        `(${html.length} bytes de HTML, ${pdfs} menciones a .pdf)`
    );
  }

  const res = await fetchConReintento(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
