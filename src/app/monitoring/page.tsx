import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import CronMonitoringClient from "@/components/CronMonitoringClient";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Panel interno de salud operativa; nunca se expone al portal de finders. */
export default async function MonitoringPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") redirect("/login");

  return <CronMonitoringClient />;
}
