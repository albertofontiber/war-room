"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

// Next 14 App Router exige Suspense alrededor de useSearchParams; sin él,
// `next build` falla con "missing-suspense-with-csr-bailout" al intentar
// prerenderizar la página estáticamente. El form vive en un sub-componente
// para que el wrapper exportado pueda envolverlo en <Suspense>.
export default function PortalResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
        // Pequeña pausa para que el finder vea la confirmación, luego redirige.
        setTimeout(() => router.push("/portal/login"), 2500);
        return;
      }
      const json = await res.json().catch(() => ({}));
      setError(
        json?.error ??
          json?.issues?.[0]?.message ??
          "No hemos podido restablecer la contraseña."
      );
    } catch {
      setError("Error de red. Reintenta en unos segundos.");
    } finally {
      setLoading(false);
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
          {done ? (
            <>
              <h1 className="text-wr-text text-xl font-semibold mb-2">
                Contraseña actualizada
              </h1>
              <p className="text-wr-muted text-sm mb-6">
                Te llevamos al login para que entres con la nueva contraseña…
              </p>
              <Link
                href="/portal/login"
                className="inline-block w-full text-center bg-wr-blue hover:bg-blue-500 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
              >
                Ir al login
              </Link>
            </>
          ) : !token ? (
            <>
              <h1 className="text-wr-text text-xl font-semibold mb-2">
                Enlace inválido
              </h1>
              <p className="text-wr-muted text-sm mb-6">
                Este link no contiene un token de reset válido. Pide uno
                nuevo desde la página de &quot;¿Olvidaste tu contraseña?&quot;.
              </p>
              <Link
                href="/portal/forgot-password"
                className="inline-block w-full text-center bg-wr-blue hover:bg-blue-500 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
              >
                Pedir nuevo email
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-wr-text text-xl font-semibold mb-1">
                Nueva contraseña
              </h1>
              <p className="text-wr-muted text-sm mb-6">
                Elige una contraseña de al menos 10 caracteres.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-wr-muted text-xs font-medium mb-1.5 uppercase tracking-wider"
                  >
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-wr-surface2 border border-wr-border rounded-lg px-3.5 py-2.5 text-wr-text text-sm placeholder:text-wr-hint focus:outline-none focus:border-wr-blue focus:ring-1 focus:ring-wr-blue transition-colors"
                    placeholder="••••••••••"
                    required
                    minLength={10}
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm"
                    className="block text-wr-muted text-xs font-medium mb-1.5 uppercase tracking-wider"
                  >
                    Confirmar contraseña
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full bg-wr-surface2 border border-wr-border rounded-lg px-3.5 py-2.5 text-wr-text text-sm placeholder:text-wr-hint focus:outline-none focus:border-wr-blue focus:ring-1 focus:ring-wr-blue transition-colors"
                    placeholder="••••••••••"
                    required
                    minLength={10}
                  />
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
                  className="w-full bg-wr-blue hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg py-2.5 transition-colors mt-2"
                >
                  {loading ? "Guardando…" : "Establecer contraseña"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-wr-hint text-xs mt-6">
          ¿Problemas de acceso? Contacta con Fontiber.
        </p>
      </div>
    </div>
  );
}
