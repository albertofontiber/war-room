import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRequestingAdmin } from "@/lib/admin-users";
import CuentaClient from "@/components/CuentaClient";
import { SELECT_AVISOS_EMAIL } from "@/lib/avisos-email";

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
    select: { name: true, email: true, passwordSetAt: true, ...SELECT_AVISOS_EMAIL },
  });
  if (!cuenta) redirect("/login");

  return (
    <CuentaClient
      name={cuenta.name}
      email={cuenta.email}
      passwordSetAt={cuenta.passwordSetAt?.toISOString() ?? null}
      avisos={{
        emailDiario: cuenta.emailDiario,
        emailRegistros: cuenta.emailRegistros,
        emailCarpetas: cuenta.emailCarpetas,
        emailPropuestas: cuenta.emailPropuestas,
      }}
    />
  );
}
