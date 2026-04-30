"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";
import {
  FINDER_STATUS_MAP,
  FINDER_STATUS_PILL,
  TAREA_TIPOS,
  TAREA_TIPO_LABEL,
  TAREA_TIPO_ICON,
} from "@/lib/crm";
import type { FinderStatus } from "@/lib/crm";
import type { DealStage, TareaTipo } from "@/types";

type Nota = {
  id: number;
  contenido: string;
  createdAt: string;
  autor?: { name: string } | null;
  autorFinder?: { name: string } | null;
};
type Tarea = {
  id: number;
  tipo: string;
  titulo: string;
  descripcion: string | null;
  resultado: string | null;
  fechaLimite: string | null;
  completada: boolean;
  completadaAt: string | null;
  createdAt: string;
  autor?: { name: string } | null;
  autorFinder?: { name: string } | null;
};

type Target = {
  id: number;
  nombre: string;
  sector: string | null;
  provincia: string | null;
  ccaa: string | null;
  localidad: string | null;
  web: string | null;
  linkedin: string | null;
  descripcion: string | null;
  logoUrl: string | null;
  crmEstado: { dealStage: DealStage | null; fechaEntradaStage: string | null } | null;
  notas: Nota[];
  tareas: Tarea[];
};

const SECTOR_LABEL: Record<string, string> = {
  PCI: "PCI",
  seguridad_electronica: "Seg. electrónica",
  mixto: "Mixto",
};

