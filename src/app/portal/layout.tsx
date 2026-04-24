import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portal Finders · Fontiber",
  description: "Portal privado para finders de Fontiber Industrial Partners.",
  robots: { index: false, follow: false },
};

/**
 * Layout del portal de finders.
 * El root layout ya provee html/body/SessionProvider. Este layout solo añade
 * metadata específica y sirve como punto de agrupación para rutas bajo /portal.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
