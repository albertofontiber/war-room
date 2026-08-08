/**
 * Cliente del buscador público del Registro Integrado Industrial (división B).
 *
 * Es un WebForms de ASP.NET, así que no hay API: hay que mantener el
 * ViewState y encadenar postbacks. La cascada es
 * División → Sección → Habilitación, porque cada desplegable rellena al
 * siguiente, y solo entonces se puede filtrar.
 *
 * Dos cosas medidas contra el servidor que condicionan el diseño:
 *
 *   - El coste por página **depende del tamaño del resultado**, porque el
 *     servidor reejecuta la consulta en cada postback. Un resultado de ~3.800
 *     filas tarda ~45 s por página; uno de unos cientos, 5-7 s. Por eso el
 *     cron filtra por fecha en vez de pedirlo todo.
 *   - El tope es 5.000 registros por consulta; pasándolo, el buscador no
 *     devuelve nada y avisa con una alerta.
 *
 * (El CSV de datos abiertos del ministerio parece la alternativa cómoda, pero
 * es de marzo de 2021 y se queda corto en más de mil empresas. No usarlo.)
 */

const URL_BUSCADOR =
  "https://industria.serviciosmin.gob.es/RII/UI/Gestion/ConsultaPublicaDivisiones_B_C.aspx";
const AGENTE = "war-room/1.0 (+contacto@fontiber.com)";
const CAMPO = "ctl00$ContentBody$";
const PAG = "ctl00$ContentBody$UCPaginacionVersion2_2$";

/** Habilitación (C) = Instalaciones Contra Incendios, RD 513/2017. */
const HABILITACION_RIPCI = "C";

export type SeccionBuscador = "D" | "E";

export interface FilaRipci {
  fecha: string;
  estado: string;
  titular: string;
  nif: string;
  /** Código de registro; su tercera pieza codifica sección y categoría. */
  numero: string;
  ccaa: string;
  seccion: SeccionBuscador;
}

/** Mantiene cookies y ViewState entre postbacks. */
class Sesion {
  private cookies = new Map<string, string>();

  private cabeceras(): Record<string, string> {
    const galletas = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return {
      "User-Agent": AGENTE,
      ...(galletas ? { Cookie: galletas } : {}),
    };
  }

