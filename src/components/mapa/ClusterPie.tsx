"use client";

// Pie chart (donut) que representa la distribución por stage CRM dentro de
// un cluster del mapa. Renderizado como SVG dentro de un `<Marker>` de
// react-map-gl. El radio escala con `count` (16/20/24px) y el texto
// central muestra el total (formato compacto >999 → "1.2k").
//
// Pendiente de migrar a capa nativa Mapbox (Tech debt #16 Nivel 3) —
// requiere generar un sprite por cluster y addImage dinámicamente.

import * as React from "react";

// Stage order and colors for the pie chart (gray = sin CRM / identificado)
export const PIE_STAGES: { key: string; color: string }[] = [
  { key: "identificado",    color: "#64748b" },
  { key: "contactado",      color: "#38bdf8" },
  { key: "primera_reunion", color: "#3b82f6" },
  { key: "analisis",        color: "#8b5cf6" },
  { key: "LOI enviada",     color: "#f59e0b" },
  { key: "execution",       color: "#f97316" },
  { key: "portfolio",       color: "#22c55e" },
  { key: "muerto",          color: "#ef4444" },
];

export interface ClusterMarker {
  id: number;
  lng: number;
  lat: number;
  count: number;
  stageCounts: Record<string, number>;
}

function donutPath(cx: number, cy: number, R: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
  const x2 = cx + R * Math.cos(endAngle),   y2 = cy + R * Math.sin(endAngle);
  const ix1 = cx + r * Math.cos(endAngle),  iy1 = cy + r * Math.sin(endAngle);
  const ix2 = cx + r * Math.cos(startAngle), iy2 = cy + r * Math.sin(startAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r} ${r} 0 ${large} 0 ${ix2} ${iy2} Z`;
}

export function ClusterPie({ marker, onClick }: { marker: ClusterMarker; onClick: () => void }) {
  const R = marker.count > 100 ? 24 : marker.count > 20 ? 20 : 16;
  const r = R * 0.55;
  const cx = R + 2, cy = R + 2;
  const size = (R + 2) * 2;

  const segments = PIE_STAGES.map((s) => ({ color: s.color, n: marker.stageCounts[s.key] ?? 0 }))
    .filter((s) => s.n > 0);
  const total = segments.reduce((a, s) => a + s.n, 0) || 1;

  // If all are "sin CRM" (gray), just draw a full circle
  const paths: React.ReactElement[] = [];
  if (segments.length === 1) {
    paths.push(
      <circle key="full" cx={cx} cy={cy} r={R} fill={segments[0].color} />,
      <circle key="hole" cx={cx} cy={cy} r={r} fill="#0f1117" />
    );
  } else {
    let angle = -Math.PI / 2;
    for (const seg of segments) {
      const sweep = (seg.n / total) * 2 * Math.PI;
      paths.push(
        <path key={seg.color} d={donutPath(cx, cy, R, r, angle, angle + sweep)} fill={seg.color} />
      );
      angle += sweep;
    }
  }

  const fontSize = R < 18 ? 8 : R < 22 ? 9 : 10;

  return (
    <div onClick={onClick} style={{ cursor: "pointer", transform: "translate(-50%, -50%)" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible">
        {/* Shadow ring */}
        <circle cx={cx} cy={cy} r={R + 1.5} fill="rgba(0,0,0,0.4)" />
        {paths}
        <text
          x={cx} y={cy}
          textAnchor="middle" dominantBaseline="central"
          fontSize={fontSize} fontWeight="bold" fill="#ffffff"
          style={{ pointerEvents: "none", fontFamily: "system-ui" }}
        >
          {marker.count > 999 ? `${(marker.count / 1000).toFixed(1)}k` : marker.count}
        </text>
      </svg>
    </div>
  );
}
