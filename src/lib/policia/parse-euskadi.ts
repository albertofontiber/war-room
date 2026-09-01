/**
 * Parser del "Registro de seguridad privada de Euskadi: Empresas de Seguridad"
 * (Ertzaintza).
 *
 * Cataluña y el País Vasco tienen la competencia transferida, así que las
 * empresas con habilitación SOLO autonómica en esos territorios no aparecen en
 * el listado nacional de la Policía. De ahí que haya que leer los tres.
 *
 * Es un PDF de una página con las mismas ocho columnas de habilitación que el
 * listado nacional, pero marcadas con "X" en vez de E/A: al ser un registro
 * autonómico, todas las habilitaciones lo son por definición.
 *
 * Dos particularidades frente al PDF nacional:
 *
 *   - La página está ROTADA 90°, así que en las coordenadas que devuelve pdf.js
 *     las filas de la tabla salen como columnas. Se normaliza antes de nada.
 *   - El CIF y el domicilio llegan pegados en un mismo fragmento
 *     ("B20160552 AVENIDA TOLOSA 119 BAJO"), así que el CIF se saca por patrón
 *     en vez de por posición.
 *
 * Fuente: https://www.ertzaintza.euskadi.eus/lfr/web/ertzaintza/comunicacion-empresas
 */

import { fetchConReintento } from "@/lib/registros/red";
import { HABILITACIONES, type MapaHabilitaciones } from "./habilitaciones";

/**
 * URL del PDF. Es estable —el `?t=` que lleva el enlace de la web es solo un
 * antichaché y no hace falta— así que el cron puede pedirla tal cual.
 */
export const URL_EUSKADI =
  "https://www.ertzaintza.euskadi.eus/lfr/documents/62347/823444/Registro+EMPRESAS+CAPV+WEB.pdf/e83afd8c-ef05-efb1-6c1b-8badba15b642";

/**
 * Centro de la primera columna de habilitación (VJ) y separación entre ellas,
 * ya con la página enderezada. Son centros, no bordes: la marca "X" va
 * centrada en su casilla, así que el índice sale de redondear la distancia.
 */
const CENTRO_PRIMERA_HABILITACION = 677;
const ANCHO_HABILITACION = 14.5;

/** Columna donde empieza la razón social, y dónde acaba. */
const NOMBRE_DESDE = 80;
const NOMBRE_HASTA = 300;

const TOLERANCIA_LINEA = 3;

/** Un CIF de sociedad, o el NIF de un autónomo. */
const PATRON_CIF = /\b([A-Z]\d{8}|\d{8}[A-Z])\b/;

export interface EmpresaEuskadi {
  nombre: string;
  cif: string;
  habilitaciones: MapaHabilitaciones;
}

interface Frag {
  texto: string;
  x: number;
  y: number;
}

/**
 * Convierte los fragmentos de la página en registros.
 *
 * Separado de la lectura del PDF para poder probarlo sin fixture.
 *
 * @param frags Fragmentos ya enderezados (ver `parseRegistroEuskadi`).
 */
export function extraeEuskadi(frags: readonly Frag[]): EmpresaEuskadi[] {
  const filas = new Map<number, Frag[]>();
  for (const f of frags) {
    // Se agrupa por bandas de `TOLERANCIA_LINEA` para absorber los decimales.
    const banda = Math.round(f.y / TOLERANCIA_LINEA);
    filas.set(banda, [...(filas.get(banda) ?? []), f]);
  }

  const out: EmpresaEuskadi[] = [];

  for (const fila of filas.values()) {
    const texto = fila
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((f) => f.texto)
      .join(" ");

    const cif = PATRON_CIF.exec(texto.toUpperCase())?.[1];
    if (!cif) continue;

    const nombre = fila
      .filter((f) => f.x >= NOMBRE_DESDE && f.x < NOMBRE_HASTA)
      .sort((a, b) => a.x - b.x)
      .map((f) => f.texto)
      // El fragmento del nombre puede arrastrar el CIF pegado detrás.
      .join(" ")
      .replace(PATRON_CIF, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!nombre) continue;

    const habilitaciones: MapaHabilitaciones = {};
    for (const marca of fila) {
      if (marca.texto.trim().toUpperCase() !== "X") continue;
      const indice = Math.round(
        (marca.x - CENTRO_PRIMERA_HABILITACION) / ANCHO_HABILITACION
      );
      const habilitacion = HABILITACIONES[indice];
      // Todo el registro es autonómico: no hay distinción E/A que leer.
      if (habilitacion) habilitaciones[habilitacion.codigo] = "A";
    }

    out.push({ nombre, cif, habilitaciones });
  }

  return out;
}

/**
 * Descarga y parsea el registro vasco.
 *
 * @param pdf Contenido del PDF; si no se pasa, se descarga.
 */
export async function parseRegistroEuskadi(pdf?: Buffer): Promise<EmpresaEuskadi[]> {
  let datos = pdf;
  if (!datos) {
    const res = await fetchConReintento(URL_EUSKADI);
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el registro vasco`);
    datos = Buffer.from(await res.arrayBuffer());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as any;

  const frags: Frag[] = [];

  await pdfParse(datos, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pagerender: async (pagina: any) => {
      const contenido = await pagina.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });
      const rotada = pagina.rotate === 90;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of contenido.items as any[]) {
        if (!item.str.trim()) continue;
        const t = item.transform as number[];
        // Con la página rotada 90°, lo que pdf.js da como (x, y) son
        // (columna, fila) cambiados de sitio: se enderezan aquí para que el
        // resto del parser trabaje con filas y columnas normales.
        frags.push(
          rotada
            ? { texto: item.str, x: t[5], y: -t[4] }
            : { texto: item.str, x: t[4], y: t[5] }
        );
      }
      return "";
    },
  });

  return extraeEuskadi(frags);
}
