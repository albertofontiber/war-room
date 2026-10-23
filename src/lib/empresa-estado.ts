/**
 * Estado legal de la empresa según SABI/Informa y los avisos que la ficha
 * enseña en la sección de financieros. Sin dependencias de servidor: lo usa
 * tanto el import (`scripts/import-sabi-financieros.ts`) como el panel.
 */

export const ESTADOS_EMPRESA = [
  "activa",
  "concurso",
  "disuelta",
  "fusion",
  "liquidacion",
  "quiebra",
  "inactiva",
  "desconocida",
  "no_encontrada",
] as const;

export type EstadoEmpresa = (typeof ESTADOS_EMPRESA)[number];

export const ESTADO_LABEL: Record<EstadoEmpresa, string> = {
  activa: "Activa",
  concurso: "Activa en concurso de acreedores",
  disuelta: "Disuelta",
  fusion: "Disuelta por fusión o absorción",
  liquidacion: "En liquidación",
  quiebra: "En quiebra",
  inactiva: "Inactiva",
  desconocida: "Situación desconocida",
  no_encontrada: "No encontrada en SABI",
};

/** Literales de la columna «Estado» de SABI (en inglés) → estado interno. */
const SABI_STATUS: Record<string, EstadoEmpresa> = {
  "active": "activa",
  "active (insolvency proceedings)": "concurso",
  "dissolved": "disuelta",
  "dissolved (merger or take-over)": "fusion",
  "in liquidation": "liquidacion",
  "bankruptcy": "quiebra",
  "inactive (no precision)": "inactiva",
  "unknown situation": "desconocida",
};

/**
 * SABI devuelve "0" (o vacío) cuando no encuentra el CIF. Un literal que no
 * conocemos lanza error: mejor parar el import que clasificar a ciegas.
 */
export function estadoDesdeSabi(valor: unknown): EstadoEmpresa {
  const s = String(valor ?? "").trim().toLowerCase();
  if (s === "" || s === "0") return "no_encontrada";
  const estado = SABI_STATUS[s];
  if (!estado) throw new Error(`Estado de SABI desconocido: "${String(valor)}"`);
  return estado;
}

/** Solo se cargan cifras de empresas vivas, incluidas las que están en concurso. */
export function cargaFinancieros(estado: EstadoEmpresa): boolean {
  return estado === "activa" || estado === "concurso";
}

export interface AvisoFinanciero {
  nivel: "alerta" | "info";
  texto: string;
}

/**
 * Avisos de la sección de financieros de la ficha.
 *  - Estado distinto de activa → alerta con el estado.
 *  - Sin ningún año de cuentas → "No hay información financiera disponible".
 *  - Último año con cuentas anterior a (año actual − 2) → cuentas antiguas.
 *    En octubre de 2026 lo normal es tener 2025 o 2024; 2023 ya es viejo.
 */
export function avisosFinancieros(input: {
  estado: string | null;
  ultimoAnio: number | null;
  anioActual: number;
}): AvisoFinanciero[] {
  const avisos: AvisoFinanciero[] = [];
  const { estado, ultimoAnio, anioActual } = input;

  if (estado && estado !== "activa") {
    const label = ESTADO_LABEL[estado as EstadoEmpresa] ?? estado;
    avisos.push({ nivel: "alerta", texto: label });
  }

  if (ultimoAnio == null) {
    avisos.push({ nivel: "info", texto: "No hay información financiera disponible" });
  } else if (ultimoAnio < anioActual - 2) {
    avisos.push({ nivel: "info", texto: `Últimas cuentas disponibles: ${ultimoAnio}` });
  }

  return avisos;
}
