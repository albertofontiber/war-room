/** Defensa CSRF para mutaciones de la API que usan cookies de sesión. */
export function isTrustedMutation(request: Pick<Request, "method" | "headers" | "url">): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Clientes no navegador; la autenticación sigue siendo obligatoria.
  try {
    return new URL(origin).origin === new URL(request.url).origin && origin !== "null";
  } catch {
    return false;
  }
}
