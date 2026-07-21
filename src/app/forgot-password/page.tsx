"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // El mensaje es deliberadamente genérico para no revelar cuentas.
    } finally {
      setLoading(false);
      setSubmitted(true);
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
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-wr-blue" aria-hidden="true">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" fill="#3b82f6" opacity="0.15" />
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className="text-wr-text font-semibold text-lg tracking-wide">
              FONTIBER INDUSTRIAL PARTNERS
            </span>
          </div>
          <p className="text-wr-hint text-xs tracking-[0.2em] uppercase">
            War Room · M&amp;A Intelligence
          </p>
        </div>

        <div className="bg-wr-surface border border-wr-border rounded-xl p-8 shadow-2xl">
          {submitted ? (
            <>
              <h1 className="text-wr-text text-xl font-semibold mb-2">
                Revisa tu email
              </h1>
              <p className="text-wr-muted text-sm mb-6">
                Si <span className="text-wr-text">{email}</span> tiene acceso,
                recibirá un email para restablecer la contraseña. El enlace
                caduca en 24 horas.
              </p>
              <Link
                href="/login"
                className="inline-block w-full text-center bg-wr-blue hover:bg-blue-500 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
              >
                Volver al login
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-wr-text text-xl font-semibold mb-1">
                Restablecer contraseña
              </h1>
              <p className="text-wr-muted text-sm mb-6">
                Introduce tu email de Fontiber y te enviaremos un enlace para
                elegir una contraseña nueva.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-wr-muted text-xs font-medium mb-1.5 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="tap-target-h w-full bg-wr-surface2 border border-wr-border rounded-lg px-3.5 py-2.5 text-wr-text text-sm placeholder:text-wr-hint focus:outline-none focus:border-wr-blue focus:ring-1 focus:ring-wr-blue transition-colors"
                    placeholder="nombre@fontiber.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="tap-target-h w-full bg-wr-blue hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg py-2.5 transition-colors mt-2"
                >
                  {loading ? "Enviando…" : "Enviar email de recuperación"}
                </button>
              </form>

              <Link href="/login" className="block text-center text-wr-blue hover:underline text-xs mt-6">
                ← Volver al login
              </Link>
            </>
          )}
        </div>

        <p className="text-center text-wr-hint text-xs mt-6">
          Acceso exclusivo · Fontiber Industrial Partners
        </p>
      </div>
    </div>
  );
}
