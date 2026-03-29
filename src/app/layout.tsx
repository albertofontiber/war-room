import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "War Room — Fontiber M&A",
  description: "Dashboard de análisis M&A — Sector PCI y Seguridad Electrónica",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="antialiased bg-wr-bg text-wr-text">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
