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
    <AuthShell
      title="Restablecer contraseña"
      subtitle="Te enviaremos un enlace para elegir una nueva."
      footer={
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className={authLink}>
            ← Volver al acceso
          </Link>
        </p>
      }
    >
      {submitted ? (
        <p role="status" className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
          Si <span className="font-medium text-neutral-900">{email}</span> tiene
          acceso, recibirá un email para restablecer la contraseña. El enlace
          caduca en 24 horas.
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
