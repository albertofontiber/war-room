import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Auth unificado con dos providers separados:
 *
 * - `admin-credentials` (user/pass via ENV) para Alberto y Gabriel. Entra al
 *   war room completo. La sesión lleva `kind: "admin"` y el nombre.
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
  }
  interface User {
    kind?: "admin" | "finder";
    finderId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    kind?: "admin" | "finder";
    finderId?: string | null;
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
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const users = [
          {
            id: "1",
            name: process.env.ADMIN_USER_1 ?? "alberto",
            password: process.env.ADMIN_PASS_1 ?? "",
          },
          {
            id: "2",
            name: process.env.ADMIN_USER_2 ?? "gabriel",
            password: process.env.ADMIN_PASS_2 ?? "",
          },
        ];

        const user = users.find(
          (u) => u.name === credentials.username && u.password === credentials.password
        );
        if (!user) return null;
        return {
          id: user.id,
          name: user.name,
          email: `${user.name}@fontiber.com`,
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const finder = await prisma.finder.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            passwordHash: true,
          },
        });
        if (!finder || !finder.active || !finder.passwordHash) return null;

        const ok = await bcrypt.compare(credentials.password, finder.passwordHash);
        if (!ok) return null;

        return {
          id: finder.id,
          name: finder.name,
          email: finder.email,
          kind: "finder" as const,
          finderId: finder.id,
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.name = token.name as string;
      session.kind = (token.kind as "admin" | "finder" | undefined) ?? "admin";
      session.finderId = (token.finderId as string | null | undefined) ?? null;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
