/**
 * reclasificar-posible-adquisicion.ts
 *
 * Reclasifica alertas históricas de nombramiento_grupo → posible_adquisicion
 * cuando la empresa detectada NO pertenece al grupo inferido.
 *
 * Uso: npx ts-node scripts/reclasificar-posible-adquisicion.ts
 */

import { prisma } from "../src/lib/prisma";

async function main() {
  // Todas las alertas nombramiento_grupo con grupoInferido asignado y empresa asignada
  const alertas = await (prisma.bormeAlerta as any).findMany({
    where: {
      tipoActo: "nombramiento_grupo",
      grupoInferidoId: { not: null },
    },
    select: {
      id: true,
      empresaId: true,
      grupoInferidoId: true,
      personaDetectada: true,
      fecha: true,
    },
  }) as Array<{
    id: number;
    empresaId: number;
    grupoInferidoId: number;
    personaDetectada: string | null;
    fecha: Date;
  }>;

  console.log(`Evaluando ${alertas.length} alertas nombramiento_grupo con grupo asignado...`);

  let reclasificadas = 0;
  let yaCorrectas = 0;

  for (const alerta of alertas) {
    if (!alerta.empresaId) continue; // alerta sin empresa → no aplica

    // Consultar grupo actual de la empresa y nombre del grupo inferido
    const [empresa, grupo] = await Promise.all([
      (prisma.empresa as any).findUnique({
        where: { id: alerta.empresaId },
        select: { nombre: true, grupoId: true },
      }),
      (prisma.grupo as any).findUnique({
        where: { id: alerta.grupoInferidoId },
        select: { nombre: true },
      }),
    ]) as [
      { nombre: string; grupoId: number | null } | null,
      { nombre: string } | null,
    ];

    if (!empresa || !grupo) continue;

    if (empresa.grupoId !== alerta.grupoInferidoId) {
      // La empresa no pertenece al grupo → posible adquisición
      await (prisma.bormeAlerta as any).update({
        where: { id: alerta.id },
        data: { tipoActo: "posible_adquisicion" },
      });
      console.log(
        `  ✓ [${alerta.fecha.toISOString().slice(0, 10)}] ${empresa.nombre} ← ${grupo.nombre}` +
        (alerta.personaDetectada ? ` (${alerta.personaDetectada})` : "")
      );
      reclasificadas++;
    } else {
      yaCorrectas++;
    }
  }

  console.log(
    `\nReclasificadas: ${reclasificadas} | Ya correctas (empresa ya pertenece al grupo): ${yaCorrectas}`
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
