"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PasswordToggle } from "@/components/PasswordToggle";
import {
  AuthShell,
  authButton,
  authCard,
  authInput,
  authLabel,
  authLink,
} from "@/components/auth/AuthShell";

/** Formulario de login del War Room. `destino` ya viene validado por la página. */
export default function LoginClient({
  destino,
  portalEquivocado = false,
}: {
  destino: string;
  /** `?wrongPortal=1`: una sesión de finder rebotada desde el War Room. */
  portalEquivocado?: boolean;
}) {
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

    const res = await signIn("admin-credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.ok) {
      router.push(destino);
      router.refresh();
    } else {
      setError("Email o contraseña incorrectos.");
    }
  }

  return (
    <AuthShell
      subtitle="Acceso al espacio de M&A de Fontiber"
      footer={
        <>
          <p className="mt-4 text-center text-sm">
            <Link href="/forgot-password" className={authLink}>
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
          <p className="mt-4 text-center text-xs text-fontiber-sand/50">
            Acceso restringido al equipo de Fontiber.
          </p>
        </>
      }
    >
      {portalEquivocado && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-800"
        >
          Tu cuenta es del portal de finders.{" "}
          <Link href="/portal/login" className="font-medium underline">
            Entra desde el portal
          </Link>
          .
        </p>
      )}
      <form onSubmit={handleSubmit} className={`space-y-4 ${authCard}`}>
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

        <div>
          <label htmlFor="password" className={authLabel}>
            Contraseña
          </label>
          <div className="relative mt-1">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${authInput} pr-12`}
              required
            />
            <PasswordToggle
              tone="light"
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={authButton}>
          {loading ? "Verificando…" : "Continuar"}
        </button>
      </form>
    </AuthShell>
  );
}
