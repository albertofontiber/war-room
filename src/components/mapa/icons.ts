// Generador de iconos SDF para los markers no-circulares (cuadrado y
// hexágono = sectores Seg. Electrónica y Mixto). Mapbox los carga vía
// `map.addImage(name, imageData, { sdf: true })` y luego un layer
// `symbol` los pinta con `icon-color` aplicando la paleta CRM_COLOR.
// El SDF (signed distance field) permite recolorear sin re-render.

export function createShapeIcon(shape: "square" | "hexagon", size = 64): ImageData | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";

  const m = size * 0.12; // margin
  const s = size - 2 * m; // inner size

  if (shape === "square") {
    // Rounded square (rx ≈ 22% del lado)
    const r = s * 0.22;
    ctx.beginPath();
    ctx.moveTo(m + r, m);
    ctx.lineTo(m + s - r, m);
    ctx.quadraticCurveTo(m + s, m, m + s, m + r);
    ctx.lineTo(m + s, m + s - r);
    ctx.quadraticCurveTo(m + s, m + s, m + s - r, m + s);
    ctx.lineTo(m + r, m + s);
    ctx.quadraticCurveTo(m, m + s, m, m + s - r);
    ctx.lineTo(m, m + r);
    ctx.quadraticCurveTo(m, m, m + r, m);
    ctx.closePath();
    ctx.fill();
  } else {
    // Hexágono plano
    const cx = size / 2;
    const cy = size / 2;
    const r = s / 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    }
    ctx.closePath();
    ctx.fill();
  }

  return ctx.getImageData(0, 0, size, size);
}
