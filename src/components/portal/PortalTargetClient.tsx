"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";
import {
  DEAL_STAGE_LABEL,
  DEAL_STAGE_PILL_CLASS,
  TAREA_TIPOS,
  TAREA_TIPO_LABEL,
  TAREA_TIPO_ICON,
} from "@/lib/crm";
import type { DealStage, TareaTipo } from "@/types";
import { MentionTextarea } from "@/components/MentionTextarea";
import { MentionRender } from "@/components/MentionRender";
import NotificationsBell from "@/components/NotificationsBell";
import { TimelineSection } from "@/components/TimelineSection";

const MENTION_ENDPOINT_PORTAL = "/api/portal/menciones/candidatos";
const NOTIFICATIONS_ENDPOINT_PORTAL = "/api/portal/notificaciones";

type Nota = {
  id: number;
  contenido: string;
  createdAt: string;
  parentId: number | null;
  autor?: { name: string } | null;
  autorFinder?: { name: string } | null;
};

type NotaNode = Nota & { respuestas: NotaNode[] };

/** Roots desc, respuestas asc dentro de cada thread. Mismo patrón que admin. */
function buildNotaTree(notas: Nota[]): NotaNode[] {
  const byId = new Map<number, NotaNode>();
  for (const n of notas) byId.set(n.id, { ...n, respuestas: [] });
  const roots: NotaNode[] = [];
  for (const n of notas) {
    const node = byId.get(n.id)!;
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.respuestas.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

const NOTA_INDENT_MAX = 5;
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
  asignado?: { id: string; name: string } | null;
  asignadoFinder?: { id: string; name: string } | null;
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
  finderId,
}: {
  empresaId: number;
  finderName: string;
  finderId: string;
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

  return (
    <div className="min-h-screen flex flex-col bg-wr-bg">
      <header className="h-12 flex-shrink-0 flex items-center px-3 sm:px-5 gap-3 border-b border-wr-border bg-wr-surface">
        <button
          onClick={() => router.push("/portal")}
          className="text-[11px] text-wr-muted hover:text-wr-text flex items-center gap-1"
        >
          ← Pipeline
        </button>
        <div className="flex-1" />
        <NotificationsBell endpoint={NOTIFICATIONS_ENDPOINT_PORTAL} />
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
          <div className="max-w-3xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
            {/* Header target */}
            <div className="flex items-start gap-3 sm:gap-4">
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
                  {stage && (
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${DEAL_STAGE_PILL_CLASS[stage]}`}>
                      {DEAL_STAGE_LABEL[stage]}
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

            <TareasSection
              empresaId={empresaId}
              tareas={target.tareas}
              finderId={finderId}
              onChanged={load}
            />
            <NotasSection empresaId={empresaId} notas={target.notas} onChanged={load} />

            {/* Timeline — feed cronológico unificado (incluye BORME, emails, calendar). */}
            <TimelineSection
              empresaId={empresaId}
              endpoint={`/api/portal/empresas/${empresaId}/timeline`}
              seenEndpoint={`/api/portal/empresas/${empresaId}/seen`}
            />
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
function TareasSection({
  empresaId,
  tareas,
  finderId,
  onChanged,
}: {
  empresaId: number;
  tareas: Tarea[];
  finderId: string;
  onChanged: () => void;
}) {
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
            <MentionTextarea
              value={descripcion}
              onChange={setDescripcion}
              candidatesEndpoint={MENTION_ENDPOINT_PORTAL}
              empresaId={empresaId}
              placeholder="Descripción (opcional, escribe @ para mencionar)"
              rows={2}
              className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
            />
          ) : (
            <MentionTextarea
              value={resultado}
              onChange={setResultado}
              candidatesEndpoint={MENTION_ENDPOINT_PORTAL}
              empresaId={empresaId}
              placeholder="Notas post-evento: qué pasó, próximos pasos… (escribe @ para mencionar)"
              rows={3}
              className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
            />
          )}

          {error && <p className="text-wr-red text-[11px]">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={reset} className="text-[10px] px-3 py-2 sm:py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className="text-[10px] px-3 py-2 sm:py-1 rounded bg-wr-blue text-white hover:bg-blue-500 disabled:opacity-40">
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
            <TareaCard key={t.id} tarea={t} empresaId={empresaId} finderId={finderId} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

function TareaCard({
  tarea,
  empresaId,
  finderId,
  onChanged,
}: {
  tarea: Tarea;
  empresaId: number;
  finderId: string;
  onChanged: () => void;
}) {
  const [editingResultado, setEditingResultado] = useState(false);
  const [resultadoDraft, setResultadoDraft] = useState(tarea.resultado ?? "");
  const [completing, setCompleting] = useState(false);
  const [resultadoOnComplete, setResultadoOnComplete] = useState("");
  // Edición del cuerpo de la tarea (texto/fecha/tipo). Solo el autor finder y
  // solo si NO está completada — mismas reglas que aplica el backend.
  const [editing, setEditing] = useState(false);
  const [editTipo, setEditTipo] = useState<TareaTipo>(tarea.tipo as TareaTipo);
  const [editTitulo, setEditTitulo] = useState(tarea.titulo);
  const [editDescripcion, setEditDescripcion] = useState(tarea.descripcion ?? "");
  const [editFecha, setEditFecha] = useState(tarea.fechaLimite?.slice(0, 10) ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // "Mía" = el finder logueado es el autor (puede editar texto/fecha/borrar).
  // El asignado-pero-no-autor solo puede toggle completada (lo permite el
  // endpoint PATCH portal/tareas/[id]).
  const isMine = !!tarea.autorFinder;
  const isAssignedToMe = tarea.asignadoFinder?.id === finderId;
  const canToggleCompletada = isMine || isAssignedToMe;

  // Etiqueta de origen / asignación. Si la tarea es de un admin, lo
  // explicitamos. Si es de un finder y está asignada al admin, también.
  const autorLabel = tarea.autorFinder?.name ?? tarea.autor?.name ?? null;
  const asignadoLabel = tarea.asignadoFinder?.name ?? tarea.asignado?.name ?? null;
  const autorIsAdmin = !!tarea.autor && !tarea.autorFinder;
  const ownershipBadge: { text: string; tone: "you" | "admin" | "neutral" } | null = (() => {
    if (isAssignedToMe && autorIsAdmin) return { text: `${autorLabel} → tú`, tone: "you" };
    if (isMine && tarea.asignado) return { text: `Tú → ${tarea.asignado.name}`, tone: "neutral" };
    if (autorIsAdmin) {
      if (asignadoLabel && asignadoLabel !== autorLabel) {
        return { text: `${autorLabel} → ${asignadoLabel}`, tone: "admin" };
      }
      return { text: `Tarea de ${autorLabel}`, tone: "admin" };
    }
    return null;
  })();

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

  const startEdit = () => {
    setEditTipo(tarea.tipo as TareaTipo);
    setEditTitulo(tarea.titulo);
    setEditDescripcion(tarea.descripcion ?? "");
    setEditFecha(tarea.fechaLimite?.slice(0, 10) ?? "");
    setEditError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitulo.trim()) {
      setEditError("El título es obligatorio.");
      return;
    }
    setEditSubmitting(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/portal/tareas/${tarea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: editTipo,
          titulo: editTitulo.trim(),
          descripcion: editDescripcion || null,
          fechaLimite: editFecha ? new Date(editFecha).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setEditError(
          json.issues?.map((i: { message: string }) => i.message).join("; ") ||
          json.error ||
          "Error"
        );
        return;
      }
      setEditing(false);
      onChanged();
    } catch (err) {
      setEditError(String(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  const tipoLabel = TAREA_TIPO_LABEL[tarea.tipo as TareaTipo] ?? tarea.tipo;
  const tipoIcon = TAREA_TIPO_ICON[tarea.tipo as TareaTipo] ?? "·";
  const fechaToShow = tarea.completada
    ? tarea.completadaAt ?? tarea.fechaLimite ?? tarea.createdAt
    : tarea.fechaLimite;

  if (editing) {
    return (
      <div className="p-3 rounded-lg border border-wr-blue/40 bg-wr-surface">
        <form onSubmit={saveEdit} className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={editTipo}
              onChange={(e) => setEditTipo(e.target.value as TareaTipo)}
              className="bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text"
            >
              {TAREA_TIPOS.map((t) => (
                <option key={t} value={t}>{TAREA_TIPO_LABEL[t]}</option>
              ))}
            </select>
            <input
              type="date"
              value={editFecha}
              onChange={(e) => setEditFecha(e.target.value)}
              className="bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text"
            />
          </div>
          <input
            value={editTitulo}
            onChange={(e) => setEditTitulo(e.target.value)}
            placeholder="Título"
            className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue"
          />
          <MentionTextarea
            value={editDescripcion}
            onChange={setEditDescripcion}
            candidatesEndpoint={MENTION_ENDPOINT_PORTAL}
            empresaId={empresaId}
            placeholder="Descripción (opcional, escribe @ para mencionar)"
            rows={2}
            className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
          />
          {editError && <p className="text-wr-red text-[11px]">{editError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancelEdit}
              className="text-[10px] px-3 py-2 sm:py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={editSubmitting}
              className="text-[10px] px-3 py-2 sm:py-1 rounded bg-wr-blue text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {editSubmitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={`group p-3 rounded-lg border ${tarea.completada ? "border-wr-border bg-wr-surface2/30" : "border-wr-border bg-wr-surface"}`}>
      <div className="flex items-start gap-2">
        {canToggleCompletada ? (
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
        ) : (
          // Tarea de admin asignada a otro admin: el finder solo la ve, no la
          // toggle. Marcamos visualmente con un check fantasma para que se vea
          // que es read-only.
          <span
            aria-label={tarea.completada ? "Completada" : "Pendiente"}
            title="Tarea de admin (read-only para ti)"
            className={`w-3.5 h-3.5 mt-0.5 rounded border flex-shrink-0 ${
              tarea.completada ? "bg-wr-muted/30 border-wr-muted/40" : "border-wr-border opacity-50"
            }`}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-wr-hint uppercase tracking-wider">
            <span className="font-semibold">{tipoIcon} {tipoLabel}</span>
            {fechaToShow && <> · {fmtDate(fechaToShow)}</>}
            {tarea.completada && <span className="ml-1 text-wr-green">· Hecho</span>}
            {ownershipBadge && (
              <span
                className={`ml-1.5 inline-flex items-center px-1.5 rounded text-[9px] ${
                  ownershipBadge.tone === "you"
                    ? "bg-wr-blue/15 text-wr-blue border border-wr-blue/30"
                    : ownershipBadge.tone === "admin"
                    ? "bg-wr-amber/10 text-wr-amber border border-wr-amber/30"
                    : "bg-wr-surface2 text-wr-muted border border-wr-border"
                }`}
              >
                {ownershipBadge.text}
              </span>
            )}
          </p>
          <p className={`text-xs mt-0.5 ${tarea.completada ? "text-wr-muted" : "text-wr-text"}`}>
            <MentionRender content={tarea.titulo} />
          </p>
          {tarea.descripcion && (
            <p className="text-[11px] text-wr-muted mt-0.5">
              <MentionRender content={tarea.descripcion} />
            </p>
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
                  <MentionTextarea
                    value={resultadoDraft}
                    onChange={setResultadoDraft}
                    candidatesEndpoint={MENTION_ENDPOINT_PORTAL}
                    empresaId={empresaId}
                    rows={3}
                    placeholder="Qué pasó, próximos pasos… (escribe @ para mencionar)"
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
                <p className="text-[11px] text-wr-text whitespace-pre-wrap leading-snug">
                  <MentionRender content={tarea.resultado} />
                </p>
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
              <MentionTextarea
                value={resultadoOnComplete}
                onChange={setResultadoOnComplete}
                candidatesEndpoint={MENTION_ENDPOINT_PORTAL}
                empresaId={empresaId}
                rows={3}
                placeholder="Qué pasó, próximos pasos… (escribe @ para mencionar)"
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
          <div className="opacity-0 group-hover:opacity-80 flex gap-1 flex-shrink-0">
            <button
              onClick={startEdit}
              title="Editar"
              className="text-wr-hint hover:text-wr-text p-0.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              onClick={remove}
              title="Borrar"
              className="text-wr-hint hover:text-wr-red p-0.5"
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
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

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

  const responder = async (parentId: number, contenido: string): Promise<boolean> => {
    const res = await fetch(`/api/portal/empresas/${empresaId}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido, parentId }),
    });
    if (res.ok) { onChanged(); return true; }
    return false;
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
    if (!confirm("¿Borrar esta nota? Si tiene respuestas, también se borrarán.")) return;
    const res = await fetch(`/api/portal/notas/${id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  };

  const tree = buildNotaTree(notas);

  return (
    <section>
      <SectionHeader title="Notas" count={notas.length} onAdd={() => setAdding(true)} adding={adding} />

      {adding && (
        <form onSubmit={submit} className="bg-wr-surface border border-wr-border rounded-lg p-3 space-y-2 mb-3">
          <MentionTextarea
            autoFocus value={contenido} onChange={setContenido}
            candidatesEndpoint={MENTION_ENDPOINT_PORTAL}
            empresaId={empresaId}
            placeholder="Escribe tu nota… (escribe @ para mencionar)" rows={3}
            className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
            required
          />
          {error && <p className="text-wr-red text-[11px]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setContenido(""); setError(null); }}
              className="text-[10px] px-3 py-2 sm:py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text">
              Cancelar
            </button>
            <button type="submit" disabled={submitting || !contenido.trim()}
              className="text-[10px] px-3 py-2 sm:py-1 rounded bg-wr-blue text-white hover:bg-blue-500 disabled:opacity-40">
              {submitting ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      )}

      {tree.length === 0 && !adding ? (
        <p className="text-xs text-wr-hint italic">Sin notas visibles.</p>
      ) : (
        <ul className="space-y-2">
          {tree.map((node) => (
            <PortalNotaItem
              key={node.id}
              empresaId={empresaId}
              node={node}
              depth={0}
              editingId={editingId}
              editContenido={editContenido}
              replyingTo={replyingTo}
              onStartEdit={startEdit}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={saveEdit}
              onChangeEditContenido={setEditContenido}
              onStartReply={setReplyingTo}
              onCancelReply={() => setReplyingTo(null)}
              onSubmitReply={async (parentId, c) => {
                const ok = await responder(parentId, c);
                if (ok) setReplyingTo(null);
                return ok;
              }}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Render recursivo en el portal del finder. Permisos: el finder puede editar
 * y borrar SOLO sus propias notas (autor finder). Las de admin (visibles)
 * son read-only para él, pero puede responderlas.
 */
function PortalNotaItem({
  empresaId,
  node,
  depth,
  editingId,
  editContenido,
  replyingTo,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeEditContenido,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onRemove,
}: {
  empresaId: number;
  node: NotaNode;
  depth: number;
  editingId: number | null;
  editContenido: string;
  replyingTo: number | null;
  onStartEdit: (n: Nota) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: number) => void;
  onChangeEditContenido: (v: string) => void;
  onStartReply: (id: number) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: number, contenido: string) => Promise<boolean>;
  onRemove: (id: number) => void;
}) {
  const esFinder = !!node.autorFinder;
  const indent = Math.min(depth, NOTA_INDENT_MAX);
  const marginLeft = indent * 12;

  return (
    <li style={{ marginLeft }} className="group bg-wr-surface border border-wr-border rounded-lg p-3">
      {editingId === node.id ? (
        <>
          <MentionTextarea
            value={editContenido}
            onChange={onChangeEditContenido}
            candidatesEndpoint={MENTION_ENDPOINT_PORTAL}
            empresaId={empresaId}
            rows={3}
            className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={onCancelEdit}
              className="text-[10px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted">Cancelar</button>
            <button onClick={() => onSaveEdit(node.id)} disabled={!editContenido.trim()}
              className="text-[10px] px-2 py-1 rounded bg-wr-blue text-white disabled:opacity-40">Guardar</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-wr-text whitespace-pre-wrap leading-snug">
            <MentionRender content={node.contenido} />
          </p>
          <div className="flex items-center justify-between mt-1 gap-2">
            <p className="text-[10px] text-wr-hint">
              {node.autorFinder?.name ?? node.autor?.name ?? "—"} · {fmtDate(node.createdAt)}
              {!esFinder && <span className="ml-1 text-wr-blue">· Fontiber</span>}
            </p>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => onStartReply(node.id)}
                className="text-[10px] text-wr-blue hover:underline"
              >
                Responder
              </button>
              {esFinder && (
                <>
                  <span className="text-wr-hint opacity-0 group-hover:opacity-80">·</span>
                  <button
                    onClick={() => onStartEdit(node)}
                    className="text-[10px] text-wr-blue opacity-0 group-hover:opacity-80"
                  >
                    Editar
                  </button>
                  <span className="text-wr-hint opacity-0 group-hover:opacity-80">·</span>
                  <button
                    onClick={() => onRemove(node.id)}
                    className="text-[10px] text-wr-red opacity-0 group-hover:opacity-80"
                  >
                    Borrar
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {replyingTo === node.id && (
        <PortalReplyForm
          empresaId={empresaId}
          onCancel={onCancelReply}
          onSubmit={(c) => onSubmitReply(node.id, c)}
        />
      )}

      {node.respuestas.length > 0 && (
        <ul className="mt-2 space-y-2">
          {node.respuestas.map((child) => (
            <PortalNotaItem
              key={child.id}
              empresaId={empresaId}
              node={child}
              depth={depth + 1}
              editingId={editingId}
              editContenido={editContenido}
              replyingTo={replyingTo}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSaveEdit={onSaveEdit}
              onChangeEditContenido={onChangeEditContenido}
              onStartReply={onStartReply}
              onCancelReply={onCancelReply}
              onSubmitReply={onSubmitReply}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function PortalReplyForm({
  empresaId,
  onCancel,
  onSubmit,
}: {
  empresaId: number;
  onCancel: () => void;
  onSubmit: (contenido: string) => Promise<boolean>;
}) {
  const [contenido, setContenido] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="mt-2 bg-wr-surface2/60 rounded border border-wr-border p-2">
      <MentionTextarea
        autoFocus
        value={contenido}
        onChange={setContenido}
        candidatesEndpoint={MENTION_ENDPOINT_PORTAL}
        empresaId={empresaId}
        placeholder="Escribe tu respuesta… (escribe @ para mencionar)"
        rows={2}
        className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text resize-none"
      />
      <div className="flex justify-end gap-2 mt-2">
        <button
          onClick={onCancel}
          className="text-[10px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted"
        >
          Cancelar
        </button>
        <button
          onClick={async () => {
            if (!contenido.trim() || submitting) return;
            setSubmitting(true);
            const ok = await onSubmit(contenido);
            setSubmitting(false);
            if (ok) setContenido("");
          }}
          disabled={!contenido.trim() || submitting}
          className="text-[10px] px-2 py-1 rounded bg-wr-blue text-white disabled:opacity-40"
        >
          {submitting ? "Enviando…" : "Responder"}
        </button>
      </div>
    </div>
  );
}
