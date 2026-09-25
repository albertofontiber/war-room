import LoginClient from "@/components/LoginClient";
import { destinoTrasLogin } from "@/lib/login-destino";

/**
 * Login del War Room. El middleware manda aquí con `?callbackUrl=<página
 * pedida>`; se valida en el servidor y el formulario vuelve ahí tras entrar.
 */
export default async function LoginPage(
  props: {
    searchParams: Promise<{ callbackUrl?: string | string[] }>;
  }
) {
  const { callbackUrl } = await props.searchParams;
  const destino = destinoTrasLogin(
    "warroom",
    typeof callbackUrl === "string" ? callbackUrl : null
  );
  return <LoginClient destino={destino} />;
}
