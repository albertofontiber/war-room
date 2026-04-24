import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import PortalPipelineClient from "@/components/portal/PortalPipelineClient";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "finder") redirect("/portal/login");

  return <PortalPipelineClient finderName={session.user?.name ?? "Finder"} />;
}
