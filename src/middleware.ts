import { withAuth } from "next-auth/middleware";
import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware: dos zonas de servicio sobre el mismo deployment.
 *
 * 1. `portal.fontiber.com` → portal de finders. Rewrite del path a `/portal/*`
 *    para que Next.js sirva las rutas bajo `src/app/portal/`. Solo sesiones
 *    kind=finder pueden acceder; las demás van a `/portal/login`.
 *
 * 2. Resto de hosts (warroom.fontiber.com, localhost, previews de Vercel)
 *    → War Room admin. Rutas normales `/`, `/pipeline`, `/finders`, etc.
 *    Solo sesiones kind=admin.
 *
 * El matcher excluye rutas públicas: /api/auth, /api/cron, assets estáticos,
 * /daily (página pública del email diario) y /login (página de admin).
 */

const PORTAL_HOST = "portal.fontiber.com";

function isPortalHost(req: NextRequest): boolean {
  // Las rutas /portal/* y /api/portal/* son intrínsecamente del portal —
  // aunque se sirvan desde warroom.fontiber.com (en dev o si alguien
  // toquetea el Host), deben tratarse como portal.
  const path = req.nextUrl.pathname;
  if (path === "/portal" || path.startsWith("/portal/")) return true;
  if (path.startsWith("/api/portal/")) return true;
  // Permite testing local con query `?portal=1` o header `x-test-portal: 1`
  if (process.env.NODE_ENV !== "production") {
    if (req.nextUrl.searchParams.get("portal") === "1") return true;
    if (req.headers.get("x-test-portal") === "1") return true;
  }
  const host = req.headers.get("host") ?? "";
  return host.split(":")[0].toLowerCase() === PORTAL_HOST;
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const portal = isPortalHost(req);
    const path = req.nextUrl.pathname;

    if (portal) {
      // Dentro del portal: si no hay sesión o no es finder → /portal/login.
      // Rutas públicas del portal (no requieren sesión): login y el flow de
      // self-service de password (forgot-password, reset-password + sus
      // endpoints API).
      const isPortalPublic =
        path === "/portal/login" ||
        path.startsWith("/portal/login/") ||
        path === "/portal/forgot-password" ||
        path === "/portal/reset-password" ||
        path === "/api/portal/forgot-password" ||
        path === "/api/portal/reset-password";
      const isApiAuth = path.startsWith("/api/auth");
      if (!isApiAuth && (!token || token.kind !== "finder") && !isPortalPublic) {
        const url = req.nextUrl.clone();
        url.pathname = "/portal/login";
        url.search = "";
        return NextResponse.redirect(url);
      }
      // Si ya es finder y pide `/` → rewrite a `/portal` dashboard.
      if (token?.kind === "finder" && (path === "/" || path === "")) {
        const url = req.nextUrl.clone();
        url.pathname = "/portal";
        return NextResponse.rewrite(url);
      }
      return NextResponse.next();
    }

    // War room: bloquear sesiones finder.
    if (token?.kind === "finder") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("wrongPortal", "1");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
    callbacks: {
      // Permite pasar la request al handler aunque no haya sesión. La
      // autorización (kind=admin vs finder vs anonymous) se decide arriba.
      authorized: () => true,
    },
  }
);

export const config = {
  matcher: [
    /*
     * Protege (o enruta) todo EXCEPTO rutas públicas y estáticos:
     * - /login (admin)
     * - /daily (email público)
     * - /api/auth (NextAuth callbacks)
     * - /api/cron (bearer CRON_SECRET)
     * - /_next/static, /_next/image, /favicon.ico
     *
     * /portal/* va por el matcher; /portal/login se deja entrar en el código.
     */
    "/((?!login|daily|api/auth|api/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
