"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AuthShell,
  authButton,
  authCard,
  authInput,
  authLabel,
  authLink,
} from "@/components/auth/AuthShell";

export default function PortalForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Endpoint anti-enumeración: siempre 200, exista o no el email.
      // Solo nos importa que se complete; no usamos el resultado.
      await fetch("/api/portal/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Aunque falle la red, mostramos el mismo mensaje genérico — no
      // queremos que el usuario sepa si su email está registrado o no.
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <AuthShell
      brand="Finders"
      title="Restablecer contraseña"
      subtitle="Te enviaremos un enlace para elegir una nueva."
      footer={
        <p className="mt-6 text-center text-sm">
          <Link href="/portal/login" className={authLink}>
            ← Volver al acceso
          </Link>
        </p>
      }
    >
      {submitted ? (
        <p role="status" className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
          Si <span className="font-medium text-neutral-900">{email}</span> está
          registrado, en breve recibirás un email con instrucciones para
          restablecer tu contraseña. El enlace caduca en 24 horas.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className={`space-y-3 ${authCard}`}>
          <div>
            <label htmlFor="email" className={authLabel}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1 ${authInput}`}
              required
            />
          </div>

          <button type="submit" disabled={loading} className={authButton}>
            {loading ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
