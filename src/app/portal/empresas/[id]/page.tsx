import { requireFinderPageOrRedirect } from "@/lib/finder-session";
import PortalTargetClient from "@/components/portal/PortalTargetClient";

export const dynamic = "force-dynamic";

export default async function PortalTargetPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const finder = await requireFinderPageOrRedirect();

  return (
    <PortalTargetClient
      empresaId={parseInt(params.id, 10)}
      finderName={finder.name}
      finderId={finder.id}
    />
  );
}
