import { requireFinderPageOrRedirect } from "@/lib/finder-session";
import PortalProposeClient from "@/components/portal/PortalProposeClient";

export const dynamic = "force-dynamic";

export default async function ProponerPage() {
  const finder = await requireFinderPageOrRedirect();

  return <PortalProposeClient finderName={finder.name} />;
}
