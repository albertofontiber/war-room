import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRequestingAdmin } from "@/lib/admin-users";
import CuentaClient from "@/components/CuentaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi cuenta" };

/**
 * /cuenta — Mi cuenta del usuario conectado: sus datos, cambiar contraseña y
 * qué emails recibe. Misma estructura que "Mi cuenta" del Data Room.
 */
export default async function CuentaPage() {
  const me = await getRequestingAdmin();
  if (!me) redirect("/login?callbackUrl=%2Fcuenta");

  const cuenta = await prisma.user.findUnique({
    where: { id: me.id },
    select: { name: true, email: true, passwordSetAt: true, emailDiario: true },
  });
  if (!cuenta) redirect("/login");

  return (
    <CuentaClient
      name={cuenta.name}
      email={cuenta.email}
      passwordSetAt={cuenta.passwordSetAt?.toISOString() ?? null}
      emailDiario={cuenta.emailDiario}
    />
  );
}
