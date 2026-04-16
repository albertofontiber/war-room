import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const ids = [5154,5081,5078,5125,5099,5134,5087,5129,5133,5117,5137,5056,5088,5138,5065,5110,5127,5139];
  const r = await p.empresa.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombre: true, fuente: true },
    orderBy: { id: "asc" },
  });
  for (const row of r) {
    console.log(`[${row.id}] ${row.nombre} → fuente: ${row.fuente}`);
  }
  await p.$disconnect();
}
main();
