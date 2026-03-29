import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    /*
     * Protege todas las rutas EXCEPTO:
     * - /login
     * - /api/auth/* (callbacks de NextAuth)
     * - /_next/static, /_next/image, /favicon.ico
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
