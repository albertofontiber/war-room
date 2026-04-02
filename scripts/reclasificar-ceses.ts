/**
 * reclasificar-ceses.ts
 *
 * Reclasifica alertas históricas cuyo tipoActo es "nombramiento" o
 * "nombramiento_grupo" pero que en realidad son ceses/revocaciones puras
 * (el texto contiene CESE/REVOCACION pero NO NOMBRAMIENTO).
 *
 * Uso: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/reclasificar-ceses.ts
 */

import { prisma } from "../src/lib/prisma";

function norm(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function reclasificar(descripcion: string): "nombramiento" | "nombramiento_grupo" | "otros" | null {
  // Extraer solo el texto del acto (quitar el prefijo "12345 — ")
  const texto = descripcion.replace(/^\d+\s*—\s*/, "");
  const t = norm(texto);

  const hasPositive = /NOMBRAMIENTO[S]?/.test(t);
  const hasNegative = /\bCESE[S]?\b|\bDIMISION[ES]*\b|\bREVOCACION[ES]*\b/.test(t);
  const hasCargo    = /APODERADO|ADMINISTRADOR/.test(t);

  if (hasPositive || (hasCargo && !hasNegative)) {
    return null; // clasificación correcta → no tocar
  }
  if (hasNegative || hasCargo) {
    return "otros"; // era nombramiento pero es puro cese/revocación
  }
  return null;
}

async function main() {
  const alertas = await (prisma.bormeAlerta as any).findMany({
    where: {
      tipoActo: { in: ["nombramiento", "nombramiento_grupo"] },
      descripcion: { not: null },
    },
    select: { id: true, tipoActo: true, descripcion: true },
  }) as Array<{ id: number; tipoActo: string; descripcion: string }>;

  console.log(`Evaluando ${alertas.length} alertas de nombramiento...`);

  let reclasificadas = 0;
  let correctas = 0;

  for (const alerta of alertas) {
    const nuevo = reclasificar(alerta.descripcion ?? "");
    if (nuevo === null) {
      correctas++;
      continue;
    }
    await (prisma.bormeAlerta as any).update({
      where: { id: alerta.id },
      data: { tipoActo: nuevo },
    });
    console.log(`  ✓ [${alerta.id}] ${alerta.tipoActo} → ${nuevo}  |  ${alerta.descripcion?.slice(0, 80)}`);
    reclasificadas++;
  }

  console.log(`\nReclasificadas: ${reclasificadas} | Ya correctas: ${correctas}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
