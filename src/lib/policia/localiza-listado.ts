/**
 * Localiza la edición vigente del listado nacional de empresas inscritas.
 *
 * La Policía no publica índice ni URL estable: el enlace apunta directamente a
 * un PDF cuyo nombre lleva la fecha, y el formato ha ido cambiando entre
 * ediciones. Estas son las variantes vistas:
 *
 *   empresas_inscritas_09_02_26.pdf      (año a 2 dígitos)
 *   empresas_inscritas_03_09_2025.pdf    (año a 4 dígitos)
 *   empresas_inscritas_03 07 2024.pdf    (separado por espacios)
 *   empresas_seguridad_25_05_22.pdf      (otro prefijo, edición antigua)
 *
 * El directorio devuelve 403 y la sede electrónica solo lleva al portal Red
 * Azul, que es de acceso restringido. Así que la única vía es probar nombres
 * candidatos. Sale a cuenta porque las ediciones antiguas siguen publicadas y
 * las fechas inexistentes dan un 404 limpio.
 *
 * Para no machacar el servidor, se prueba con peticiones HEAD, de la fecha más
 * reciente hacia atrás, y se para en la primera que responda.
 */

const BASE = "https://www.policia.es/miscelanea/seguridad_privada/sector";
const AGENTE = "war-room/1.0 (+contacto@fontiber.com)";

/** Prefijos de nombre de fichero vistos, del más reciente al más antiguo. */
const PREFIJOS = ["empresas_inscritas", "empresas_seguridad"];

/** Días que se sondean a la vez. Con 6 candidatos cada uno, son 18 peticiones
 *  simultáneas: suficiente para no eternizarse y comedido para un servidor
 *  público. */
const DIAS_POR_TANDA = 3;

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Todos los nombres plausibles para una fecha dada. */
export function candidatos(fecha: Date): string[] {
  const d = dosDigitos(fecha.getUTCDate());
  const m = dosDigitos(fecha.getUTCMonth() + 1);
  const aa = dosDigitos(fecha.getUTCFullYear() % 100);
  const aaaa = String(fecha.getUTCFullYear());

  const out: string[] = [];
  for (const prefijo of PREFIJOS) {
    out.push(
      `${prefijo}_${d}_${m}_${aa}.pdf`,
      `${prefijo}_${d}_${m}_${aaaa}.pdf`,
      `${prefijo}_${d} ${m} ${aaaa}.pdf`
    );
  }
  return out;
}

export interface ListadoLocalizado {
  url: string;
  /** Fecha codificada en el nombre del fichero. */
  fecha: Date;
}

/**
 * Busca la edición más reciente publicada, de `desde` hacia atrás.
 *
 * La ventana por defecto es corta a propósito. El cron corre mensualmente y su
 * trabajo es detectar ediciones NUEVAS, no encontrar la vigente: esa ya está
 * cargada. Con 45 días, dos ejecuciones consecutivas se solapan y no se escapa
 * ninguna, y cada pasada se queda en unos cientos de peticiones HEAD en el peor
 * caso (cuando no hay edición nueva, que es lo habitual: salen unas dos o tres
 * al año).
 *
 * Buscar la vigente desde cero exigiría barrer un año entero, que son miles de
 * peticiones contra un servidor público. Para eso está `--pdf` en el script.
 *
 * @param desde Día por el que empezar a probar (normalmente hoy).
 * @param dias Cuántos días hacia atrás mirar.
 * @param head Sonda; se inyecta en los tests para no salir a la red.
 */
export async function localizaListado(
  desde: Date,
  dias = 45,
  head: (url: string) => Promise<boolean> = sondaHttp
): Promise<ListadoLocalizado | null> {
  // El servidor tarda ~3 s en contestar a cada HEAD, así que en serie una
  // ventana de 45 días se iría a más de diez minutos y no cabría en el
  // tiempo máximo de la función. Se sondea por tandas de días, en paralelo
  // dentro de cada tanda, y se para en la primera tanda con acierto. El
  // resultado es el mismo que en serie porque dentro de la tanda se elige
  // siempre la fecha más reciente.
  for (let inicio = 0; inicio < dias; inicio += DIAS_POR_TANDA) {
    const tanda = Array.from(
      { length: Math.min(DIAS_POR_TANDA, dias - inicio) },
      (_, k) => new Date(desde.getTime() - (inicio + k) * 86_400_000)
    );

    const hallazgos = await Promise.all(
      tanda.map(async (fecha) => {
        for (const nombre of candidatos(fecha)) {
          const url = `${BASE}/${encodeURIComponent(nombre)}`;
          if (await head(url)) return { url, fecha };
        }
        return null;
      })
    );

    // `tanda` va de más reciente a más antigua, así que vale el primero.
    const hallado = hallazgos.find((h) => h !== null);
    if (hallado) return hallado;
  }
  return null;
}

async function sondaHttp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": AGENTE },
    });
    return res.ok;
  } catch {
    // Un fallo de red no es un "no existe": se sigue probando.
    return false;
  }
}

/** Descarga el PDF de una edición localizada. */
export async function descargaListado(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": AGENTE } });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
