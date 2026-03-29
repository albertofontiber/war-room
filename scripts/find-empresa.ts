import { prisma } from "../src/lib/prisma";

async function main() {
  const query = process.argv[2] ?? "Fire";
  const r = await prisma.empresa.findMany({
    where: { nombre: { contains: query, mode: "insensitive" } },
    select: { id: true, nombre: true, cif: true, provincia: true, ccaa: true },
    orderBy: { nombre: "asc" },
  });
  console.log(`\n🔍  Búsqueda: "${query}" — ${r.length} resultado(s)\n`);
  r.forEach((e) =>
    console.log(`  [${e.id}] ${e.nombre.padEnd(50)} CIF: ${e.cif}  |  ${e.provincia ?? "—"}, ${e.ccaa ?? "—"}`)
  );
  await prisma.$disconnect();
}
main().catch(console.error);
