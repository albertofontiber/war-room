import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Usuario del war room que hace la petición, o null si no hay sesión admin.
 * La sesión ya viene revalidada contra la BD (callback `session` de auth.ts).
 */
export async function getRequestingAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.kind !== "admin") return null;
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true },
  });
}

/** Campos que ve la pantalla /usuarios. Nunca el hash. */
export const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  passwordSetAt: true,
  createdAt: true,
} as const;

type AdminUserRow = {
  id: string;
  passwordSetAt: Date | null;
};

/** Añade la caducidad de la invitación pendiente (si la hay) a cada usuario. */
export async function withPendingInvitation<T extends AdminUserRow>(users: T[]) {
  const tokens = users.length
    ? await prisma.adminPasswordResetToken.findMany({
        where: {
          userId: { in: users.map((u) => u.id) },
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { userId: true, expiresAt: true },
      })
    : [];
  const pending = new Map(tokens.map((t) => [t.userId, t.expiresAt]));
  return users.map((u) => ({
    ...u,
    // Solo cuenta como invitación si aún no ha fijado contraseña; si ya la
    // tiene, un token vivo es una recuperación en curso, no una invitación.
    invitationExpiresAt: u.passwordSetAt ? null : pending.get(u.id) ?? null,
  }));
}
