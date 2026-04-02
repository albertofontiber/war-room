import { prisma } from "../src/lib/prisma";

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayLogs = await prisma.crmLog.findMany({
    where: { createdAt: { gte: today } },
    include: { empresa: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Cambios hoy: ${todayLogs.length}`);

  const last = await prisma.crmLog.findFirst({
    orderBy: { createdAt: "desc" },
    include: { empresa: { select: { nombre: true } } },
  });
  if (last) {
    console.log(`Último cambio: ${last.createdAt.toLocaleDateString("es-ES")} | ${last.empresa.nombre} | ${last.fromStage ?? "nuevo"} → ${last.toStage}`);
  }

  const total = await prisma.crmLog.count();
  console.log(`Total logs histórico: ${total}`);

  await prisma.$disconnect();
}

main().catch(console.error);
