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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function FindersAdminClient() {
  const [finders, setFinders] = useState<Finder[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de password (set/reset). NO auto-genera al abrir.
  const [pwdModal, setPwdModal] = useState<Finder | null>(null);
  const [pwdEditMode, setPwdEditMode] = useState(false); // true cuando se pulsa "Cambiar"
  const [pwdValue, setPwdValue] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Modal de creación de finder.
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    commissionPct: "",
    password: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/finders")
      .then((r) => r.json())
      .then((data) => setFinders(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ─── Password modal ──────────────────────────────────────────────────────
  const openPwdModal = (f: Finder) => {
    setPwdModal(f);
    setPwdEditMode(!f.passwordSetAt); // si nunca tuvo password, abrimos directo en modo edición
    setPwdValue(f.passwordSetAt ? "" : generatePassword());
    setPwdError(null);
    setSavedPassword(null);
    setCopied(false);
  };

  const closePwdModal = () => {
    setPwdModal(null);
    setPwdEditMode(false);
    setPwdValue("");
    setSavedPassword(null);
    setPwdError(null);
  };

  const handlePwdCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePwdSave = async () => {
    if (!pwdModal) return;
    setPwdSubmitting(true);
    setPwdError(null);
    try {
      const res = await fetch(`/api/finders/${pwdModal.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwdValue }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPwdError(
          json.issues?.map((i: { message: string }) => i.message).join("; ") ||
            json.error ||
            "Error"
        );
        return;
      }
      if (!json.passwordSetAt) {
        setPwdError("El servidor no confirmó la escritura. Reintenta.");
        return;
      }
      setSavedPassword(pwdValue);
      load();
    } catch (e) {
      setPwdError(String(e));
    } finally {
      setPwdSubmitting(false);
    }
  };

  // ─── Create finder modal ─────────────────────────────────────────────────
  const openCreateModal = () => {
    setCreateOpen(true);
    setCreateForm({
      name: "",
      email: "",
      commissionPct: "",
      password: generatePassword(),
    });
    setCreateError(null);
    setCreatedPassword(null);
    setCopied(false);
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    setCreateForm({ name: "", email: "", commissionPct: "", password: "" });
    setCreateError(null);
    setCreatedPassword(null);
  };

  const handleCreate = async () => {
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const body: {
        name: string;
        email: string;
        password: string;
        commissionPct?: number;
      } = {
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
      };
      if (createForm.commissionPct.trim()) {
        const n = parseFloat(createForm.commissionPct.replace(",", "."));
        if (!isNaN(n)) body.commissionPct = n;
      }
      const res = await fetch("/api/finders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setCreateError(
          json.issues?.map((i: { message: string }) => i.message).join("; ") ||
            json.error ||
            "Error"
        );
        return;
      }
      setCreatedPassword(createForm.password);
      load();
    } catch (e) {
      setCreateError(String(e));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const createValid =
    createForm.name.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(createForm.email.trim()) &&
    createForm.password.length >= 10;

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
            <button
              onClick={openCreateModal}
              className="text-xs px-3 py-1.5 rounded bg-wr-blue text-white hover:bg-blue-500"
            >
              + Nuevo finder
            </button>
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
                      onClick={() => openPwdModal(f)}
                      className="text-[11px] px-2 py-1 rounded bg-wr-blue/10 border border-wr-blue/30 text-wr-blue hover:bg-wr-blue/20"
                    >
                      {f.passwordSetAt ? "Gestionar password" : "Set password"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Modal: Set/Reset password ───────────────────────────────────── */}
      {pwdModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closePwdModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[460px] max-w-[92vw] bg-wr-surface border border-wr-border rounded-lg shadow-2xl"
          >
            <div className="px-5 py-3 border-b border-wr-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  {savedPassword
                    ? "Password activa"
                    : pwdEditMode
                    ? (pwdModal.passwordSetAt ? "Cambiar password" : "Nueva password")
                    : "Password del finder"}
                </h2>
                <p className="text-[10px] text-wr-hint mt-0.5">
                  {pwdModal.name} · {pwdModal.email}
                </p>
              </div>
              <button onClick={closePwdModal} className="text-wr-muted hover:text-wr-text text-lg leading-none">×</button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              {savedPassword ? (
                <>
                  <p className="text-wr-text">
                    Copia la contraseña y pásala al finder por canal seguro (WhatsApp/Signal). No se vuelve a mostrar.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 font-mono text-sm text-wr-text">
                      {savedPassword}
                    </code>
                    <button
                      onClick={() => handlePwdCopy(savedPassword)}
                      className="text-[10px] px-2 py-1 rounded bg-wr-blue/10 border border-wr-blue/30 text-wr-blue hover:bg-wr-blue/20"
                    >
                      {copied ? "¡Copiada!" : "Copiar"}
                    </button>
                  </div>
                  <div className="flex justify-end pt-2 border-t border-wr-border">
                    <button onClick={closePwdModal} className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500">
                      Hecho
                    </button>
                  </div>
                </>
              ) : !pwdEditMode ? (
                <>
                  <div className="rounded border border-wr-border bg-wr-surface2/40 p-3 space-y-1">
                    <p className="text-[10px] text-wr-muted uppercase tracking-wider">Estado</p>
                    <p className="text-wr-text">
                      Password fijada el <span className="font-semibold">{formatDate(pwdModal.passwordSetAt)}</span>.
                    </p>
                    <p className="text-[11px] text-wr-hint">
                      Por seguridad la contraseña no se puede recuperar (está hasheada). Si el finder la perdió o quieres rotarla, púlsalo "Cambiar password".
                    </p>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-wr-border">
                    <button
                      onClick={closePwdModal}
                      className="text-xs px-3 py-1.5 bg-wr-surface2 border border-wr-border rounded text-wr-muted hover:text-wr-text"
                    >
                      Cerrar
                    </button>
                    <button
                      onClick={() => {
                        setPwdEditMode(true);
                        setPwdValue(generatePassword());
                      }}
                      className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500"
                    >
                      Cambiar password
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="text-[10px] text-wr-muted uppercase tracking-wider">Contraseña (mínimo 10 caracteres)</span>
                    <div className="mt-1 flex gap-2">
                      <input
                        value={pwdValue}
                        onChange={(e) => setPwdValue(e.target.value)}
                        className="flex-1 bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text font-mono text-sm focus:outline-none focus:border-wr-blue"
                      />
                      <button
                        type="button"
                        onClick={() => setPwdValue(generatePassword())}
                        className="text-[10px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text"
                      >
                        Generar
                      </button>
                    </div>
                  </label>

                  <div className="rounded border border-wr-amber/30 bg-wr-amber/5 p-2 text-[11px] text-wr-muted">
                    {pwdModal.passwordSetAt
                      ? "Si guardas, la password anterior deja de funcionar inmediatamente."
                      : "El finder podrá iniciar sesión en el portal con su email y esta contraseña."}
                  </div>

                  {pwdError && <p className="text-wr-red text-[11px]">{pwdError}</p>}

                  <div className="flex justify-end gap-2 pt-2 border-t border-wr-border">
                    <button
                      onClick={pwdModal.passwordSetAt ? () => setPwdEditMode(false) : closePwdModal}
                      disabled={pwdSubmitting}
                      className="text-xs px-3 py-1.5 bg-wr-surface2 border border-wr-border rounded text-wr-muted hover:text-wr-text"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handlePwdSave}
                      disabled={pwdSubmitting || pwdValue.length < 10}
                      className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500 disabled:opacity-40"
                    >
                      {pwdSubmitting ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Create finder ────────────────────────────────────────── */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeCreateModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[480px] max-w-[92vw] bg-wr-surface border border-wr-border rounded-lg shadow-2xl"
          >
            <div className="px-5 py-3 border-b border-wr-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {createdPassword ? "Finder creado" : "Nuevo finder"}
              </h2>
              <button onClick={closeCreateModal} className="text-wr-muted hover:text-wr-text text-lg leading-none">×</button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              {createdPassword ? (
                <>
                  <p className="text-wr-text">
                    Finder creado correctamente. Copia la contraseña y pásala por canal seguro (WhatsApp/Signal). No se vuelve a mostrar.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 font-mono text-sm text-wr-text">
                      {createdPassword}
                    </code>
                    <button
                      onClick={() => handlePwdCopy(createdPassword)}
                      className="text-[10px] px-2 py-1 rounded bg-wr-blue/10 border border-wr-blue/30 text-wr-blue hover:bg-wr-blue/20"
                    >
                      {copied ? "¡Copiada!" : "Copiar"}
                    </button>
                  </div>
                  <div className="flex justify-end pt-2 border-t border-wr-border">
                    <button onClick={closeCreateModal} className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500">
                      Hecho
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="text-[10px] text-wr-muted uppercase tracking-wider">Nombre</span>
                    <input
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder="Nombre completo"
                      className="mt-1 w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text focus:outline-none focus:border-wr-blue"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] text-wr-muted uppercase tracking-wider">Email</span>
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      placeholder="finder@empresa.com"
                      className="mt-1 w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text focus:outline-none focus:border-wr-blue"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] text-wr-muted uppercase tracking-wider">Comisión % (opcional)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={createForm.commissionPct}
                      onChange={(e) => setCreateForm({ ...createForm, commissionPct: e.target.value })}
                      placeholder="ej. 1.5"
                      className="mt-1 w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text focus:outline-none focus:border-wr-blue"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] text-wr-muted uppercase tracking-wider">Contraseña inicial (mínimo 10)</span>
                    <div className="mt-1 flex gap-2">
                      <input
                        value={createForm.password}
                        onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                        className="flex-1 bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text font-mono text-sm focus:outline-none focus:border-wr-blue"
                      />
                      <button
                        type="button"
                        onClick={() => setCreateForm({ ...createForm, password: generatePassword() })}
                        className="text-[10px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text"
                      >
                        Generar
                      </button>
                    </div>
                  </label>

                  {createError && <p className="text-wr-red text-[11px]">{createError}</p>}

                  <div className="flex justify-end gap-2 pt-2 border-t border-wr-border">
                    <button
                      onClick={closeCreateModal}
                      disabled={createSubmitting}
                      className="text-xs px-3 py-1.5 bg-wr-surface2 border border-wr-border rounded text-wr-muted hover:text-wr-text"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={createSubmitting || !createValid}
                      className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500 disabled:opacity-40"
                    >
                      {createSubmitting ? "Creando…" : "Crear finder"}
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
