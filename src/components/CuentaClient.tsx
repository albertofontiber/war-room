"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";

type Props = {
  name: string;
  email: string;
  passwordSetAt: string | null;
  emailDiario: boolean;
};

function errorMessage(json: { error?: string; issues?: { message: string }[] }): string {
  return json.issues?.map((i) => i.message).join("; ") || json.error || "Error";
}

const INPUT =
  "mt-1 w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text text-sm focus:outline-none focus:border-wr-blue";

export default function CuentaClient(props: Props) {
  return (
    <div className="min-h-screen bg-wr-bg text-wr-text p-3 sm:p-8">
      <div className="max-w-xl mx-auto">
        <nav aria-label="Ruta" className="flex items-center gap-1 text-xs text-wr-muted">
          <Link href="/" className="hover:text-wr-text">War Room</Link>
          <span className="text-wr-hint">/</span>
          <span className="text-wr-text font-medium">Mi cuenta</span>
        </nav>

        <h1 className="mt-3 text-lg font-semibold">Mi cuenta</h1>

        <section className="mt-5 bg-wr-surface border border-wr-border rounded-lg p-4">
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-wr-muted">Nombre</dt>
              <dd>{props.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-wr-muted">Email</dt>
              <dd className="truncate">{props.email}</dd>
            </div>
          </dl>
        </section>

        <PasswordSection passwordSetAt={props.passwordSetAt} />
        <AvisosSection emailDiario={props.emailDiario} />
      </div>
    </div>
  );
}

function PasswordSection({ passwordSetAt }: { passwordSetAt: string | null }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(passwordSetAt);
  const [done, setDone] = useState(false);

  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;
  const valid =
    form.current.length > 0 && form.next.length >= 10 && form.next === form.confirm;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/cuenta/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(errorMessage(json));
        return;
      }
      setSavedAt(json.passwordSetAt);
      setForm({ current: "", next: "", confirm: "" });
      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">Cambiar contraseña</h2>
      <p className="mt-1 mb-3 text-xs text-wr-muted">
        {savedAt
          ? `La fijaste el ${fmtDate(savedAt, "—")}.`
          : "Aún usas la contraseña inicial que se configuró para tu cuenta."}{" "}
        Mínimo 10 caracteres.
      </p>
      <form
        className="bg-wr-surface border border-wr-border rounded-lg p-4 space-y-3 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !submitting) submit();
        }}
      >
        <label className="block">
          <span className="text-[10px] text-wr-muted uppercase tracking-wider">Contraseña actual</span>
          <input
            type="password"
            autoComplete="current-password"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-wr-muted uppercase tracking-wider">Contraseña nueva</span>
          <input
            type="password"
            autoComplete="new-password"
            value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-wr-muted uppercase tracking-wider">Repite la contraseña nueva</span>
          <input
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            className={INPUT}
          />
        </label>
        {mismatch && <p className="text-wr-amber">Las contraseñas no coinciden.</p>}
        {error && <p className="text-wr-red">{error}</p>}
        {done && <p className="text-green-400">Contraseña cambiada.</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!valid || submitting}
            className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AvisosSection({ emailDiario: initial }: { emailDiario: boolean }) {
  const [emailDiario, setEmailDiario] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !emailDiario;
    setEmailDiario(next); // optimista; se revierte si falla
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/cuenta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailDiario: next }),
      });
      if (!res.ok) {
        setEmailDiario(!next);
        setError(errorMessage(await res.json()));
      }
    } catch (e) {
      setEmailDiario(!next);
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">Avisos por email</h2>
      <p className="mt-1 mb-3 text-xs text-wr-muted">
        Elige qué emails recibes. Las notificaciones de la campana se muestran igualmente.
      </p>
      <div className="bg-wr-surface border border-wr-border rounded-lg p-4 text-xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="email-diario-label" className="font-medium text-wr-text">Email diario del BORME</p>
            <p className="mt-0.5 text-wr-muted">
              Cada mañana, las señales del BORME y los cambios de perímetro del día anterior.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={emailDiario}
            aria-labelledby="email-diario-label"
            onClick={toggle}
            disabled={saving}
            className={`relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full border transition-colors disabled:opacity-60 ${
              emailDiario ? "bg-wr-blue border-wr-blue" : "bg-wr-surface2 border-wr-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                emailDiario ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        {error && <p className="mt-2 text-wr-red">{error}</p>}
      </div>
    </section>
  );
}
