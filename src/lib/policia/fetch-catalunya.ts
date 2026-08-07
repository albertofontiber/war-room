/**
 * Registre especial d'empreses de seguretat de Catalunya.
 *
 * A diferencia de las otras dos fuentes, esta no es un PDF: la Generalitat lo
 * publica como datos abiertos en un portal Socrata, con API JSON. Nada de
 * maquetación ni de coordenadas.
 *
 * Igual que en el registro vasco, todas las habilitaciones son autonómicas por
 * definición, así que el dataset trae "Sí"/"No" en vez de E/A.
 *
 * Fuente: https://analisi.transparenciacatalunya.cat/Seguretat/Empreses-de-seguretat-privada/7frg-7rdi
 */

import type { MapaHabilitaciones } from "./habilitaciones";

const API = "https://analisi.transparenciacatalunya.cat/resource/7frg-7rdi.json";

/**
 * Nombres de campo del dataset.
 *
 * Socrata los genera a partir de los encabezados del Excel original, de ahí lo
 * ilegibles que son: el del nombre arrastra el título entero de la hoja,
 * incluida una fecha de 2017 que no significa nada.
 */
const CAMPO_NOMBRE =
  "empreses_de_seguretat_privadainscrites_en_el_registre_especial_d_empeses_de_seguretat_de_catalunyadades_actualitzades_en_data_25_01_2017";
const CAMPO_CIF = "cif_nif";

/** Campo del dataset -> código de habilitación. */
const CAMPOS_HABILITACION: [string, string][] = [
  ["vigil_ncia_i_protecci_de_b_ns_a", "VJ"],
  ["protecci_de_persones_f_siques_b", "PP"],
  ["instal_laci_i_manteniment_de_sistemes_de_seguretat_f", "INS"],
  ["dip_sit_i_cust_dia_d_objectes_valuosos_c", "DF"],
  ["transport_i_distribuci_d_objectes_valuosos", "TF"],
  ["explotaci_de_central_receptora_d_alarmes_g", "CA"],
  ["dip_sit_i_cust_dia_d_explosius_i_objectes_perillosos_d", "DE"],
  ["transport_i_distribuci_d_explosius_objectes_perillosos_i_objectes_valuosos_e", "TE"],
];

export interface EmpresaCatalunya {
  nombre: string;
  cif: string;
  habilitaciones: MapaHabilitaciones;
}

/** Convierte una fila cruda del dataset. Devuelve null si no trae CIF. */
export function mapeaFila(fila: Record<string, unknown>): EmpresaCatalunya | null {
  const cif = String(fila[CAMPO_CIF] ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (!/^[A-Z]\d{8}$/.test(cif) && !/^\d{8}[A-Z]$/.test(cif)) return null;

  const nombre = String(fila[CAMPO_NOMBRE] ?? "").replace(/\s+/g, " ").trim();
  if (!nombre) return null;

  const habilitaciones: MapaHabilitaciones = {};
  for (const [campo, codigo] of CAMPOS_HABILITACION) {
    // El dataset usa "Sí"/"No"; se acepta cualquier grafía que empiece por s.
    const valor = String(fila[campo] ?? "").trim().toLowerCase();
    if (valor.startsWith("s")) habilitaciones[codigo] = "A";
  }

  return { nombre, cif, habilitaciones };
}

/**
 * Descarga el registro catalán.
 *
 * @param limite Tope de filas a pedir. El registro ronda las 200.
 */
export async function fetchRegistroCatalunya(limite = 2000): Promise<EmpresaCatalunya[]> {
  const res = await fetch(`${API}?$limit=${limite}`, {
    headers: { "User-Agent": "war-room/1.0 (+contacto@fontiber.com)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al consultar el registro catalán`);

  const filas = (await res.json()) as Record<string, unknown>[];
  if (!Array.isArray(filas)) throw new Error("El registro catalán no devolvió una lista");

  return filas.map(mapeaFila).filter((e): e is EmpresaCatalunya => e !== null);
}
