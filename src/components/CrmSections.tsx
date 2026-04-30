"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import { TAREA_TIPOS, TAREA_TIPO_LABEL, TAREA_TIPO_ICON } from "@/lib/crm";
import type { TareaTipo } from "@/types";

// ─── Tipos compartidos ────────────────────────────────────────────────────

type Autor = { id: string; name: string } | null;

type Nota = {
  id: number;
  contenido: string;
  createdAt: string;
  updatedAt: string;
  autor: Autor;
  autorFinder?: Autor;
};

type Tarea = {
  id: number;
  tipo: TareaTipo;
  titulo: string;
  descripcion: string | null;
  resultado: string | null;
  fechaLimite: string | null;
  completada: boolean;
  completadaAt: string | null;
  autor: Autor;
  autorFinder?: Autor;
  asignado: Autor;
  asignadoFinder?: Autor;
};

type HistorialItem = {
  id: string;
  // Tras la fusión Tarea+Actividad solo quedan dos kinds; las llamadas/emails/
  // reuniones legacy ahora son `tarea_completada` con `meta.tipo` del enum.
  kind: "stage" | "tarea_completada";
  fecha: string;
  autor: string | null;
  autorKind?: "admin" | "finder" | null;
  texto: string;
  meta?: Record<string, unknown>;
};

/** Badge distintivo cuando la entrada la creó un finder desde el portal. */
function FinderBadge({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] bg-wr-amber/10 text-wr-amber border border-wr-amber/30 rounded px-1 py-0.5"
      title={`Aportado por el finder ${name}`}
    >
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="7" r="4" />
        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
      </svg>
      Finder: {name}
    </span>
  );
}

/**
 * Extrae un mensaje user-friendly de una Response fallida.
 * Soporta el formato {error, issues: [{path, message}]} que emite zodError()
 * en lib/validation.ts, además de {error} simple.
 */
async function extractError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    if (json?.issues?.length) {
      return json.issues
        .map((i: { path: string; message: string }) =>
          i.path ? `${i.path}: ${i.message}` : i.message
        )
        .join("; ");
    }
    if (json?.error) return String(json.error);
  } catch {
    /* fallthrough */
  }
  return `Error ${res.status}`;
}

// ─── Sección NOTAS ────────────────────────────────────────────────────────

