// Algoritmo ray-casting: ¿está `point` dentro del polígono `ring`?
// Usado por la herramienta de selección de área del mapa.

export function pointInPolygon(
  point: [number, number],
  ring: [number, number][]
): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
