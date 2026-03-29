import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
prisma.grupo.findMany({ include: { _count: { select: { empresas: true } } } }).then(grupos => {
  console.log(`Grupos en BD: ${grupos.length}`);
  grupos.forEach((g) => console.log(`  id=${g.id}  ${g.nombre} [${g.tipo}]: ${g._count.empresas} empresas`));
  prisma.$disconnect();
});
