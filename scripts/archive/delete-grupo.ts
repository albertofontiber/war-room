import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.grupo.findFirst({
  where: { nombre: { contains: "IC SEGURIDAD", mode: "insensitive" } },
  include: { _count: { select: { empresas: true } } }
}).then(async (g) => {
  if (!g) { console.log("No encontrado"); return; }
  console.log(`Encontrado: id=${g.id} "${g.nombre}" — ${g._count.empresas} empresas`);
  await p.empresa.updateMany({ where: { grupoId: g.id }, data: { grupoId: null } });
  await p.grupo.delete({ where: { id: g.id } });
  console.log("Eliminado correctamente.");
  p.$disconnect();
});
