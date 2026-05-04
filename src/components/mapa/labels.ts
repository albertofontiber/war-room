// Etiquetas y colores de UI para sector y stage CRM dentro del mapa.
// La constante `STAGE_CLR` solo cubre los stages "vivos" del funnel
// (no incluye `identificado` porque en la tabla de selección preferimos
// el gris por defecto para esa fila).

export const SECTOR_LBL: Record<string, string> = {
  PCI: "PCI",
  seguridad_electronica: "Seg. Electrónica",
  mixto: "Mixto",
};

export const STAGE_LBL: Record<string, string> = {
  identificado:    "Identificado",
  contactado:      "Contactado",
  primera_reunion: "1ª reunión",
  analisis:        "Análisis",
  "LOI enviada":   "LOI enviada",
  execution:       "Ejecución",
  portfolio:       "Portfolio",
  on_hold:         "On hold",
  muerto:          "Muerto",
};

export const STAGE_CLR: Record<string, string> = {
  contactado:      "#38bdf8",
  primera_reunion: "#3b82f6",
  analisis:        "#8b5cf6",
  "LOI enviada":   "#f59e0b",
  execution:       "#f97316",
  portfolio:       "#22c55e",
  on_hold:         "#a8a29e",
  muerto:          "#ef4444",
};
