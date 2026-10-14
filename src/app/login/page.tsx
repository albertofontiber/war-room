import type { Metadata } from "next";
import LoginClient from "@/components/LoginClient";
import { destinoTrasLogin } from "@/lib/login-destino";

export const metadata: Metadata = { title: "Acceso — Fontiber War Room" };

/**
 * Login del War Room. El middleware manda aquí con `?callbackUrl=<página
 * pedida>`; se valida en el servidor y el formulario vuelve ahí tras entrar.
 * Con `?wrongPortal=1` (una sesión de finder que intentó entrar al War Room)
 * se avisa de que esa cuenta es del portal.
 */
export default async function LoginPage(
  props: {
    searchParams: Promise<{
      callbackUrl?: string | string[];
      wrongPortal?: string | string[];
    }>;
  }
) {
  const { callbackUrl, wrongPortal } = await props.searchParams;
  const destino = destinoTrasLogin(
    "warroom",
    typeof callbackUrl === "string" ? callbackUrl : null
  );
  return <LoginClient destino={destino} portalEquivocado={wrongPortal === "1"} />;
}
