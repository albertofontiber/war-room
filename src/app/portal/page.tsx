import { requireFinderPageOrRedirect } from "@/lib/finder-session";
import PortalPipelineClient from "@/components/portal/PortalPipelineClient";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const finder = await requireFinderPageOrRedirect();

  return <PortalPipelineClient finderName={finder.name} />;
}
