import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import FindersAdminClient from "@/components/FindersAdminClient";

export const dynamic = "force-dynamic";

/**
 * Admin /finders — listado de finders activos con acción de "Set password".
 * Ruta protegida: solo sesiones kind="admin".
 */
export default async function FindersAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") redirect("/login");

  return <FindersAdminClient />;
}
