import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import UsuariosAdminClient from "@/components/UsuariosAdminClient";

export const dynamic = "force-dynamic";

/**
 * Admin /usuarios — quién entra al war room: alta por email con invitación,
 * reenvío del enlace y activar/desactivar. Ruta protegida: solo kind="admin".
 */
export default async function UsuariosAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") redirect("/login");

  return <UsuariosAdminClient />;
}
