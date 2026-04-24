import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import PortalProposeClient from "@/components/portal/PortalProposeClient";

export const dynamic = "force-dynamic";

export default async function ProponerPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "finder") redirect("/portal/login");

  return <PortalProposeClient finderName={session.user?.name ?? "Finder"} />;
}
