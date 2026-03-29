import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.$queryRaw`SELECT DISTINCT ccaa, sector FROM "Empresa" WHERE ccaa IS NOT NULL ORDER BY ccaa LIMIT 30`.then((rows: unknown) => {
  console.log(JSON.stringify(rows, null, 2));
  p.$disconnect();
});
