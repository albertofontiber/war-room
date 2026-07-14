"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PasswordToggle } from "@/components/PasswordToggle";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("finder-credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.ok) {
      router.push("/portal");
      router.refresh();
    } else {
      setError("Email o contraseña incorrectos.");
    }
  }

  return (
    <div className="min-h-screen bg-wr-bg flex items-center justify-center px-4">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(to right, #e2e8f0 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-wr-blue">
              <path
                d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"
                fill="#3b82f6"
                opacity="0.15"
              />
              <path
                d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"
                stroke="#3b82f6"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-wr-text font-semibold text-lg tracking-wide">
              FONTIBER INDUSTRIAL PARTNERS
            </span>
          </div>
          <p className="text-wr-hint text-xs tracking-[0.2em] uppercase">Portal Finders</p>
        </div>

        <div className="bg-wr-surface border border-wr-border rounded-xl p-8 shadow-2xl">
          <h1 className="text-wr-text text-xl font-semibold mb-1">Acceso finders</h1>
          <p className="text-wr-muted text-sm mb-6">
            Entra con el email y contraseña que te enviamos.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-wr-muted text-xs font-medium mb-1.5 uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="tap-target-h w-full bg-wr-surface2 border border-wr-border rounded-lg px-3.5 py-2.5 text-wr-text text-sm placeholder:text-wr-hint focus:outline-none focus:border-wr-blue focus:ring-1 focus:ring-wr-blue transition-colors"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-wr-muted text-xs font-medium mb-1.5 uppercase tracking-wider"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="tap-target-h w-full bg-wr-surface2 border border-wr-border rounded-lg px-3.5 py-2.5 pr-12 text-wr-text text-sm placeholder:text-wr-hint focus:outline-none focus:border-wr-blue focus:ring-1 focus:ring-wr-blue transition-colors"
                  placeholder="••••••••"
                  required
                />
                <PasswordToggle
                  visible={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
              </div>
            </div>

            {error && (
              <p className="text-wr-red text-sm flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="tap-target-h w-full bg-wr-blue hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg py-2.5 transition-colors mt-2"
            >
              {loading ? "Verificando…" : "Entrar"}
            </button>
          </form>

          <Link
            href="/portal/forgot-password"
            className="block text-center text-wr-blue hover:underline text-xs mt-5"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <p className="text-center text-wr-hint text-xs mt-6">
          ¿Problemas de acceso? Contacta con Fontiber.
        </p>
      </div>
    </div>
  );
}
