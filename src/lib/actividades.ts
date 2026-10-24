import { parseRipci } from "./ripci/categorias";

export const ACTIVIDADES_EMPRESA = ["pci_activa", "pci_pasiva", "seguridad_electronica"] as const;
export type ActividadEmpresa = (typeof ACTIVIDADES_EMPRESA)[number];
export type ModoActividades = "todas" | "cualquiera";
export const ACTIVIDAD_LABEL: Record<ActividadEmpresa, string> = {
  pci_activa: "PCI activa",
  pci_pasiva: "PCI pasiva",
  seguridad_electronica: "Seguridad electrónica",
};

/** El universo PCI previo representa activa (criterio confirmado por Alberto).
 * Las altas de prospección pasiva conservan sector=PCI por compatibilidad,
 * pero esa procedencia no acredita activa. Un RIPCI válido sí la acredita.
 * No tener una actividad en esta lista no constituye una revisión negativa.
 */
export function obtenerActividades(empresa: {
  sector?: string | null;
  fuente?: string | null;
  ripci?: unknown;
  proteccionPasiva?: boolean | null;
}): ActividadEmpresa[] {
  const actividades: ActividadEmpresa[] = [];
  const altaPasiva = empresa.fuente?.startsWith("investigacion_pasiva_") === true;
  if (parseRipci(empresa.ripci) || (!altaPasiva && (empresa.sector === "PCI" || empresa.sector === "mixto"))) {
    actividades.push("pci_activa");
  }
  if (empresa.proteccionPasiva === true) actividades.push("pci_pasiva");
  if (empresa.sector === "seguridad_electronica" || empresa.sector === "mixto") {
    actividades.push("seguridad_electronica");
  }
  return actividades;
}

/** Mapbox puede serializar arrays de properties como JSON textual. */
export function parseActividades(valor: unknown): ActividadEmpresa[] {
  if (typeof valor === "string") {
    try { return parseActividades(JSON.parse(valor)); } catch { return []; }
  }
  if (!Array.isArray(valor)) return [];
  return ACTIVIDADES_EMPRESA.filter((actividad) => valor.includes(actividad));
}

export function textoActividades(valor: unknown): string {
  return parseActividades(valor).map((actividad) => ACTIVIDAD_LABEL[actividad]).join(" · ");
}

export function cumpleFiltroActividades(
  valor: unknown,
  seleccion: readonly ActividadEmpresa[],
  modo: ModoActividades = "todas",
): boolean {
  if (!seleccion.length) return true;
  const actividades = parseActividades(valor);
  return modo === "cualquiera"
    ? seleccion.some((actividad) => actividades.includes(actividad))
    : seleccion.every((actividad) => actividades.includes(actividad));
}
