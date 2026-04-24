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
  identificado: "Sin CRM / Identificado",
  contactado: "Contactado",
  primera_reunion: "1ª reunión realizada",
  analisis: "Análisis",
  "LOI enviada": "LOI enviada",
  execution: "Ejecución",
  portfolio: "Portfolio",
  on_hold: "On hold",
  muerto: "Muerto",
};

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

/** Stages visibles en el funnel principal (on_hold y muerto se muestran colapsados aparte). */
export const FUNNEL_STAGES: DealStage[] = DEAL_STAGES.filter(
  (s) => s !== "muerto" && s !== "on_hold"
);

/** Stages laterales (no avanzan en el chevron principal). */
export const SIDE_STAGES: DealStage[] = ["on_hold", "muerto"];

/** Stages terminales. */
export const TERMINAL_STAGES: DealStage[] = ["portfolio", "on_hold", "muerto"];

// ─── Tareas ────────────────────────────────────────────────────────────────

export const TAREA_TIPOS: TareaTipo[] = [
  "contacto_linkedin",
  "mensaje_whatsapp",
  "llamada",
  "videollamada",
  "reunion_presencial",
  "otra",
];

export const TAREA_TIPO_LABEL: Record<TareaTipo, string> = {
  contacto_linkedin: "Contacto LinkedIn",
  mensaje_whatsapp: "Mensaje/WhatsApp",
  llamada: "Llamada",
  videollamada: "Videollamada",
  reunion_presencial: "Reunión presencial",
  otra: "Otra",
};

export const TAREA_TIPO_ICON: Record<TareaTipo, string> = {
  contacto_linkedin: "in",
  mensaje_whatsapp: "✉",
  llamada: "☏",
  videollamada: "▶",
  reunion_presencial: "👥",
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

/**
 * Mapping para sanitización al finder: 8 stages internos → 4 estados agregados.
 * NO exponer el stage real al finder bajo ningún concepto.
 */
export const FINDER_STATUS_MAP: Record<DealStage, "Contactado" | "En negociación" | "Cerrado" | "En pausa" | "Descartado" | null> = {
  identificado: null, // no visible para el finder hasta que se materialice
  contactado: "Contactado",
  primera_reunion: "Contactado",
  analisis: "En negociación",
  "LOI enviada": "En negociación",
  execution: "En negociación",
  portfolio: "Cerrado",
  on_hold: "En pausa",
  muerto: "Descartado",
};

/** Umbral de días en stage para considerar un deal "estancado" (UI: badge rojo). */
export const ESTANCADO_DIAS = 14;
