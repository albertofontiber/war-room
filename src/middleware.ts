import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Middleware de auth. Protege todas las rutas del war room salvo:
 *   - /login, /daily, /api/auth, /api/cron
 *
 * Además bloquea que un finder con sesión acceda al war room: si
 * session.kind === "finder" → redirige a /login (el portal de finders se
 * sirve en subdominio separado; esa lógica llega en PR #12).
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
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
  }
);

export const config = {
  matcher: [
    /*
     * Protege todas las rutas EXCEPTO:
     * - /login
     * - /api/auth/* (callbacks de NextAuth)
     * - /_next/static, /_next/image, /favicon.ico
     */
    "/((?!login|daily|api/auth|api/cron|_next/static|_next/image|favicon.ico).*)",
  ],
};