export default function PortalTargetClient({
  empresaId,
  finderName,
}: {
  empresaId: number;
  finderName: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/portal/empresas/${empresaId}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error("No tienes acceso a este target.");
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then(setTarget)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  const initials = finderName.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const stage = target?.crmEstado?.dealStage ?? null;
  const status: FinderStatus | null = stage ? FINDER_STATUS_MAP[stage] : null;

  return (
    <div className="min-h-screen flex flex-col bg-wr-bg">
      <header className="h-12 flex-shrink-0 flex items-center px-5 gap-3 border-b border-wr-border bg-wr-surface">
        <button
          onClick={() => router.push("/portal")}
          className="text-[11px] text-wr-muted hover:text-wr-text flex items-center gap-1"
        >
          ← Pipeline
        </button>
        <div className="flex-1" />
        <span className="text-[11px] text-wr-hint">{finderName}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/portal/login" })}
          className="w-7 h-7 rounded-full bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-xs font-semibold flex items-center justify-center hover:bg-wr-blue/30"
        >
          {initials}
        </button>
      </header>

      <main className="flex-1 overflow-auto">
        {loading && <p className="p-8 text-center text-wr-hint text-sm">Cargando…</p>}
        {error && <p className="p-8 text-center text-wr-red text-sm">{error}</p>}
        {target && (
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {/* Header target */}
            <div className="flex items-start gap-4">
              {target.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={target.logoUrl} alt="" className="w-14 h-14 object-contain rounded-lg border border-wr-border bg-wr-surface2" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-xl font-bold flex items-center justify-center flex-shrink-0">
                  {target.nombre.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-wr-text">{target.nombre}</h1>
                <p className="text-xs text-wr-muted">
                  {[
                    target.sector ? SECTOR_LABEL[target.sector] ?? target.sector : null,
                    target.localidad,
                    target.provincia,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${FINDER_STATUS_PILL[status]}`}>
                      {status}
                    </span>
                  )}
                  {target.web && (
                    <a
                      href={target.web.startsWith("http") ? target.web : `https://${target.web}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-wr-blue hover:underline"
                    >
                      Web ↗
                    </a>
                  )}
                  {target.linkedin && (
                    <a
                      href={target.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-wr-blue hover:underline"
                    >
                      LinkedIn ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {target.descripcion && (
              <p className="text-xs text-wr-muted leading-relaxed border-l-2 border-wr-border pl-3">
                {target.descripcion}
              </p>
            )}

            <TareasSection empresaId={empresaId} tareas={target.tareas} onChanged={load} />
            <NotasSection empresaId={empresaId} notas={target.notas} onChanged={load} />
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Secciones ───────────────────────────────────────────────────────────────

function SectionHeader({ title, count, onAdd, adding }: { title: string; count: number; onAdd: () => void; adding: boolean }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-[10px] font-semibold text-wr-muted uppercase tracking-widest">
        {title} ({count})
      </h2>
      {!adding && (
        <button
          onClick={onAdd}
          className="text-[10px] px-2 py-0.5 rounded bg-wr-blue/10 border border-wr-blue/30 text-wr-blue hover:bg-wr-blue/20"
        >
          + Añadir
        </button>
      )}
    </div>
  );
}

// Sección unificada Tareas + Actividades históricas. El finder elige al crear:
//   - "Pendiente" → completada=false, fecha futura sugerida.
//   - "Ya hecho"  → completada=true + caja Resultado/Notas post-evento.
// Ambos viven como Tarea internamente. Una vez creada, el item puede pasar de
// pendiente → hecho rellenando el resultado al completar.
function TareasSection({ empresaId, tareas, onChanged }: { empresaId: number; tareas: Tarea[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [modo, setModo] = useState<"pendiente" | "hecho">("pendiente");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [resultado, setResultado] = useState("");
  const [tipo, setTipo] = useState<TareaTipo>("llamada");
  const [fecha, setFecha] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setModo("pendiente"); setTitulo(""); setDescripcion(""); setResultado("");
    setTipo("llamada"); setFecha(""); setError(null); setAdding(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const completada = modo === "hecho";
    // Si "Ya hecho" sin título explícito, se autogenera desde el tipo.
    const tituloEfectivo = titulo.trim() || (completada ? TAREA_TIPO_LABEL[tipo] : "");
    if (!tituloEfectivo) {
      setError("El título es obligatorio para tareas pendientes.");
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/portal/empresas/${empresaId}/tareas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: tituloEfectivo,
          descripcion: descripcion || null,
          resultado: completada ? (resultado || null) : null,
          tipo,
          fechaLimite: fecha ? new Date(fecha).toISOString() : null,
          completada,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.issues?.map((i: { message: string }) => i.message).join("; ") || json.error || "Error");
        return;
      }
      reset();
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // Orden: pendientes primero (por fecha asc), luego completadas (más recientes primero).
  const ordered = useMemo(() => {
    const pendientes = tareas.filter((t) => !t.completada).sort((a, b) => {
      const fa = a.fechaLimite ?? a.createdAt;
      const fb = b.fechaLimite ?? b.createdAt;
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });
    const hechas = tareas.filter((t) => t.completada).sort((a, b) => {
      const fa = a.completadaAt ?? a.createdAt;
      const fb = b.completadaAt ?? b.createdAt;
      return fa > fb ? -1 : fa < fb ? 1 : 0;
    });
    return [...pendientes, ...hechas];
  }, [tareas]);

  return (
    <section>
      <SectionHeader title="Tareas y actividad" count={tareas.length} onAdd={() => setAdding(true)} adding={adding} />

      {adding && (
        <form onSubmit={submit} className="bg-wr-surface border border-wr-border rounded-lg p-3 space-y-2 mb-3">
          {/* Toggle Pendiente / Ya hecho */}
          <div className="flex gap-1 p-0.5 bg-wr-surface2 border border-wr-border rounded">
            <button
              type="button"
              onClick={() => setModo("pendiente")}
              className={`flex-1 text-[11px] py-1 rounded transition-colors ${
                modo === "pendiente"
                  ? "bg-wr-blue text-white"
                  : "text-wr-muted hover:text-wr-text"
              }`}
            >
              Pendiente
            </button>
            <button
              type="button"
              onClick={() => setModo("hecho")}
              className={`flex-1 text-[11px] py-1 rounded transition-colors ${
                modo === "hecho"
                  ? "bg-wr-green text-white"
                  : "text-wr-muted hover:text-wr-text"
              }`}
            >
              Ya hecho
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TareaTipo)}
              className="bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text"
            >
              {TAREA_TIPOS.map((t) => (
                <option key={t} value={t}>{TAREA_TIPO_LABEL[t]}</option>
              ))}
            </select>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text"
              title={modo === "pendiente" ? "Cuándo está prevista (opcional)" : "Cuándo ocurrió (opcional, por defecto hoy)"}
            />
          </div>

          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder={modo === "pendiente"
              ? "Título (obligatorio)"
              : `Título (opcional, por defecto "${TAREA_TIPO_LABEL[tipo]}")`}
            className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue"
          />

          {modo === "pendiente" ? (
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={2}
              className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
            />
          ) : (
            <textarea
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              placeholder="Notas post-evento: qué pasó, próximos pasos…"
              rows={3}
              className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
            />
          )}

          {error && <p className="text-wr-red text-[11px]">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={reset} className="text-[10px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className="text-[10px] px-2 py-1 rounded bg-wr-blue text-white hover:bg-blue-500 disabled:opacity-40">
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}

      {tareas.length === 0 && !adding ? (
        <p className="text-xs text-wr-hint italic">Sin tareas ni actividad registrada.</p>
      ) : (
        <div className="space-y-2">
          {ordered.map((t) => (
            <TareaCard key={t.id} tarea={t} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function TareaCard({ tarea, onChanged }: { tarea: Tarea; onChanged: () => void }) {
  const [editingResultado, setEditingResultado] = useState(false);
  const [resultadoDraft, setResultadoDraft] = useState(tarea.resultado ?? "");
  const [completing, setCompleting] = useState(false);
  const [resultadoOnComplete, setResultadoOnComplete] = useState("");

  const isMine = !!tarea.autorFinder;

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/portal/tareas/${tarea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onChanged();
    return res.ok;
  };

  const remove = async () => {
    if (!confirm("¿Borrar esta tarea?")) return;
    const res = await fetch(`/api/portal/tareas/${tarea.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  };

  const tipoLabel = TAREA_TIPO_LABEL[tarea.tipo as TareaTipo] ?? tarea.tipo;
  const tipoIcon = TAREA_TIPO_ICON[tarea.tipo as TareaTipo] ?? "·";
  const fechaToShow = tarea.completada
    ? tarea.completadaAt ?? tarea.fechaLimite ?? tarea.createdAt
    : tarea.fechaLimite;

  return (
    <div className={`group p-3 rounded-lg border ${tarea.completada ? "border-wr-border bg-wr-surface2/30" : "border-wr-border bg-wr-surface"}`}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => {
            if (tarea.completada) {
              // Re-abrir: simple toggle, sin resultado.
              patch({ completada: false });
            } else {
              // Completar: si tiene resultado pre-rellenado, marcamos directo;
              // si no, mostramos textarea para rellenarlo en el momento.
              setCompleting(true);
            }
          }}
          aria-label={tarea.completada ? "Marcar como pendiente" : "Marcar como completada"}
          className={`w-3.5 h-3.5 mt-0.5 rounded border flex-shrink-0 transition-colors ${
            tarea.completada ? "bg-wr-green border-wr-green" : "border-wr-border hover:border-wr-blue"
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-wr-hint uppercase tracking-wider">
            <span className="font-semibold">{tipoIcon} {tipoLabel}</span>
            {fechaToShow && <> · {fmtDate(fechaToShow)}</>}
            {tarea.completada && <span className="ml-1 text-wr-green">· Hecho</span>}
          </p>
          <p className={`text-xs mt-0.5 ${tarea.completada ? "text-wr-muted" : "text-wr-text"}`}>
            {tarea.titulo}
          </p>
          {tarea.descripcion && (
            <p className="text-[11px] text-wr-muted mt-0.5">{tarea.descripcion}</p>
          )}

          {/* Resultado / notas post-evento */}
          {(tarea.resultado || tarea.completada) && !completing && (
            <div className="mt-2 border-t border-wr-border/50 pt-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-wr-hint uppercase tracking-wider font-semibold">
                  Resultado / notas post-evento
                </p>
                {isMine && !editingResultado && (
                  <button
                    onClick={() => { setResultadoDraft(tarea.resultado ?? ""); setEditingResultado(true); }}
                    className="text-[10px] text-wr-blue opacity-0 group-hover:opacity-100"
                  >
                    {tarea.resultado ? "Editar" : "Añadir"}
                  </button>
                )}
              </div>
              {editingResultado ? (
                <>
                  <textarea
                    value={resultadoDraft}
                    onChange={(e) => setResultadoDraft(e.target.value)}
                    rows={3}
                    placeholder="Qué pasó, próximos pasos…"
                    className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
                  />
                  <div className="flex justify-end gap-2 mt-1">
                    <button
                      onClick={() => setEditingResultado(false)}
                      className="text-[10px] px-2 py-0.5 rounded bg-wr-surface2 border border-wr-border text-wr-muted"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await patch({ resultado: resultadoDraft || null });
                        if (ok) setEditingResultado(false);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded bg-wr-blue text-white"
                    >
                      Guardar
                    </button>
                  </div>
                </>
              ) : tarea.resultado ? (
                <p className="text-[11px] text-wr-text whitespace-pre-wrap leading-snug">{tarea.resultado}</p>
              ) : (
                <p className="text-[11px] text-wr-hint italic">Sin notas post-evento.</p>
              )}
            </div>
          )}

          {/* Rellenar resultado al completar */}
          {completing && (
            <div className="mt-2 border-t border-wr-border/50 pt-2 space-y-1">
              <p className="text-[10px] text-wr-hint uppercase tracking-wider font-semibold">
                Notas post-evento (opcional)
              </p>
              <textarea
                value={resultadoOnComplete}
                onChange={(e) => setResultadoOnComplete(e.target.value)}
                rows={3}
                placeholder="Qué pasó, próximos pasos…"
                autoFocus
                className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setCompleting(false); setResultadoOnComplete(""); }}
                  className="text-[10px] px-2 py-0.5 rounded bg-wr-surface2 border border-wr-border text-wr-muted"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    const ok = await patch({
                      completada: true,
                      ...(resultadoOnComplete ? { resultado: resultadoOnComplete } : {}),
                    });
                    if (ok) { setCompleting(false); setResultadoOnComplete(""); }
                  }}
                  className="text-[10px] px-2 py-0.5 rounded bg-wr-green text-white"
                >
                  Marcar como hecha
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-wr-hint mt-1">
            {tarea.autorFinder?.name ?? tarea.autor?.name}
            {tarea.autor?.name && !tarea.autorFinder && <span className="ml-1 text-wr-blue">· Fontiber</span>}
          </p>
        </div>
        {isMine && !tarea.completada && (
          <button
            onClick={remove}
            title="Borrar"
            className="opacity-0 group-hover:opacity-60 text-[10px] text-wr-red hover:opacity-100"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function NotasSection({ empresaId, notas, onChanged }: { empresaId: number; notas: Nota[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [contenido, setContenido] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContenido, setEditContenido] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/portal/empresas/${empresaId}/notas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.issues?.map((i: { message: string }) => i.message).join("; ") || json.error || "Error");
        return;
      }
      setContenido(""); setAdding(false); onChanged();
    } catch (e) { setError(String(e)); }
    finally { setSubmitting(false); }
  };

  const startEdit = (n: Nota) => {
    setEditingId(n.id); setEditContenido(n.contenido);
  };
  const saveEdit = async (id: number) => {
    const res = await fetch(`/api/portal/notas/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido: editContenido }),
    });
    if (res.ok) { setEditingId(null); onChanged(); }
  };
  const remove = async (id: number) => {
    if (!confirm("¿Borrar esta nota?")) return;
    const res = await fetch(`/api/portal/notas/${id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  };

  return (
    <section>
      <SectionHeader title="Notas" count={notas.length} onAdd={() => setAdding(true)} adding={adding} />

      {adding && (
        <form onSubmit={submit} className="bg-wr-surface border border-wr-border rounded-lg p-3 space-y-2 mb-3">
          <textarea
            autoFocus value={contenido} onChange={(e) => setContenido(e.target.value)}
            placeholder="Escribe tu nota…" rows={3}
            className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
            required
          />
          {error && <p className="text-wr-red text-[11px]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setContenido(""); setError(null); }}
              className="text-[10px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text">
              Cancelar
            </button>
            <button type="submit" disabled={submitting || !contenido.trim()}
              className="text-[10px] px-2 py-1 rounded bg-wr-blue text-white hover:bg-blue-500 disabled:opacity-40">
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}

      {notas.length === 0 && !adding ? (
        <p className="text-xs text-wr-hint italic">Sin notas visibles.</p>
      ) : (
        <ul className="space-y-2">
          {notas.map((n) => {
            const esFinder = !!n.autorFinder;
            return (
              <li key={n.id} className="group bg-wr-surface border border-wr-border rounded-lg p-3">
                {editingId === n.id ? (
                  <>
                    <textarea value={editContenido} onChange={(e) => setEditContenido(e.target.value)} rows={3}
                      className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setEditingId(null)}
                        className="text-[10px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted">Cancelar</button>
                      <button onClick={() => saveEdit(n.id)} disabled={!editContenido.trim()}
                        className="text-[10px] px-2 py-1 rounded bg-wr-blue text-white disabled:opacity-40">Guardar</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-wr-text whitespace-pre-wrap leading-snug">{n.contenido}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-wr-hint">
                        {n.autorFinder?.name ?? n.autor?.name ?? "—"} · {fmtDate(n.createdAt)}
                        {!esFinder && <span className="ml-1 text-wr-blue">· Fontiber</span>}
                      </p>
                      {esFinder && (
                        <div className="opacity-0 group-hover:opacity-80 flex gap-1">
                          <button onClick={() => startEdit(n)} className="text-[10px] text-wr-blue">Editar</button>
                          <span className="text-wr-hint">·</span>
                          <button onClick={() => remove(n.id)} className="text-[10px] text-wr-red">Borrar</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
