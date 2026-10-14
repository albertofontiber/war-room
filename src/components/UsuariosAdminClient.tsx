"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";

type Usuario = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  passwordSetAt: string | null;
  createdAt: string;
  invitationExpiresAt: string | null;
  isMe: boolean;
};

/** Resultado de una invitación (alta o reenvío) que se enseña en un modal. */
type Invitacion = {
  name: string;
  email: string;
  inviteUrl: string;
  emailSent: boolean;
};

function errorMessage(json: { error?: string; issues?: { message: string }[] }): string {
  return json.issues?.map((i) => i.message).join("; ") || json.error || "Error";
}

export default function UsuariosAdminClient() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Alta
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "" });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Invitación recién emitida (alta o reenvío)
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null);
  const [copied, setCopied] = useState(false);

  // Confirmación de desactivar
  const [confirmOff, setConfirmOff] = useState<Usuario | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/usuarios", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setUsuarios(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setCreateForm({ name: "", email: "" });
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          email: createForm.email.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateError(errorMessage(json));
        return;
      }
      setCreateOpen(false);
      setCopied(false);
      setInvitacion({
        name: json.user.name,
        email: json.user.email,
        inviteUrl: json.inviteUrl,
        emailSent: json.emailSent,
      });
      load();
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleResend = async (u: Usuario) => {
    setBusyId(u.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}/invitacion`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setRowError(errorMessage(json));
        return;
      }
      setCopied(false);
      setInvitacion({
        name: u.name,
        email: u.email,
        inviteUrl: json.inviteUrl,
        emailSent: json.emailSent,
      });
      load();
    } catch (e) {
      setRowError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const setActive = async (u: Usuario, active: boolean) => {
    setBusyId(u.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRowError(errorMessage(json));
        return;
      }
      setConfirmOff(null);
      load();
    } catch (e) {
      setRowError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const createValid =
    createForm.name.trim().length > 0 && /\S+@\S+\.\S+/.test(createForm.email.trim());

  return (
    <div className="min-h-screen bg-wr-bg text-wr-text p-3 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Usuarios del war room</h1>
            <p className="text-wr-hint text-xs mt-0.5">
              Quién puede entrar al war room. Al dar de alta a alguien le llega un email para elegir su contraseña; tú nunca la ves.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
            <button
              onClick={openCreate}
              className="text-xs px-3 py-2 sm:py-1.5 rounded bg-wr-blue text-white hover:bg-blue-500"
            >
              + Nuevo usuario
            </button>
            <Link href="/finders" className="text-xs text-wr-blue hover:underline">
              Finders →
            </Link>
            <Link href="/" className="text-xs text-wr-blue hover:underline">← War Room</Link>
          </div>
        </header>

        {rowError && (
          <div className="mb-3 text-xs text-wr-red bg-wr-red/10 border border-wr-red/30 rounded px-3 py-2">
            {rowError}
          </div>
        )}

        <div className="bg-wr-surface border border-wr-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead className="bg-wr-surface2 text-wr-muted uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Nombre</th>
                <th className="text-left px-4 py-2 font-semibold">Email</th>
                <th className="text-left px-4 py-2 font-semibold">Estado</th>
                <th className="text-left px-4 py-2 font-semibold">Contraseña</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wr-border">
              {loading && usuarios.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-wr-hint">Cargando…</td></tr>
              )}
              {usuarios.map((u) => (
                <tr
                  key={u.id}
                  className={`hover:bg-wr-surface2/40 ${u.active ? "" : "opacity-60"}`}
                >
                  <td className="px-4 py-2 font-medium">
                    {u.name}
                    {u.isMe && <span className="ml-1.5 text-[10px] text-wr-hint">(tú)</span>}
                  </td>
                  <td className="px-4 py-2 text-wr-muted">{u.email}</td>
                  <td className="px-4 py-2">
                    {u.active ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-wr-red/10 text-wr-red border border-wr-red/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-wr-red" /> Desactivado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.passwordSetAt ? (
                      <span className="text-wr-muted">Fijada el {fmtDate(u.passwordSetAt, "—")}</span>
                    ) : u.invitationExpiresAt ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-wr-amber/10 text-wr-amber border border-wr-amber/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-wr-amber" />
                        Invitación pendiente · caduca el {fmtDate(u.invitationExpiresAt, "—")}
                      </span>
                    ) : (
                      <span
                        className="text-wr-hint"
                        title="No ha fijado contraseña propia. Si su invitación caducó, reenvíale el enlace."
                      >
                        Sin contraseña propia
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {u.active && (
                      <button
                        onClick={() => handleResend(u)}
                        disabled={busyId === u.id}
                        title="Envía por email un enlace nuevo para elegir contraseña (anula los anteriores)"
                        className="text-[11px] px-2 py-1 mr-2 rounded bg-wr-blue/10 border border-wr-blue/30 text-wr-blue hover:bg-wr-blue/20 disabled:opacity-50"
                      >
                        {u.passwordSetAt ? "Enviar enlace" : "Reenviar invitación"}
                      </button>
                    )}
                    {u.active ? (
                      !u.isMe && (
                        <button
                          onClick={() => { setRowError(null); setConfirmOff(u); }}
                          disabled={busyId === u.id}
                          className="text-[11px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-red hover:border-wr-red/40 disabled:opacity-50"
                        >
                          Desactivar
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => setActive(u, true)}
                        disabled={busyId === u.id}
                        className="text-[11px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text disabled:opacity-50"
                      >
                        Reactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-wr-hint mt-3">
          Todos los usuarios activos ven el war room completo y reciben los emails de resumen y avisos. Desactivar corta el acceso al momento; sus notas y tareas se conservan.
        </p>
      </div>

      {/* ─── Modal: nuevo usuario ─────────────────────────────────────────── */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setCreateOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[460px] max-w-[96vw] bg-wr-surface border border-wr-border rounded-lg shadow-2xl"
          >
            <div className="px-3 sm:px-5 py-3 border-b border-wr-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">Nuevo usuario del war room</h2>
              <button onClick={() => setCreateOpen(false)} className="text-wr-muted hover:text-wr-text text-lg leading-none">×</button>
            </div>
            <form
              className="p-3 sm:p-5 space-y-3 text-xs"
              onSubmit={(e) => {
                e.preventDefault();
                if (createValid && !createSubmitting) handleCreate();
              }}
            >
              <label className="block">
                <span className="text-[10px] text-wr-muted uppercase tracking-wider">Nombre</span>
                <input
                  autoFocus
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="mt-1 w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text text-sm focus:outline-none focus:border-wr-blue"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-wr-muted uppercase tracking-wider">Email</span>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="mt-1 w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text text-sm focus:outline-none focus:border-wr-blue"
                />
              </label>
              <p className="text-[11px] text-wr-hint">
                Le enviaremos un email con un enlace para elegir su contraseña. El enlace vale 7 días.
              </p>
              {createError && <p className="text-wr-red">{createError}</p>}
              <div className="flex justify-end gap-2 pt-2 border-t border-wr-border">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="text-xs px-3 py-1.5 bg-wr-surface2 border border-wr-border rounded text-wr-muted hover:text-wr-text"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!createValid || createSubmitting}
                  className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500 disabled:opacity-50"
                >
                  {createSubmitting ? "Enviando…" : "Dar de alta e invitar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: invitación enviada ────────────────────────────────────── */}
      {invitacion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setInvitacion(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[480px] max-w-[96vw] bg-wr-surface border border-wr-border rounded-lg shadow-2xl"
          >
            <div className="px-3 sm:px-5 py-3 border-b border-wr-border">
              <h2 className="text-sm font-semibold">
                {invitacion.emailSent ? "Invitación enviada" : "No se pudo enviar el email"}
              </h2>
              <p className="text-[10px] text-wr-hint mt-0.5">
                {invitacion.name} · {invitacion.email}
              </p>
            </div>
            <div className="p-3 sm:p-5 space-y-3 text-xs">
              <p className="text-wr-text">
                {invitacion.emailSent
                  ? "Le ha llegado un email con el enlace para elegir su contraseña. Si no lo encuentra, pásale este mismo enlace por WhatsApp:"
                  : "El usuario está dado de alta, pero el email no salió. Pásale este enlace por WhatsApp para que elija su contraseña:"}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 font-mono text-[11px] text-wr-text">
                  {invitacion.inviteUrl}
                </code>
                <button
                  onClick={() => handleCopy(invitacion.inviteUrl)}
                  className="text-[10px] px-2 py-1 rounded bg-wr-blue/10 border border-wr-blue/30 text-wr-blue hover:bg-wr-blue/20"
                >
                  {copied ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
              <p className="text-[11px] text-wr-hint">
                Vale 7 días y un solo uso. Quien tenga el enlace puede fijar la contraseña de esta cuenta, así que envíalo solo a esa persona.
              </p>
              <div className="flex justify-end pt-2 border-t border-wr-border">
                <button onClick={() => setInvitacion(null)} className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500">
                  Hecho
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: confirmar desactivar ──────────────────────────────────── */}
      {confirmOff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmOff(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[420px] max-w-[96vw] bg-wr-surface border border-wr-border rounded-lg shadow-2xl"
          >
            <div className="px-3 sm:px-5 py-3 border-b border-wr-border">
              <h2 className="text-sm font-semibold">¿Desactivar a {confirmOff.name}?</h2>
            </div>
            <div className="p-3 sm:p-5 space-y-3 text-xs">
              <p className="text-wr-text">
                Perderá el acceso al war room al momento, aunque tenga la sesión abierta. Sus notas, tareas e historial se conservan y puedes reactivarlo cuando quieras.
              </p>
              {rowError && <p className="text-wr-red">{rowError}</p>}
              <div className="flex justify-end gap-2 pt-2 border-t border-wr-border">
                <button
                  onClick={() => setConfirmOff(null)}
                  className="text-xs px-3 py-1.5 bg-wr-surface2 border border-wr-border rounded text-wr-muted hover:text-wr-text"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setActive(confirmOff, false)}
                  disabled={busyId === confirmOff.id}
                  className="text-xs px-3 py-1.5 bg-wr-red text-white rounded hover:opacity-90 disabled:opacity-50"
                >
                  {busyId === confirmOff.id ? "Desactivando…" : "Desactivar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
