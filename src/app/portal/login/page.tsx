import type { Metadata } from "next";
import PortalLoginClient from "@/components/portal/PortalLoginClient";
import { destinoTrasLogin } from "@/lib/login-destino";

export const metadata: Metadata = { title: "Acceso — Fontiber Finders" };

/**
 * Login del portal de finders. El middleware manda aquí con `?callbackUrl=
 * <página pedida>`; se valida en el servidor y el formulario vuelve ahí tras
 * entrar.
 */
export default async function PortalLoginPage(
  props: {
    searchParams: Promise<{ callbackUrl?: string | string[] }>;
  }
) {
  const { callbackUrl } = await props.searchParams;
  const destino = destinoTrasLogin(
    "portal",
    typeof callbackUrl === "string" ? callbackUrl : null
  );
  return <PortalLoginClient destino={destino} />;
}
