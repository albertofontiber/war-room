import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ProposalsAdminClient from "@/components/ProposalsAdminClient";

export const dynamic = "force-dynamic";

export default async function ProposalsAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") redirect("/login");
  return <ProposalsAdminClient />;
}
