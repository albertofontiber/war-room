/** Defensa CSRF para mutaciones de la API que usan cookies de sesión. */
export function isTrustedMutation(request: Pick<Request, "method" | "headers" | "url">): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Clientes no navegador; la autenticación sigue siendo obligatoria.
  try {
    const requestUrl = new URL(request.url);
    // Next.js puede usar localhost internamente en request.url. Vercel entrega
    // el Host público y el protocolo externo en estas cabeceras.
    const host = request.headers.get("host") ?? requestUrl.host;
    const proto = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1);
    if (!/^(https?)$/.test(proto) || /[\s,/@\\?#]/.test(host)) return false;
    const expected = new URL(`${proto}://${host}`).origin;
    return new URL(origin).origin === expected && origin !== "null";
  } catch {
    return false;
  }
}
