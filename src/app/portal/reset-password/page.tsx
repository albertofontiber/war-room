"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordToggle } from "@/components/PasswordToggle";
import {
  AuthNotice,
  AuthShell,
  authButton,
  authCard,
  authInput,
  authLabel,
  authLink,
} from "@/components/auth/AuthShell";

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
          "No hemos podido guardar la contraseña."
      );
    } catch {
      setError("Error de red. Reintenta en unos segundos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      brand="Finders"
      title="Elige tu contraseña"
      subtitle={!done && token ? "Mínimo 10 caracteres." : undefined}
    >
      {done ? (
        <>
          <AuthNotice>Contraseña guardada. Te llevamos al acceso…</AuthNotice>
          <p className="text-center text-sm">
            <Link href="/portal/login" className={authLink}>
              Ir al acceso
            </Link>
          </p>
        </>
      ) : !token ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-5 text-center text-sm text-neutral-600">
          <p>El enlace no es válido o ha caducado.</p>
          <Link
            href="/portal/forgot-password"
            className="mt-3 inline-block font-medium text-neutral-900 underline"
          >
            Solicitar uno nuevo
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={`space-y-3 ${authCard}`}>
          <div>
            <label htmlFor="password" className={authLabel}>
              Contraseña
            </label>
            <div className="relative mt-1">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${authInput} pr-12`}
                required
                minLength={10}
              />
              <PasswordToggle
                tone="light"
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirm" className={authLabel}>
              Repite la contraseña
            </label>
            <div className="relative mt-1">
              <input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`${authInput} pr-12`}
                required
                minLength={10}
              />
              <PasswordToggle
                tone="light"
                visible={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className={authButton}>
            {loading ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
