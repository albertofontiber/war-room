import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import PortalTargetClient from "@/components/portal/PortalTargetClient";

export const dynamic = "force-dynamic";

export default async function PortalTargetPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "finder") redirect("/portal/login");

  return (
    <PortalTargetClient
      empresaId={parseInt(params.id, 10)}
      finderName={session.user?.name ?? "Finder"}
      finderId={session.finderId ?? ""}
    />
  );
}
