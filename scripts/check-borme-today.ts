import { prisma } from "../src/lib/prisma";

async function main() {
  const start = new Date("2026-04-01T00:00:00");
  const end   = new Date("2026-04-02T00:00:00");

  const alertas = await prisma.bormeAlerta.findMany({
    where: { createdAt: { gte: start, lt: end } },
    select: { tipoActo: true, fecha: true, createdAt: true, empresa: { select: { nombre: true } } },
    orderBy: { tipoActo: "asc" },
  });

  console.log(`Alertas creadas hoy (1 abr): ${alertas.length}`);
  for (const a of alertas) {
    console.log(`  ${a.tipoActo.padEnd(25)} fecha=${a.fecha.toISOString().slice(0,10)}  ${a.empresa.nombre}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
