/**
 * Seed mínimo para el módulo CRM: crea Alberto, Gabriel y un Finder de prueba.
 * Idempotente (usa upsert por email único). Seguro de correr en prod — no toca
 * empresas ni ningún registro de negocio.
 *
 * Uso: npx tsx scripts/seed-crm-users.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const alberto = await prisma.user.upsert({
    where: { email: "alberto@fontiber.com" },
    update: {},
    create: {
      email: "alberto@fontiber.com",
      name: "Alberto",
      role: "admin",
    },
  });
  console.log("✅ Alberto:", alberto.id);

  const gabriel = await prisma.user.upsert({
    where: { email: "gabriel@fontiber.com" },
    update: {},
    create: {
      email: "gabriel@fontiber.com",
      name: "Gabriel",
      role: "admin",
    },
  });
  console.log("✅ Gabriel:", gabriel.id);

  const finderTest = await prisma.finder.upsert({
    where: { email: "silvaglez.alberto@gmail.com" },
    update: {},
    create: {
      email: "silvaglez.alberto@gmail.com",
      name: "Finder Test",
      active: true,
      commissionPct: 2.5,
    },
  });
  console.log("✅ Finder test:", finderTest.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
