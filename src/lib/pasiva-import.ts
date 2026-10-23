import { z } from "zod";
import { normalizeCif, looksLikeCif } from "./cif";
import { EvidenciaPasivaSchema, fusionarEvidenciasPasiva, SERVICIOS_PASIVA } from "./pasiva";

const url = z.string().url().refine((v) => /^https?:/.test(v));
export const FilaPasivaSchema = z.object({
  cif: z.string().transform(normalizeCif).refine(looksLikeCif, "CIF no válido"),
  nombre: z.string().trim().min(3),
  web: url,
  identidadUrl: url,
  identidadMetodo: z.enum(["aviso_legal", "documento_corporativo", "registro_publico", "universo_cif_dominio"]),
  permitirAlta: z.boolean().default(false),
  completarVacios: z.boolean().default(false),
  servicios: z.array(z.enum(Object.keys(SERVICIOS_PASIVA) as [keyof typeof SERVICIOS_PASIVA, ...Array<keyof typeof SERVICIOS_PASIVA>])).default([]),
  evidencias: z.array(EvidenciaPasivaSchema).min(1),
  direccion: z.string().optional(),
  codigoPostal: z.string().regex(/^\d{5}$/).optional(),
  localidad: z.string().optional(),
  provincia: z.string().optional(),
  ccaa: z.string().optional(),
  lat: z.number().min(27).max(44).optional(),
  lng: z.number().min(-19).max(5).optional(),
});
export type FilaPasiva = z.infer<typeof FilaPasivaSchema>;
export interface EmpresaParaPasiva {
  id: number;
  cif: string;
  nombre: string;
  web: string | null;
  direccion?: string | null;
  codigoPostal?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  ccaa?: string | null;
  lat?: number | null;
  lng?: number | null;
  esAnonima: boolean;
  proteccionPasiva: boolean | null;
  pasivaServicios: string[];
  pasivaEvidencias: unknown;
  pasivaRevisadaAt: Date | null;
}

export function dominioPasiva(web: string | null): string | null {
  if (!web) return null;
  try { return new URL(/^https?:/.test(web) ? web : `https://${web}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return null; }
}

/** Solo CIF confirma identidad. Dominio/nombre sirven para impedir altas ambiguas. */
export function planificarPasiva(filas: FilaPasiva[], empresas: EmpresaParaPasiva[]) {
  const porCif = new Map<string, EmpresaParaPasiva[]>();
  for (const e of empresas) {
    const key = normalizeCif(e.cif);
    porCif.set(key, [...(porCif.get(key) ?? []), e]);
  }
  const usados = new Set<string>();
  const altas = new Map<string, string>();
  return filas.map((fila) => {
    if (usados.has(fila.cif)) throw new Error(`CIF repetido en el lote: ${fila.cif}`);
    usados.add(fila.cif);
    const matches = porCif.get(fila.cif) ?? [];
    const bloqueo = (motivo: string) => ({ accion: "revisar" as const, fila, motivo });
    if (matches.length > 1) return bloqueo("Varias fichas con el mismo CIF normalizado");
    const existente = matches[0];
    if (existente?.esAnonima) return bloqueo("No se enriquece un lead anónimo");
    if (existente?.proteccionPasiva === false) return bloqueo("La ficha tiene una revisión negativa explícita; resolver antes de reemplazarla");
    if (fila.completarVacios && fila.identidadMetodo === "universo_cif_dominio") return bloqueo("Completar identidad requiere fuente fiscal primaria");
    if (!existente) {
      if (!fila.permitirAlta || fila.identidadMetodo === "universo_cif_dominio") return bloqueo("Alta no validada fiscalmente");
      const dominio = dominioPasiva(fila.web);
      if (empresas.some((e) => dominio && dominioPasiva(e.web) === dominio)) return bloqueo("El dominio ya pertenece a otro CIF; resolver identidad");
      if (dominio && altas.has(dominio)) return bloqueo("El dominio se repite para dos altas del mismo lote; resolver identidad");
      const nombre = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\b(SL|SA|SLU|SAU)\b|[^A-Z0-9]/g, "");
      if (empresas.some((e) => nombre(e.nombre) === nombre(fila.nombre))) return bloqueo("El nombre coincide con otro CIF; revisar antes de alta");
      if (!fila.localidad || !fila.provincia || !fila.ccaa || fila.lat == null || fila.lng == null) return bloqueo("Falta localización contrastada para mapa y tabla");
      if (dominio) altas.set(dominio, fila.cif);
    }
    const evidencias = fusionarEvidenciasPasiva(existente?.pasivaEvidencias, fila.evidencias);
    const servicios = [...new Set([...(existente?.pasivaServicios ?? []), ...fila.servicios])].sort();
    const fecha = [...evidencias.map((e) => e.fecha), existente?.pasivaRevisadaAt?.toISOString().slice(0, 10) ?? ""].sort().at(-1)!;
    const complemento: { web?: string; direccion?: string; codigoPostal?: string; localidad?: string; provincia?: string; ccaa?: string; lat?: number; lng?: number } = {};
    if (existente && fila.completarVacios) {
      for (const key of ["web", "direccion", "codigoPostal", "localidad", "provincia", "ccaa"] as const) {
        if (!existente[key]?.trim() && fila[key]) complemento[key] = fila[key];
      }
      // Las coordenadas se completan como par, sin combinar precisiones distintas.
      if (existente.lat == null && existente.lng == null && fila.lat != null && fila.lng != null) {
        complemento.lat = fila.lat;
        complemento.lng = fila.lng;
      }
    }
    const cambios = {
      proteccionPasiva: true as const,
      pasivaServicios: servicios,
      pasivaEvidencias: evidencias,
      pasivaRevisadaAt: new Date(`${fecha}T12:00:00Z`),
      ...complemento,
    };
    const igual = existente?.proteccionPasiva === true &&
      JSON.stringify([...existente.pasivaServicios].sort()) === JSON.stringify(servicios) &&
      JSON.stringify(fusionarEvidenciasPasiva(existente.pasivaEvidencias, [])) === JSON.stringify(evidencias) &&
      existente.pasivaRevisadaAt?.toISOString().slice(0, 10) === fecha && Object.keys(complemento).length === 0;
    return { accion: igual ? "sin_cambios" as const : existente ? "enriquecer" as const : "alta" as const, fila, existente, cambios };
  });
}
