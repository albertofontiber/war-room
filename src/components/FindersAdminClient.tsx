"use client";

import { useEffect, useState } from "react";

type Finder = {
  id: string;
  name: string;
  email: string;
  commissionPct: number | null;
  passwordSetAt: string | null;
};

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const array = new Uint32Array(14);
  crypto.getRandomValues(array);
  for (let i = 0; i < 14; i++) out += chars[array[i] % chars.length];
  return out;
}

export default function FindersAdminClient() {
  const [finders, setFinders] = useState<Finder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalFinder, setModalFinder] = useState<Finder | null>(null);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/finders")
      .then((r) => r.json())
      .then((data) => setFinders(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openModal = (f: Finder) => {
    setModalFinder(f);
    setPassword(generatePassword());
    setCopied(false);
    setError(null);
    setSavedPassword(null);
  };

  const closeModal = () => {
    setModalFinder(null);
    setPassword("");
    setSavedPassword(null);
    setError(null);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!modalFinder) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/finders/${modalFinder.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.issues?.map((i: { message: string }) => i.message).join("; ") || json.error || "Error");
        return;
      }
      setSavedPassword(password);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-wr-bg text-wr-text p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Finders</h1>
            <p className="text-wr-hint text-xs mt-0.5">
              Gestión de acceso al portal. La password solo se muestra una vez — cópiala y pásala al finder por canal seguro.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/finders/proposals" className="text-xs text-wr-blue hover:underline">
              Revisar propuestas →
            </a>
            <a href="/" className="text-xs text-wr-blue hover:underline">← War Room</a>
          </div>
        </header>

        <div className="bg-wr-surface border border-wr-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-wr-surface2 text-wr-muted uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Nombre</th>
                <th className="text-left px-4 py-2 font-semibold">Email</th>
                <th className="text-left px-4 py-2 font-semibold">Comisión</th>
                <th className="text-left px-4 py-2 font-semibold">Portal</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wr-border">
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-wr-hint">Cargando…</td></tr>
              )}
              {!loading && finders.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-wr-hint">No hay finders activos.</td></tr>
              )}
              {finders.map((f) => (
                <tr key={f.id} className="hover:bg-wr-surface2/40">
                  <td className="px-4 py-2 font-medium">{f.name}</td>
                  <td className="px-4 py-2 text-wr-muted">{f.email}</td>
                  <td className="px-4 py-2 text-wr-muted">
                    {f.commissionPct != null ? `${f.commissionPct}%` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {f.passwordSetAt ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-wr-amber/10 text-wr-amber border border-wr-amber/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-wr-amber" /> Sin acceso
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => openModal(f)}
                      className="text-[11px] px-2 py-1 rounded bg-wr-blue/10 border border-wr-blue/30 text-wr-blue hover:bg-wr-blue/20"
                    >
                      {f.passwordSetAt ? "Resetear password" : "Set password"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalFinder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[460px] max-w-[92vw] bg-wr-surface border border-wr-border rounded-lg shadow-2xl"
          >
            <div className="px-5 py-3 border-b border-wr-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  {savedPassword ? "Password activa" : (modalFinder.passwordSetAt ? "Resetear password" : "Nueva password")}
                </h2>
                <p className="text-[10px] text-wr-hint mt-0.5">
                  {modalFinder.name} · {modalFinder.email}
                </p>
              </div>
              <button onClick={closeModal} className="text-wr-muted hover:text-wr-text text-lg leading-none">×</button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              {!savedPassword ? (
                <>
                  <label className="block">
                    <span className="text-[10px] text-wr-muted uppercase tracking-wider">Contraseña (mínimo 10 caracteres)</span>
                    <div className="mt-1 flex gap-2">
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="flex-1 bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text font-mono text-sm focus:outline-none focus:border-wr-blue"
                      />
                      <button
                        type="button"
                        onClick={() => setPassword(generatePassword())}
                        className="text-[10px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text"
                      >
                        Regenerar
                      </button>
                    </div>
                  </label>

                  <div className="rounded border border-wr-amber/30 bg-wr-amber/5 p-2 text-[11px] text-wr-muted">
                    {modalFinder.passwordSetAt
                      ? "Si guardas, la password anterior deja de funcionar inmediatamente."
                      : "El finder podrá iniciar sesión en el portal con su email y esta contraseña."}
                  </div>

                  {error && <p className="text-wr-red text-[11px]">{error}</p>}

                  <div className="flex justify-end gap-2 pt-2 border-t border-wr-border">
                    <button onClick={closeModal} disabled={submitting}
                      className="text-xs px-3 py-1.5 bg-wr-surface2 border border-wr-border rounded text-wr-muted hover:text-wr-text">
                      Cancelar
                    </button>
                    <button onClick={handleSave} disabled={submitting || password.length < 10}
                      className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500 disabled:opacity-40">
                      {submitting ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-wr-text">Copia la contraseña y pásala al finder por canal seguro (WhatsApp/Signal). No se vuelve a mostrar.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 font-mono text-sm text-wr-text">
                      {savedPassword}
                    </code>
                    <button onClick={handleCopy} className="text-[10px] px-2 py-1 rounded bg-wr-blue/10 border border-wr-blue/30 text-wr-blue hover:bg-wr-blue/20">
                      {copied ? "¡Copiada!" : "Copiar"}
                    </button>
                  </div>
                  <div className="flex justify-end pt-2 border-t border-wr-border">
                    <button onClick={closeModal} className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500">
                      Hecho
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
