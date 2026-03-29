import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const grupos = await prisma.grupo.findMany({ include: { _count: { select: { empresas: true } } } });
console.log(`Grupos en BD: ${grupos.length}`);
grupos.forEach((g) => console.log(`  id=${g.id}  ${g.nombre}: ${g._count.empresas} empresas`));
await prisma.$disconnect();
