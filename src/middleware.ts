import { withAuth } from "next-auth/middleware";
import { NextRequest, NextResponse } from "next/server";
import { urlLogin, type Zona } from "@/lib/login-destino";

/**
 * Middleware: dos zonas de servicio sobre el mismo deployment.
 *
 * 1. `portal.fontiber.com` → portal de finders. Rewrite del path a `/portal/*`
 *    para que Next.js sirva las rutas bajo `src/app/portal/`. Solo sesiones
 *    kind=finder pueden acceder; las demás van a `/portal/login`.
 *
 * 2. Resto de hosts (warroom.fontiber.com, localhost, previews de Vercel)
 *    → War Room admin. Rutas normales `/`, `/pipeline`, `/finders`, etc.
 *    Solo sesiones kind=admin; sin sesión, las páginas van a `/login`.
 *
 * En las dos zonas el login recibe la página pedida en `?callbackUrl=` y
 * vuelve a ella tras entrar (ver `src/lib/login-destino.ts`).
 *
 * El matcher excluye rutas públicas: /api/auth, /api/cron, assets estáticos,
 * /daily (página pública del email diario) y /login (página de admin).
 */

const PORTAL_HOST = "portal.fontiber.com";

// Páginas del War Room que se abren sin sesión. /login y /daily ni siquiera
// pasan por aquí: las excluye el matcher.
const WARROOM_PUBLIC_PAGES = new Set(["/forgot-password", "/reset-password"]);

/** Login de la zona con la página pedida como destino, para volver tras entrar. */
function loginUrl(req: NextRequest, zona: Zona): URL {
  const { pathname, search } = req.nextUrl;
  return new URL(urlLogin(zona, pathname + search), req.url);
}

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
        return NextResponse.redirect(loginUrl(req, "portal"));
      }
      // Si ya es finder y pide `/` → rewrite a `/portal` dashboard.
      // Va ANTES de la defensa en profundidad: la raíz no encaja en
      // `isPortalRoute` y, sin este rewrite primero, el finder vería un 404.
      if (token?.kind === "finder" && (path === "/" || path === "")) {
        const url = req.nextUrl.clone();
        url.pathname = "/portal";
        return NextResponse.rewrite(url);
      }
      // Defensa en profundidad: un finder logueado en host portal NO debe
      // poder llamar a APIs admin (ej. /api/empresas/[id], /api/grupos, etc.).
      // Aunque el endpoint debería validar kind=admin, este check es la
      // primera línea — bloquea cualquier path que no sea explícitamente
      // del portal o NextAuth.
      if (token?.kind === "finder") {
        const isPortalRoute =
          path === "/portal" ||
          path.startsWith("/portal/") ||
          path.startsWith("/api/portal/") ||
          isApiAuth ||
          isPortalPublic;
        if (!isPortalRoute) {
          // 404 (no 403) para no leak de existencia del recurso al finder.
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      }
      return NextResponse.next();
    }

    // War room: bloquear sesiones finder.
    if (token?.kind === "finder") {
      const url = loginUrl(req, "warroom");
      url.searchParams.set("wrongPortal", "1");
      return NextResponse.redirect(url);
    }
    // Sin sesión, las páginas van al login aquí, donde se conoce la URL pedida
    // (cada página lo vuelve a comprobar como defensa en profundidad, pero ya
    // sin saber adónde se iba). Quedan fuera las APIs, que responden 401 ellas
    // mismas, y las rutas `/_…` (`/_next`, `/_vercel` de Analytics), que en App
    // Router nunca son páginas.
    if (
      !token &&
      !path.startsWith("/api/") &&
      !path.startsWith("/_") &&
      !WARROOM_PUBLIC_PAGES.has(path)
    ) {
      return NextResponse.redirect(loginUrl(req, "warroom"));
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
