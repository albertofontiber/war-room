import { z } from "zod";

export const ESTADOS_PASIVA = ["confirmada", "descartada", "sin_revisar"] as const;
export type EstadoPasiva = (typeof ESTADOS_PASIVA)[number];
export const PASIVA_LABEL: Record<EstadoPasiva, string> = {
  confirmada: "PCI pasiva confirmada",
  descartada: "Revisada sin actividad",
  sin_revisar: "Sin revisar",
};
export const SERVICIOS_PASIVA = {
  estructura: "Protección estructural",
  compartimentacion: "Compartimentación",
  sellados: "Sellados cortafuegos",
  reaccion: "Reacción al fuego",
  puertas: "Puertas y cortinas cortafuegos",
  conductos: "Protección de conductos",
} as const;
export type ServicioPasiva = keyof typeof SERVICIOS_PASIVA;

const publicUrl = z.string().url().refine((s) => /^https?:\/\//.test(s), "URL pública requerida");
export const EvidenciaPasivaSchema = z.object({
  url: publicUrl,
  fuente: z.string().trim().min(1).max(200),
  tipo: z.enum(["web_corporativa", "asociacion", "calificacion"]),
  fecha: z.iso.date(),
  descripcion: z.string().trim().min(1).max(500),
});
export type EvidenciaPasiva = z.infer<typeof EvidenciaPasivaSchema>;
export interface PasivaExportRecord {
  id: number;
  actividades: import("./actividades").ActividadEmpresa[];
  proteccionPasiva: boolean | null;
  pasivaServicios: string[];
  pasivaEvidencias: EvidenciaPasiva[];
  pasivaRevisadaAt: string | null;
}

export function estadoPasiva(valor: boolean | null | undefined): EstadoPasiva {
  return valor === true ? "confirmada" : valor === false ? "descartada" : "sin_revisar";
}

export function cumpleFiltroPasiva(valor: boolean | null | undefined, seleccion: string[]): boolean {
  return seleccion.length === 0 || seleccion.includes(estadoPasiva(valor));
}

/** Filtra datos antiguos o mal formados y evita enlaces ejecutables en la ficha. */
export function parseEvidenciasPasiva(valor: unknown): EvidenciaPasiva[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((item) => {
    const result = EvidenciaPasivaSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

export function fusionarEvidenciasPasiva(actuales: unknown, nuevas: EvidenciaPasiva[]): EvidenciaPasiva[] {
  const porFuente = new Map<string, EvidenciaPasiva>();
  for (const e of [...parseEvidenciasPasiva(actuales), ...nuevas]) {
    const key = `${e.tipo}:${e.url.replace(/#.*$/, "").replace(/\/$/, "")}`;
    const anterior = porFuente.get(key);
    if (!anterior || e.fecha >= anterior.fecha) porFuente.set(key, e);
  }
  return [...porFuente.values()].sort((a, b) => a.url.localeCompare(b.url));
}
