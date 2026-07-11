/**
 * Genera el hash bcrypt de una contraseña de admin para las env vars
 * ADMIN_PASS_HASH_1 / ADMIN_PASS_HASH_2 (ver src/lib/auth.ts).
 *
 * Uso:  npx tsx scripts/hash-admin-password.ts
 *       (pide la contraseña por stdin — NO la pases como argumento, quedaría
 *        en el historial de la shell)
 *
 * El hash resultante sí es seguro de copiar/pegar: ponlo en Vercel como
 * ADMIN_PASS_HASH_n y borra la ADMIN_PASS_n en texto plano. El login acepta
 * ambas variantes (el hash gana si están las dos), así que la migración se
 * puede hacer sin ventana de corte.
 */

import { createInterface } from "readline";
import bcrypt from "bcryptjs";

const rl = createInterface({ input: process.stdin, output: process.stdout });

rl.question("Contraseña a hashear (se mostrará al teclear): ", (password) => {
  rl.close();
  if (!password.trim()) {
    console.error("Contraseña vacía — nada que hashear.");
    process.exit(1);
  }
  const hash = bcrypt.hashSync(password, 10);
  console.log("\nADMIN_PASS_HASH_n=" + hash);
  console.log(
    "\nCopia la línea a las env vars de Vercel (y a .env.local si haces login en dev)."
  );
});
