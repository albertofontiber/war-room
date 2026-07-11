/**
 * Crea (o repara) el rol Postgres de SOLO LECTURA que usa el tool
 * `execute_sql` del chat IA (ver src/lib/chat-db.ts).
 *
 * Qué hace:
 *   1. CREATE ROLE warroom_chat_readonly (LOGIN, password aleatoria) si no existe.
 *   2. statement_timeout = 10s a nivel de rol (corta SELECTs desbocados).
 *   3. GRANT SELECT sobre todas las tablas de public + default privileges
 *      para que las tablas futuras (prisma db push) hereden el SELECT.
 *   4. Verifica conectando CON el rol: SELECT funciona, INSERT falla.
 *   5. Escribe CHAT_READONLY_DATABASE_URL en .env.local (no imprime la password).
 *
 * Uso:  npx tsx scripts/create-chat-readonly-role.ts          (dry-run)
 *       APPLY=1 npx tsx scripts/create-chat-readonly-role.ts  (aplica)
 *
 * Re-ejecutar con APPLY=1 rota la password y re-aplica los GRANTs (útil si
 * se filtra la credencial o si una tabla nueva quedó sin SELECT).
 *
 * Tras ejecutarlo: copiar CHAT_READONLY_DATABASE_URL de .env.local a las
 * env vars de Vercel (Production) y redeploy. Sin la env, el chat funciona
 * igual pero execute_sql usa la conexión normal (fallback con warn).
 */

import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

const ROLE = "warroom_chat_readonly";
const TIMEOUT = "10s";

function readEnvVar(name: string): string | null {
  // Igual que Next: .env.local pisa a .env
  for (const file of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), file);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(
      new RegExp(`^${name}=(?:"([^"]*)"|(.*))$`, "m")
    );
    if (m) return (m[1] ?? m[2]).trim();
  }
  return process.env[name] ?? null;
}

/** Sustituye el usuario/password de una URL postgres conservando host/puerto/db/params. */
function withRoleCredentials(url: string, user: string, pass: string): string {
  const u = new URL(url);
  // En el pooler de Supabase el usuario lleva sufijo de proyecto
  // (postgres.PROJECT → warroom_chat_readonly.PROJECT). En directo, no.
  const suffix = u.username.includes(".")
    ? "." + u.username.split(".").slice(1).join(".")
    : "";
  u.username = `${user}${suffix}`;
  u.password = pass;
  return u.toString();
}

async function main() {
  const apply = process.env.APPLY === "1";
  const directUrl = readEnvVar("DIRECT_URL");
  const pooledUrl = readEnvVar("DATABASE_URL");
  if (!directUrl || !pooledUrl) {
    throw new Error("Faltan DIRECT_URL / DATABASE_URL en .env(.local)");
  }

  const password = randomBytes(24).toString("base64url");

  console.log(`Rol: ${ROLE} · timeout: ${TIMEOUT} · modo: ${apply ? "APPLY" : "dry-run"}`);
  if (!apply) {
    console.log("Dry-run: no se toca la BD. Ejecuta con APPLY=1 para aplicar.");
    return;
  }

  // ── DDL por la conexión directa (admin) ────────────────────────────────
  const admin = new PrismaClient({ datasources: { db: { url: directUrl } } });
  try {
    // Password entre $pw$...$pw$ (dollar-quoting) — base64url no puede
    // contener '$', así que no hay riesgo de escape.
    await admin.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN
          CREATE ROLE ${ROLE} LOGIN PASSWORD $pw$${password}$pw$;
        ELSE
          ALTER ROLE ${ROLE} WITH LOGIN PASSWORD $pw$${password}$pw$;
        END IF;
      END $$;
    `);
    await admin.$executeRawUnsafe(
      `ALTER ROLE ${ROLE} SET statement_timeout = '${TIMEOUT}'`
    );
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
    await admin.$executeRawUnsafe(
      `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ROLE}`
    );
    // Tablas futuras creadas por el rol admin actual (prisma db push)
    await admin.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${ROLE}`
    );
    console.log("✓ Rol creado/actualizado + GRANTs aplicados");
  } finally {
    await admin.$disconnect();
  }

  // ── Verificación conectando CON el rol ─────────────────────────────────
  const roUrl = withRoleCredentials(pooledUrl, ROLE, password);
  const roDirect = withRoleCredentials(directUrl, ROLE, password);
  const ro = new PrismaClient({ datasources: { db: { url: roDirect } } });
  try {
    const rows =
      await ro.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "Empresa"`);
    console.log(`✓ SELECT ok (${Number(rows[0].n)} empresas visibles)`);

    let writeBlocked = false;
    try {
      await ro.$executeRawUnsafe(
        `INSERT INTO "CrmLog" ("empresaId", event) VALUES (0, 'test')`
      );
    } catch (err) {
      writeBlocked = /permission denied/i.test(String(err));
    }
    if (!writeBlocked) {
      throw new Error(
        "¡El INSERT NO fue rechazado por permisos! Revisa los GRANTs antes de usar el rol."
      );
    }
    console.log("✓ INSERT rechazado por permisos (permission denied)");

    const t = await ro.$queryRawUnsafe<{ statement_timeout: string }[]>(
      `SHOW statement_timeout`
    );
    console.log(`✓ statement_timeout del rol: ${t[0].statement_timeout}`);
  } finally {
    await ro.$disconnect();
  }

  // ── Escribir .env.local (sin imprimir la password) ─────────────────────
  const envPath = resolve(process.cwd(), ".env.local");
  const line = `CHAT_READONLY_DATABASE_URL="${roUrl}"`;
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (/^CHAT_READONLY_DATABASE_URL=.*$/m.test(content)) {
    content = content.replace(/^CHAT_READONLY_DATABASE_URL=.*$/m, line);
  } else {
    content = content.replace(/\n?$/, "\n") + `\n# Rol read-only del execute_sql del chat IA (scripts/create-chat-readonly-role.ts)\n${line}\n`;
  }
  writeFileSync(envPath, content);
  console.log(
    "✓ CHAT_READONLY_DATABASE_URL escrita en .env.local — cópiala a Vercel (Production) y redeploy"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