export function NotasSection({ empresaId }: { empresaId: number }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [nueva, setNueva] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const load = useCallback(() => {
    fetch(`/api/empresas/${empresaId}/notas`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setNotas)
      .catch(() => setNotas([]));
  }, [empresaId]);

  useEffect(() => {
    load();
  }, [load]);

  async function crear() {
    if (!nueva.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: nueva }),
      });
      if (res.ok) {
        setNueva("");
        load();
      } else {
        const msg = await extractError(res);
        console.error("[NotasSection.crear]", msg);
        setError(msg);
      }
    } catch (err) {
      console.error("[NotasSection.crear] network", err);
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function guardarEdit(id: number) {
    if (!editContent.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/notas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: editContent }),
      });
      if (res.ok) {
        setEditing(null);
        load();
      } else {
        const msg = await extractError(res);
        console.error("[NotasSection.guardarEdit]", msg);
        setError(msg);
      }
    } catch (err) {
      console.error("[NotasSection.guardarEdit] network", err);
      setError("Error de red");
    }
  }

  async function borrar(id: number) {
    if (!confirm("¿Borrar esta nota?")) return;
    await fetch(`/api/notas/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="rounded-lg border border-wr-border bg-wr-surface2/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold text-wr-muted uppercase tracking-widest">
          Notas ({notas.length})
        </p>
      </div>

      <div className="space-y-1.5">
        <textarea
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Nueva nota interna…"
          rows={2}
          className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue resize-none"
        />
        <button
          onClick={crear}
          disabled={saving || !nueva.trim()}
          className="w-full px-2 py-1 text-xs rounded bg-wr-blue/15 text-wr-blue border border-wr-blue/30 hover:bg-wr-blue/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Guardando…" : "Añadir nota"}
        </button>
        {error && (
          <p className="text-[10px] text-wr-red bg-wr-red/10 border border-wr-red/30 rounded px-2 py-1">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {notas.length === 0 && (
          <p className="text-[10px] text-wr-hint italic text-center py-2">
            Sin notas
          </p>
        )}
        {notas.map((n) => (
          <div
            key={n.id}
            className="bg-wr-surface rounded border border-wr-border p-2 text-xs text-wr-text"
          >
            {editing === n.id ? (
              <>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={2}
                  className="w-full bg-wr-bg border border-wr-border rounded px-2 py-1 text-xs text-wr-text resize-none mb-1"
                />
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => setEditing(null)}
                    className="text-[10px] text-wr-muted hover:text-wr-text"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => guardarEdit(n.id)}
                    className="text-[10px] text-wr-blue hover:underline"
                  >
                    Guardar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-wr-text">{n.contenido}</p>
                <div className="flex items-center justify-between mt-1.5 text-[9px] text-wr-hint gap-1.5">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    {n.autorFinder ? <FinderBadge name={n.autorFinder.name} /> : <span>{n.autor?.name ?? "—"}</span>}
                    <span className="text-wr-hint">· {fmtDate(n.createdAt)}</span>
                  </span>
                  <span className="flex gap-1.5 items-center">
                    {/* Editar: solo notas de admin. Editar texto literal escrito por
                       un finder lo tergiversaría — no procede. */}
                    {!n.autorFinder && (
                      <button
                        onClick={() => {
                          setEditing(n.id);
                          setEditContent(n.contenido);
                        }}
                        className="hover:text-wr-text p-0.5"
                        title="Editar"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}
                    {/* Borrar: el admin puede borrar cualquier nota (admin o finder).
                       Mismo principio que el botón borrar del Historial — el admin
                       tiene control total sobre el contenido visible en su war room. */}
                    <button
                      onClick={() => borrar(n.id)}
                      className="hover:text-wr-red p-0.5"
                      title="Borrar"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sección TAREAS ───────────────────────────────────────────────────────

type User = { id: string; name: string; email: string };

export function TareasSection({ empresaId }: { empresaId: number }) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [incluirCompletadas, setIncluirCompletadas] = useState(false);
  const [tipo, setTipo] = useState<TareaTipo>("llamada");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [asignadoId, setAsignadoId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTipo, setEditTipo] = useState<TareaTipo>("llamada");
  const [editTitulo, setEditTitulo] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editFechaLimite, setEditFechaLimite] = useState("");
  const [editAsignadoId, setEditAsignadoId] = useState("");

  const load = useCallback(() => {
    const url = new URL(
      `/api/empresas/${empresaId}/tareas`,
      window.location.origin
    );
    if (incluirCompletadas) url.searchParams.set("incluirCompletadas", "true");
    fetch(url.toString(), { cache: "no-store" })
      .then((r) => r.json())
      .then(setTareas)
      .catch(() => setTareas([]));
  }, [empresaId, incluirCompletadas]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/users?role=admin", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setUsers(data))
      .catch(() => setUsers([]));
  }, []);

  async function crear() {
    if (!titulo.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/tareas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          titulo,
          descripcion: descripcion.trim() || null,
          fechaLimite: fechaLimite || null,
          asignadoId: asignadoId || null,
        }),
      });
      if (res.ok) {
        setTitulo("");
        setDescripcion("");
        setFechaLimite("");
        setAsignadoId("");
        setTipo("llamada");
        load();
      } else {
        const msg = await extractError(res);
        console.error("[TareasSection.crear]", msg);
        setError(msg);
      }
    } catch (err) {
      console.error("[TareasSection.crear] network", err);
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(t: Tarea) {
    setEditingId(t.id);
    setEditTipo(t.tipo);
    setEditTitulo(t.titulo);
    setEditDescripcion(t.descripcion ?? "");
    setEditFechaLimite(t.fechaLimite ? t.fechaLimite.split("T")[0] : "");
    setEditAsignadoId(t.asignado?.id ?? "");
  }

  async function guardarEdit() {
    if (editingId == null || !editTitulo.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/tareas/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: editTipo,
          titulo: editTitulo,
          descripcion: editDescripcion.trim() || null,
          fechaLimite: editFechaLimite || null,
          asignadoId: editAsignadoId || null,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        load();
      } else {
        const msg = await extractError(res);
        console.error("[TareasSection.guardarEdit]", msg);
        setError(msg);
      }
    } catch (err) {
      console.error("[TareasSection.guardarEdit] network", err);
      setError("Error de red");
    }
  }

  async function toggleCompletada(t: Tarea) {
    setError(null);
    try {
      const res = await fetch(`/api/tareas/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completada: !t.completada }),
      });
      if (!res.ok) {
        const msg = await extractError(res);
        console.error("[TareasSection.toggleCompletada]", msg);
        setError(msg);
        return;
      }
      load();
    } catch (err) {
      console.error("[TareasSection.toggleCompletada] network", err);
      setError("Error de red");
    }
  }

  async function borrar(id: number) {
    if (!confirm("¿Borrar esta tarea?")) return;
    await fetch(`/api/tareas/${id}`, { method: "DELETE" });
    load();
  }

  function estadoTarea(t: Tarea): { color: string; label: string } {
    if (t.completada) return { color: "text-wr-green", label: "Hecha" };
    if (!t.fechaLimite) return { color: "text-wr-muted", label: "Sin fecha" };
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limite = new Date(t.fechaLimite);
    limite.setHours(0, 0, 0, 0);
    if (limite < hoy) return { color: "text-wr-red", label: "Vencida" };
    if (limite.getTime() === hoy.getTime())
      return { color: "text-wr-amber", label: "Hoy" };
    return { color: "text-wr-muted", label: fmtDate(t.fechaLimite) };
  }

  const pendientes = tareas.filter((t) => !t.completada).length;

  return (
    <div className="rounded-lg border border-wr-border bg-wr-surface2/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold text-wr-muted uppercase tracking-widest">
          Tareas ({pendientes} pendientes)
        </p>
        <button
          onClick={() => setIncluirCompletadas((v) => !v)}
          className="text-[10px] text-wr-hint hover:text-wr-text"
        >
          {incluirCompletadas ? "Ocultar hechas" : "Ver hechas"}
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-3 gap-1.5">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TareaTipo)}
            className="bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue cursor-pointer"
          >
            {TAREA_TIPOS.map((t) => (
              <option key={t} value={t}>
                {TAREA_TIPO_LABEL[t]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
            className="bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue"
          />
          <select
            value={asignadoId}
            onChange={(e) => setAsignadoId(e.target.value)}
            className="bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue cursor-pointer"
          >
            <option value="">Asignar a…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título de la tarea…"
          className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue"
        />
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción (opcional)…"
          rows={2}
          className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue resize-none"
        />
        <button
          onClick={crear}
          disabled={saving || !titulo.trim()}
          className="w-full px-2 py-1 text-xs rounded bg-wr-blue/15 text-wr-blue border border-wr-blue/30 hover:bg-wr-blue/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Guardando…" : "Añadir tarea"}
        </button>
        {error && (
          <p className="text-[10px] text-wr-red bg-wr-red/10 border border-wr-red/30 rounded px-2 py-1">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto">
        {tareas.length === 0 && (
          <p className="text-[10px] text-wr-hint italic text-center py-2">
            Sin tareas
          </p>
        )}
        {tareas.map((t) => {
          const estado = estadoTarea(t);
          const editing = editingId === t.id;
          return (
            <div
              key={t.id}
              className="bg-wr-surface rounded border border-wr-border p-2 text-xs"
            >
              {editing ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-3 gap-1.5">
                    <select
                      value={editTipo}
                      onChange={(e) => setEditTipo(e.target.value as TareaTipo)}
                      className="bg-wr-bg border border-wr-border rounded-md px-2 py-1 text-xs text-wr-text focus:outline-none focus:border-wr-blue cursor-pointer"
                    >
                      {TAREA_TIPOS.map((tp) => (
                        <option key={tp} value={tp}>
                          {TAREA_TIPO_LABEL[tp]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={editFechaLimite}
                      onChange={(e) => setEditFechaLimite(e.target.value)}
                      className="bg-wr-bg border border-wr-border rounded-md px-2 py-1 text-xs text-wr-text focus:outline-none focus:border-wr-blue"
                    />
                    <select
                      value={editAsignadoId}
                      onChange={(e) => setEditAsignadoId(e.target.value)}
                      className="bg-wr-bg border border-wr-border rounded-md px-2 py-1 text-xs text-wr-text focus:outline-none focus:border-wr-blue cursor-pointer"
                    >
                      <option value="">Sin asignar</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={editTitulo}
                    onChange={(e) => setEditTitulo(e.target.value)}
                    className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1 text-xs text-wr-text focus:outline-none focus:border-wr-blue"
                  />
                  <textarea
                    value={editDescripcion}
                    onChange={(e) => setEditDescripcion(e.target.value)}
                    rows={2}
                    placeholder="Descripción (opcional)…"
                    className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue resize-none"
                  />
                  <div className="flex gap-1 justify-end text-[10px]">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-wr-muted hover:text-wr-text"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={guardarEdit}
                      className="text-wr-blue hover:underline"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={t.completada}
                    onChange={() => toggleCompletada(t)}
                    className="flex-shrink-0 mt-0.5 accent-wr-blue cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[9px] bg-wr-surface2 border border-wr-border rounded px-1 text-wr-muted whitespace-nowrap"
                        title={TAREA_TIPO_LABEL[t.tipo]}
                      >
                        {TAREA_TIPO_ICON[t.tipo]} {TAREA_TIPO_LABEL[t.tipo]}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 ${
                        t.completada ? "text-wr-hint line-through" : "text-wr-text"
                      }`}
                    >
                      {t.titulo}
                    </p>
                    {t.descripcion && (
                      <p className="text-[10px] text-wr-muted whitespace-pre-wrap mt-0.5">
                        {t.descripcion}
                      </p>
                    )}
                    <p className="text-[9px] text-wr-hint mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className={estado.color}>{estado.label}</span>
                      {t.asignadoFinder ? (
                        <>
                          <span>·</span>
                          <span>asignado a</span>
                          <FinderBadge name={t.asignadoFinder.name} />
                        </>
                      ) : t.asignado ? (
                        <span>· asignado a {t.asignado.name}</span>
                      ) : t.autorFinder ? (
                        <>
                          <span>·</span>
                          <span>creada por</span>
                          <FinderBadge name={t.autorFinder.name} />
                        </>
                      ) : t.autor ? (
                        <span>· creada por {t.autor.name}</span>
                      ) : null}
                    </p>
                  </div>
                  {/* Las tareas creadas por un finder se gestionan desde el portal,
                     no las edita el admin (evita colisión con la ventana 24h del finder). */}
                  {!t.autorFinder && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-wr-hint hover:text-wr-text p-1"
                        title="Editar"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => borrar(t.id)}
                        className="text-wr-hint hover:text-wr-red p-1"
                        title="Borrar"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sección HISTORIAL ────────────────────────────────────────────────────

const KIND_LABEL: Record<HistorialItem["kind"], string> = {
  stage: "Cambio de stage",
  tarea_completada: "Tarea completada",
};

const KIND_COLOR: Record<HistorialItem["kind"], string> = {
  stage: "text-wr-amber",
  tarea_completada: "text-wr-green",
};

export function HistorialSection({ empresaId }: { empresaId: number }) {
  const [items, setItems] = useState<HistorialItem[]>([]);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const reload = useCallback(() => {
    fetch(`/api/empresas/${empresaId}/historial`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  }, [empresaId]);

  useEffect(() => {
    if (!open) return;
    reload();
  }, [open, reload]);

  const borrarTarea = async (tareaId: number) => {
    if (!confirm("¿Borrar esta tarea del historial? Acción irreversible.")) return;
    setDeletingId(tareaId);
    try {
      const res = await fetch(`/api/tareas/${tareaId}`, { method: "DELETE" });
      if (!res.ok) {
        alert(`Error al borrar: ${res.status}`);
        return;
      }
      reload();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-wr-border bg-wr-surface2/40 p-3 space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <p className="text-[9px] font-semibold text-wr-muted uppercase tracking-widest">
          Historial {open && `(${items.length})`}
        </p>
        <span className="text-[10px] text-wr-hint">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="text-[10px] text-wr-hint italic text-center py-2">
              Sin histórico
            </p>
          )}
          {items.map((item) => {
            // Para tareas completadas, el meta incluye el tipo de tarea → chip
            const tareaTipo = item.meta?.tipo as string | undefined;
            const tareaId = item.meta?.tareaId as number | undefined;
            const esTareaValida =
              item.kind === "tarea_completada" && tareaTipo && (TAREA_TIPOS as string[]).includes(tareaTipo);
            // Quitar el prefijo ("{icono} {label} · ") del texto si ya vamos a mostrar el chip
            const textoLimpio = esTareaValida
              ? item.texto.replace(
                  new RegExp(`^${TAREA_TIPO_ICON[tareaTipo as TareaTipo]} ${TAREA_TIPO_LABEL[tareaTipo as TareaTipo]} · `),
                  ""
                )
              : item.texto;
            // Solo las tareas completadas son borrables. Los cambios de stage
            // (CrmLog) son auditoría inmutable.
            const esBorrable = item.kind === "tarea_completada" && typeof tareaId === "number";
            return (
              <div
                key={item.id}
                className="group bg-wr-surface rounded border border-wr-border p-2 text-xs"
              >
                <div className="flex items-center justify-between mb-0.5 gap-2">
                  <span
                    className={`text-[9px] font-semibold uppercase tracking-wider ${KIND_COLOR[item.kind]}`}
                  >
                    {KIND_LABEL[item.kind]}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[9px] text-wr-hint">{fmtDate(item.fecha)}</span>
                    {esBorrable && (
                      <button
                        onClick={() => borrarTarea(tareaId!)}
                        disabled={deletingId === tareaId}
                        title="Borrar tarea del historial"
                        className="opacity-0 group-hover:opacity-60 hover:text-wr-red hover:opacity-100 disabled:opacity-30 text-wr-hint p-0.5"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {esTareaValida && (
                  <div className="mb-1">
                    <span
                      className="text-[9px] bg-wr-surface2 border border-wr-border rounded px-1 py-0.5 text-wr-muted whitespace-nowrap inline-block"
                      title={TAREA_TIPO_LABEL[tareaTipo as TareaTipo]}
                    >
                      {TAREA_TIPO_ICON[tareaTipo as TareaTipo]} {TAREA_TIPO_LABEL[tareaTipo as TareaTipo]}
                    </span>
                  </div>
                )}
                {textoLimpio && (
                  <p className="text-wr-text whitespace-pre-wrap text-[11px] leading-snug">
                    {textoLimpio}
                  </p>
                )}
                {item.autor && (
                  <p className="text-[9px] text-wr-hint mt-0.5">
                    por{" "}
                    {item.autorKind === "finder" ? (
                      <FinderBadge name={item.autor} />
                    ) : (
                      <span>{item.autor}</span>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
