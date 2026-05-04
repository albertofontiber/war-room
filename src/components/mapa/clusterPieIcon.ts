// Genera un ImageData rasterizado de un donut chart con texto central
// para registrarlo como icon en Mapbox via `map.addImage(...)`.
//
// Las versiones rasterizadas se ven correctamente en cualquier zoom
// porque usamos `pixelRatio: 2` al añadir la imagen al map. La
// alternativa con `<Marker><ClusterPie>` (SVG en HTML) era flexible
// pero costaba un nodo React + un re-render por cluster en cada
// cambio de zoom; con icons nativos Mapbox renderiza N clusters con
// el mismo coste constante.

import { PIE_STAGES, type ClusterMarker } from "./ClusterPie";

// Background del donut hole — debe coincidir con `bg-wr-bg`. Si la
// paleta cambia, hay que tocarlo aquí también.
const HOLE_BG = "#0f1117";

export interface ClusterPieImage {
  imageData: ImageData;
  /** Dimensión lógica (CSS) del icon — usado por Mapbox para el `icon-size`. */
  width: number;
  height: number;
}

/**
 * Calcula el radio externo del donut según el `count` (mismo criterio
 * que tenía `ClusterPie` en SVG).
 */
function radiusFor(count: number): number {
  return count > 100 ? 24 : count > 20 ? 20 : 16;
}

/**
 * Llave estable que cambia si y solo si el aspecto visual del donut
 * cambia (count y proporción por stage). Sirve para evitar regenerar
 * la imagen si el cluster sigue idéntico en sucesivos render passes.
 */
export function clusterPieKey(marker: ClusterMarker): string {
  const counts = PIE_STAGES.map((s) => marker.stageCounts[s.key] ?? 0).join(",");
  return `${marker.count}|${counts}`;
}

/**
 * Identificador estable del icon registrado en Mapbox. Coincide con la
 * llave (no con el `cluster_id`) para que dos clusters con misma
 * proporción + count compartan icon — minimiza addImage redundante.
 */
export function clusterPieIconId(key: string): string {
  return `cluster-pie:${key}`;
}

export function generateClusterPieImage(marker: ClusterMarker): ClusterPieImage | null {
  if (typeof document === "undefined") return null;

  const R = radiusFor(marker.count);
  const r = R * 0.55;
  // El componente original sumaba +2px de margen para la sombra exterior.
  const padding = 2;
  const dim = (R + padding) * 2;
  const cx = R + padding;
  const cy = R + padding;

  // Escala 2x para retina. Mapbox aplica `pixelRatio: 2` al `addImage`,
  // por lo que el canvas debe estar a 2× pero las dimensiones lógicas
  // pasadas a Mapbox siguen siendo `dim × dim`.
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = dim * scale;
  canvas.height = dim * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  // Anti-aliasing y crispness máximos para tipografía.
  ctx.imageSmoothingEnabled = true;

  // Sombra exterior (aro semitransparente).
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.arc(cx, cy, R + 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Segmentos del donut.
  const segments = PIE_STAGES.map((s) => ({
    color: s.color,
    n: marker.stageCounts[s.key] ?? 0,
  })).filter((s) => s.n > 0);

  const total = segments.reduce((a, s) => a + s.n, 0) || 1;

  if (segments.length === 1) {
    // Un solo stage → círculo + agujero, sin path complejo.
    ctx.fillStyle = segments[0].color;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = HOLE_BG;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    let angle = -Math.PI / 2;
    for (const seg of segments) {
      const sweep = (seg.n / total) * Math.PI * 2;
      ctx.fillStyle = seg.color;
      ctx.beginPath();
      ctx.arc(cx, cy, R, angle, angle + sweep);
      ctx.arc(cx, cy, r, angle + sweep, angle, true);
      ctx.closePath();
      ctx.fill();
      angle += sweep;
    }
  }

  // Texto central con el count.
  const fontSize = R < 18 ? 8 : R < 22 ? 9 : 10;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = marker.count > 999
    ? `${(marker.count / 1000).toFixed(1)}k`
    : String(marker.count);
  // Pequeño offset vertical: el textBaseline "middle" tiene un sesgo
  // óptico hacia abajo en muchos navegadores.
  ctx.fillText(label, cx, cy + 0.5);

  return {
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    width: dim,
    height: dim,
  };
}