  private guardaCookies(res: Response) {
    for (const linea of res.headers.getSetCookie?.() ?? []) {
      const [par] = linea.split(";");
      const i = par.indexOf("=");
      if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  }

  async get(): Promise<string> {
    const res = await fetch(URL_BUSCADOR, { headers: this.cabeceras() });
    if (!res.ok) throw new Error(`HTTP ${res.status} al abrir el buscador`);
    this.guardaCookies(res);
    return res.text();
  }

  async post(pagina: string, campos: Record<string, string>): Promise<string> {
    const cuerpo = new URLSearchParams({ ...estadoDe(pagina), ...campos });
    const res = await fetch(URL_BUSCADOR, {
      method: "POST",
      headers: {
        ...this.cabeceras(),
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: URL_BUSCADOR,
      },
      body: cuerpo.toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en el postback`);
    this.guardaCookies(res);
    return res.text();
  }
}

/** Campos ocultos que ASP.NET exige devolver en cada postback. */
function estadoDe(pagina: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const campo of [
    "__VIEWSTATE",
    "__VIEWSTATEGENERATOR",
    "__EVENTVALIDATION",
    "__VIEWSTATEENCRYPTED",
  ]) {
    const m = new RegExp(`id="${campo}" value="([^"]*)"`).exec(pagina);
    if (m) out[campo] = desescapa(m[1]);
  }
  return out;
}

function desescapa(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function limpia(html: string): string {
  return desescapa(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** El buscador avisa por alerta cuando la consulta pasa de 5.000 registros. */
export function pasaDelTope(pagina: string): boolean {
  return /Se ha superado el l[íi]mite/i.test(pagina);
}

function totalPaginas(pagina: string): number {
  const m = /lblNumPaginas[^>]*>\s*de\s*([0-9]+)/.exec(pagina);
  return m ? Number(m[1]) : 1;
}

function filasDe(pagina: string, seccion: SeccionBuscador): FilaRipci[] {
  const tabla = /id="ContentBody_gvGestionConsultaDivisionesBC"[\s\S]*?<\/table>/.exec(pagina);
  if (!tabla) return [];

  const out: FilaRipci[] = [];
  for (const [, tr] of tabla[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const celdas = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => limpia(c[1]));
    if (celdas.length < 7) continue;

    const doc = celdas[4].replace(/\s+/g, "");
    const nif = /([A-Z][0-9]{7}[A-Z0-9]|[0-9]{8}[A-Z])/.exec(doc.toUpperCase())?.[1];
    if (!nif) continue;

    out.push({
      fecha: celdas[1],
      estado: celdas[2],
      titular: celdas[3],
      nif,
      numero: celdas[5],
      ccaa: celdas[6],
      seccion,
    });
  }
  return out;
}

/**
 * Consulta las empresas con habilitación RIPCI inscritas desde una fecha.
 *
 * @param seccion "D" instaladoras, "E" mantenedoras.
 * @param desde Fecha en formato DD/MM/AAAA. Acota el resultado, que es lo que
 *   mantiene rápida la paginación.
 */
export async function consultaDesde(
  seccion: SeccionBuscador,
  desde: string
): Promise<FilaRipci[]> {
  const sesion = new Sesion();
  let pagina = await sesion.get();

  // Cascada: cada desplegable rellena el siguiente.
  pagina = await sesion.post(pagina, {
    __EVENTTARGET: `${CAMPO}ddDivisionY`,
    [`${CAMPO}ddDivisionY`]: "B",
  });
  pagina = await sesion.post(pagina, {
    __EVENTTARGET: `${CAMPO}ddSeccionZ1`,
    [`${CAMPO}ddDivisionY`]: "B",
    [`${CAMPO}ddSeccionZ1`]: seccion,
  });

  pagina = await sesion.post(pagina, {
    [`${CAMPO}ddDivisionY`]: "B",
    [`${CAMPO}ddSeccionZ1`]: seccion,
    [`${CAMPO}ddHabilitacionZ2`]: HABILITACION_RIPCI,
    [`${CAMPO}TxtFechaRegistroDesde`]: desde,
    [`${CAMPO}ChbActivo`]: "on",
    [`${CAMPO}ChbBaja`]: "on",
    [`${CAMPO}btnFiltrar`]: "Filtrar",
  });

  if (pasaDelTope(pagina)) {
    throw new Error(
      `La consulta desde ${desde} pasa de 5.000 registros: hay que acortar la ventana`
    );
  }

  pagina = await sesion.post(pagina, {
    [`${PAG}ddlNumReg`]: "100",
    __EVENTTARGET: `${PAG}ddlNumReg`,
  });

  const total = totalPaginas(pagina);
  const filas: FilaRipci[] = [...filasDe(pagina, seccion)];

  for (let i = 2; i <= total; i++) {
    pagina = await sesion.post(pagina, {
      [`${PAG}txtNumPagina`]: String(i),
      __EVENTTARGET: `${PAG}txtNumPagina`,
      [`${PAG}ddlNumReg`]: "100",
    });
    filas.push(...filasDe(pagina, seccion));
  }

  return filas;
}

/**
 * Consulta TODAS las categorías vigentes de una empresa por su documento.
 *
 * Hace falta porque la consulta por fecha devuelve solo las categorías
 * inscritas dentro de esa ventana, no el estado completo de la empresa: usar
 * aquello para actualizar borraría las categorías más antiguas. Sobre las
 * pocas empresas que cambian cada mes, esto es barato (unos segundos cada
 * una) y deja la foto correcta.
 */
export async function consultaPorNif(
  seccion: SeccionBuscador,
  nif: string
): Promise<FilaRipci[]> {
  const sesion = new Sesion();
  let pagina = await sesion.get();

  pagina = await sesion.post(pagina, {
    __EVENTTARGET: `${CAMPO}ddDivisionY`,
    [`${CAMPO}ddDivisionY`]: "B",
  });
  pagina = await sesion.post(pagina, {
    __EVENTTARGET: `${CAMPO}ddSeccionZ1`,
    [`${CAMPO}ddDivisionY`]: "B",
    [`${CAMPO}ddSeccionZ1`]: seccion,
  });
  pagina = await sesion.post(pagina, {
    [`${CAMPO}ddDivisionY`]: "B",
    [`${CAMPO}ddSeccionZ1`]: seccion,
    [`${CAMPO}ddHabilitacionZ2`]: HABILITACION_RIPCI,
    [`${CAMPO}ddTipoDocumento`]: "NIF",
    [`${CAMPO}tbDocumento`]: nif,
    [`${CAMPO}ChbActivo`]: "on",
    [`${CAMPO}ChbBaja`]: "on",
    [`${CAMPO}btnFiltrar`]: "Filtrar",
  });

  // Una empresa no llega a 100 categorías, así que no hay que paginar.
  return filasDe(pagina, seccion).filter((f) => f.nif === nif.toUpperCase());
}

/** Fecha en el formato que espera el buscador. */
export function formatoFecha(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}
