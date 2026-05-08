// ─── Constantes y helpers del módulo CRM ────────────────────────────────────
// Fuente única de verdad para stages, labels y colores. Los colores son coherentes
// con el mapa (src/components/MapaEspana.tsx: CRM_COLOR).

import type { DealStage, TareaTipo } from "@/types";

/** Orden lógico del funnel, de izquierda a derecha en el Kanban y el chevron.
 * "on_hold" y "muerto" son laterales, aparecen colapsados al final del Kanban. */
export const DEAL_STAGES: DealStage[] = [
  "identificado",
  "contactado",
  "primera_reunion",
  "analisis",
  "LOI enviada",
  "execution",
  "portfolio",
  "on_hold",
  "muerto",
];

/** Display label en español para UI. */
export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  identificado: "Identificado",
  contactado: "Contactado",
  primera_reunion: "1ª reunión realizada",
  analisis: "Análisis",
  "LOI enviada": "LOI enviada",
  execution: "Ejecución",
  portfolio: "Portfolio",
  on_hold: "On hold",
  muerto: "Muerto",
};

/**
 * Sentinel para "Sin CRM" en filtros y selectores.
 * Una empresa está "Sin CRM" cuando no tiene `crmEstado` o su `dealStage` es null.
 * Se distingue conceptualmente de "Identificado" (primer stage del funnel real).
 */
export const SIN_CRM_SENTINEL = "sin_crm" as const;
export type SinCrm = typeof SIN_CRM_SENTINEL;
export const SIN_CRM_LABEL = "Sin CRM";
/** Color para tarjetas/leyenda de "Sin CRM" — más apagado que `identificado`. */
export const SIN_CRM_COLOR = "#6b7280"; // gris-500

/** Filtro CRM combinable: stage real o el sentinel "sin_crm". */
export type CrmStageFilter = DealStage | SinCrm;

/** Color hex por stage — mantiene paridad con el mapa. */
export const DEAL_STAGE_COLOR: Record<DealStage, string> = {
  identificado: "#94a3b8",  // slate
  contactado: "#38bdf8",    // sky
  primera_reunion: "#3b82f6", // blue
  analisis: "#8b5cf6",      // violet
  "LOI enviada": "#f59e0b", // amber
  execution: "#f97316",     // orange
  portfolio: "#22c55e",     // green
  on_hold: "#a8a29e",       // stone — apagado, en pausa
  muerto: "#ef4444",        // red
};

/** Clases Tailwind de texto por stage — para celdas y textos simples. */
export const DEAL_STAGE_TEXT_CLASS: Record<DealStage, string> = {
  identificado: "text-[#94a3b8]",
  contactado: "text-wr-blue",
  primera_reunion: "text-sky-400",
  analisis: "text-violet-400",
  "LOI enviada": "text-wr-amber",
  execution: "text-orange-400",
  portfolio: "text-wr-green",
  on_hold: "text-[#a8a29e]",
  muerto: "text-wr-red",
};

/** Clases Tailwind de pill (bg + text + border) por stage — para badges/chips.
 * Cada entrada usa el MISMO hex que `DEAL_STAGE_COLOR[stage]` (verificado en
 * crm.test.ts). Mantenerlo así garantiza paridad visual entre las pills (portal
 * y panel admin) y las columnas del Kanban admin (que usan DEAL_STAGE_COLOR).*/
export const DEAL_STAGE_PILL_CLASS: Record<DealStage, string> = {
  identificado: "bg-[#94a3b8]/20 text-[#94a3b8] border-[#94a3b8]/30",
  contactado: "bg-[#38bdf8]/20 text-[#38bdf8] border-[#38bdf8]/30",
  primera_reunion: "bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/30",
  analisis: "bg-[#8b5cf6]/20 text-[#8b5cf6] border-[#8b5cf6]/30",
  "LOI enviada": "bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30",
  execution: "bg-[#f97316]/20 text-[#f97316] border-[#f97316]/30",
  portfolio: "bg-[#22c55e]/20 text-[#22c55e] border-[#22c55e]/30",
  on_hold: "bg-[#a8a29e]/20 text-[#a8a29e] border-[#a8a29e]/30",
  muerto: "bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30",
};

/** Stages visibles en el funnel principal (on_hold y muerto se muestran colapsados aparte). */
export const FUNNEL_STAGES: DealStage[] = DEAL_STAGES.filter(
  (s) => s !== "muerto" && s !== "on_hold"
);

/** Stages laterales (no avanzan en el chevron principal). */
export const SIDE_STAGES: DealStage[] = ["on_hold", "muerto"];

/** Stages terminales. */
export const TERMINAL_STAGES: DealStage[] = ["portfolio", "on_hold", "muerto"];

// ─── Tareas ────────────────────────────────────────────────────────────────
// Tarea es el modelo unificado: tarea pendiente (completada=false) o actividad
// histórica (completada=true + resultado != null). "email" se añadió tras fusionar
// el antiguo modelo Actividad.

export const TAREA_TIPOS: TareaTipo[] = [
  "contacto_linkedin",
  "mensaje_whatsapp",
  "llamada",
  "videollamada",
  "reunion_presencial",
  "email",
  "otra",
];

export const TAREA_TIPO_LABEL: Record<TareaTipo, string> = {
  contacto_linkedin: "Contacto LinkedIn",
  mensaje_whatsapp: "Mensaje/WhatsApp",
  llamada: "Llamada",
  videollamada: "Videollamada",
  reunion_presencial: "Reunión presencial",
  email: "Email",
  otra: "Otra",
};

export const TAREA_TIPO_ICON: Record<TareaTipo, string> = {
  contacto_linkedin: "in",
  mensaje_whatsapp: "✉",
  llamada: "☏",
  videollamada: "▶",
  reunion_presencial: "👥",
  email: "@",
  otra: "·",
};

export function isValidTareaTipo(v: unknown): v is TareaTipo {
  return typeof v === "string" && (TAREA_TIPOS as string[]).includes(v);
}

/** Valida una string como DealStage. Útil en endpoints al validar input del cliente. */
export function isValidDealStage(value: unknown): value is DealStage {
  return typeof value === "string" && (DEAL_STAGES as string[]).includes(value);
}

/** Calcula días transcurridos desde una fecha hasta hoy. */
export function diasDesde(fecha: Date | string | null | undefined): number | null {
  if (!fecha) return null;
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** Umbral de días en stage para considerar un deal "estancado" (UI: badge rojo). */
export const ESTANCADO_DIAS = 14;
