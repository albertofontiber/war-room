import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import type { IncomingHttpHeaders } from "http";
import { createHash, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logFinderAction } from "@/lib/finder-access-log";
import { log } from "@/lib/logger";
import { findAdminCredentialByUsername } from "@/lib/admin-credentials";

/**
 * Extrae IP del cliente y user-agent de los headers de la request de login.
 * `x-forwarded-for` puede traer una cadena separada por comas o un array
 * (cuando hay varios proxies); en ambos casos el cliente original es el
 * primer valor. Usado para enriquecer `FinderAccessLog` en login_*.
 */
function extractRequestMetadata(headers: IncomingHttpHeaders | undefined): {
  ip: string | null;
  userAgent: string | null;
} {
  if (!headers) return { ip: null, userAgent: null };
  const xff = headers["x-forwarded-for"];
  const xffFirst = Array.isArray(xff) ? xff[0] : xff;
  const xRealIp = headers["x-real-ip"];
  const xRealIpStr = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
  const ip =
    xffFirst?.split(",")[0]?.trim() || xRealIpStr?.trim() || null;
  const ua = headers["user-agent"];
  const userAgent = (Array.isArray(ua) ? ua[0] : ua) ?? null;
  return { ip, userAgent };
}

/**
 * Verifica la contraseña de un admin. Dos formatos posibles:
 *
 * - hash bcrypt (User.passwordHash tras reset o `ADMIN_PASS_HASH_n`): la
 *   contraseña real no se persiste.
 * - `ADMIN_PASS_n` (legacy): texto plano. Se compara en tiempo constante
 *   (digest sha256 + timingSafeEqual) en vez de `===`.
 *
 * Si ambas están definidas gana el hash. Una credencial vacía nunca matchea
 * (los defaults `?? ""` de las envs no deben abrir la puerta).
 * Exportado para tests.
 */
export async function adminPasswordMatches(
  input: string,
  stored: { password?: string; passwordHash?: string }
): Promise<boolean> {
  if (stored.passwordHash) {
    return bcrypt.compare(input, stored.passwordHash);
  }
  if (!stored.password) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(stored.password).digest();
  return timingSafeEqual(a, b);
}

/**
 * Auth unificado con dos providers separados:
 *
 * - `admin-credentials` para Alberto y Gabriel. Arranca con user/pass vía ENV
 *   y, después de un reset, prioriza User.passwordHash. Entra al war room
 *   completo. La sesión lleva `kind: "admin"` y el nombre.
 *
 * - `finder-credentials` (email/pass via bcrypt contra la tabla Finder) para
 *   los finders externos. La sesión lleva `kind: "finder"` y `finderId` para
 *   poder filtrar datos en endpoints. Las credenciales las setea un admin con
 *   `POST /api/finders/:id/password`.
 *
 * Middleware y endpoints usan `session.kind` para decidir qué rutas permitir:
 * un finder no puede llegar al war room, un admin no usa el portal.
 */

declare module "next-auth" {
  interface Session {
    kind?: "admin" | "finder";
    finderId?: string | null;
    // Sólo presente en sesiones de finder. Se compara contra Finder.sessionVersion
    // en `getCurrentFinder()`: si no coincide, la sesión está revocada.
    sessionVersion?: number | null;
  }
  interface User {
    kind?: "admin" | "finder";
    finderId?: string | null;
    sessionVersion?: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    kind?: "admin" | "finder";
    finderId?: string | null;
    sessionVersion?: number | null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "admin-credentials",
      name: "Admin",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) return null;

        const { ip, userAgent } = extractRequestMetadata(req?.headers);
        const config = findAdminCredentialByUsername(credentials.username);
        const user = config
          ? await prisma.user.findUnique({
              where: { email: config.email },
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                active: true,
                passwordHash: true,
              },
            })
          : null;
        const ok =
          config && user?.active && user.role === "admin"
            ? await adminPasswordMatches(credentials.password, {
                password: config.password,
                // Un reset self-service en BD sustituye al hash de entorno.
                passwordHash: user.passwordHash ?? config.passwordHash,
              })
            : false;
        if (!config || !user || !ok) {
          // Los admins no tienen tabla de access log (los finders sí);
          // registramos en el logger estructurado → visible en Vercel logs.
          log.warn("auth/admin", "login_failure", {
            username: credentials.username,
            ip,
            userAgent,
          });
          return null;
        }

        log.info("auth/admin", "login_success", { username: user.name, ip });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          kind: "admin" as const,
          finderId: null,
        };
      },
    }),
    CredentialsProvider({
      id: "finder-credentials",
      name: "Finder",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const { ip, userAgent } = extractRequestMetadata(req?.headers);
        const emailNorm = credentials.email.trim().toLowerCase();

        const finder = await prisma.finder.findUnique({
          where: { email: emailNorm },
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            passwordHash: true,
            sessionVersion: true,
          },
        });
        // Awaiteamos los logs en vez de fire-and-forget: en serverless de
        // Vercel el process puede terminar tras `return` y perder el INSERT.
        // El helper ya tiene try/catch interno, así que await no tira.
        if (!finder || !finder.active || !finder.passwordHash) {
          await logFinderAction({
            finderId: finder?.id ?? null,
            email: emailNorm,
            action: "login_failure",
            ip,
            userAgent,
          });
          return null;
        }

        const ok = await bcrypt.compare(credentials.password, finder.passwordHash);
        if (!ok) {
          await logFinderAction({
            finderId: finder.id,
            email: emailNorm,
            action: "login_failure",
            ip,
            userAgent,
          });
          return null;
        }

        await logFinderAction({
          finderId: finder.id,
          email: emailNorm,
          action: "login_success",
          ip,
          userAgent,
        });

        return {
          id: finder.id,
          name: finder.name,
          email: finder.email,
          kind: "finder" as const,
          finderId: finder.id,
          sessionVersion: finder.sessionVersion,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.name = user.name;
        token.kind = user.kind ?? "admin";
        token.finderId = user.finderId ?? null;
        // Sólo los finders llevan sessionVersion; los admin lo dejan undefined.
        token.sessionVersion = user.sessionVersion ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.name = token.name as string;
      session.kind = (token.kind as "admin" | "finder" | undefined) ?? "admin";
      session.finderId = (token.finderId as string | null | undefined) ?? null;
      session.sessionVersion =
        (token.sessionVersion as number | null | undefined) ?? null;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
