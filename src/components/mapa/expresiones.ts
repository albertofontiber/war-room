// Expresiones Mapbox compartidas por las capas de markers de MapaEspana.
// Mantenerlas aquí evita re-crear arrays/funciones en cada render del mapa
// y deja un único lugar al que ir cuando hay que tocar la paleta o los
// breakpoints de tamaño.

export const CRM_COLOR = [
  "case",
  ["==", ["get", "dealStage"], "identificado"],    "#94a3b8",  // slate — primer stage del funnel
  ["==", ["get", "dealStage"], "contactado"],      "#38bdf8",  // sky
  ["==", ["get", "dealStage"], "primera_reunion"], "#3b82f6",  // blue
  ["==", ["get", "dealStage"], "analisis"],        "#8b5cf6",  // violet
  ["==", ["get", "dealStage"], "LOI enviada"],     "#f59e0b",  // amber
  ["==", ["get", "dealStage"], "execution"],       "#f97316",  // orange
  ["==", ["get", "dealStage"], "portfolio"],       "#22c55e",  // green
  ["==", ["get", "dealStage"], "on_hold"],         "#a8a29e",  // stone — en pausa
  ["==", ["get", "dealStage"], "muerto"],          "#ef4444",  // red
  "#6b7280",  // gris-500 — Sin CRM (dealStage null o sin CrmEstado)
] as const;

export function makeSizeExpr(metric: "ingresos" | "ebitda") {
  // Mínimo 10px para que cualquier empresa sea visible en el mapa
  const breaks =
    metric === "ingresos"
      ? [0, 10, 5_000_000, 13, 20_000_000, 18, 60_000_000, 26] as const
      : [0, 10, 800_000, 13, 3_500_000, 18, 10_000_000, 26] as const;
  return [
    "interpolate", ["linear"],
    ["coalesce", ["get", metric], 0],
    breaks[0], breaks[1],
    breaks[2], breaks[3],
    breaks[4], breaks[5],
    breaks[6], breaks[7],
  ] as const;
}

// icon-size (símbolo 64px) equivalente a circle-radius en px.
// icon-size = radius / 32 (el icono tiene 64px, su "radio" visual es 32px)
export function makeIconSizeExpr(metric: "ingresos" | "ebitda") {
  return ["interpolate", ["linear"],
    ["coalesce", ["get", metric], 0],
    metric === "ingresos" ? 0 : 0,                 0.3125,  // 10px
    metric === "ingresos" ? 5_000_000 : 800_000,   0.40,    // 13px
    metric === "ingresos" ? 20_000_000 : 3_500_000, 0.5625, // 18px
    metric === "ingresos" ? 60_000_000 : 10_000_000, 0.8125, // 26px
  ] as const;
}
