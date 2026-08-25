"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { fmtDate } from "@/lib/format";
import { TAREA_TIPOS, TAREA_TIPO_LABEL, TAREA_TIPO_ICON } from "@/lib/crm";
import type { TareaTipo } from "@/types";
import {
  dispatchDataChanged,
  subscribeDataChanged,
} from "@/lib/data-events";
import { MentionTextarea } from "@/components/MentionTextarea";
import { MentionRender } from "@/components/MentionRender";
import { EmpresaPicker, type EmpresaSearchResult } from "@/components/EmpresaPicker";

const MENTION_ENDPOINT_ADMIN = "/api/menciones/candidatos";

// ─── Tipos compartidos ────────────────────────────────────────────────────

type Autor = { id: string; name: string } | null;

type Nota = {
  id: number;
  contenido: string;
  createdAt: string;
  updatedAt: string;
  parentId: number | null;
  autor: Autor;
  autorFinder?: Autor;
};

/** Nodo del árbol construido a partir de la lista flat. */
type NotaNode = Nota & { respuestas: NotaNode[] };

/**
 * Convierte la lista flat (devuelta por el API en orden createdAt asc) en un
 * árbol. Roots se devuelven en orden DESC (más recientes primero). Respuestas
 * dentro de cada thread quedan ASC (cronológico de conversación).
 */
function buildNotaTree(notas: Nota[]): NotaNode[] {
  const byId = new Map<number, NotaNode>();
  for (const n of notas) byId.set(n.id, { ...n, respuestas: [] });
  const roots: NotaNode[] = [];
  for (const n of notas) {
    const node = byId.get(n.id)!;
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.respuestas.push(node);
    } else {
      // Root o respuesta huérfana (padre fuera de la lista visible) → tratamos como root.
      roots.push(node);
    }
  }
  return roots.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

/** Profundidad máxima donde indentamos visualmente. Más profundo = mismo indent. */
const NOTA_INDENT_MAX = 5;

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

// (HistorialItem y HistorialSection eliminados 2026-05-12. El feed cronológico
// vive ahora en TimelineSection — ver `components/TimelineSection.tsx` y los
// endpoints `/api/.../timeline`. El endpoint legacy `/api/.../historial` sigue
// vivo por compatibilidad mientras se valida la migración; cuando confirmemos
// que ningún cliente lo usa, también se elimina.)

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
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/empresas/${empresaId}/notas`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setNotas)
      .catch(() => setNotas([]));
  }, [empresaId]);

  // Solo carga al abrir (lazy) — evita N requests al montar el panel.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Refresca cuando alguien (chat IA, portal del finder, otra pestaña en
  // el futuro) crea/edita/borra una nota de esta empresa.
  useEffect(() => {
    if (!open) return;
    return subscribeDataChanged(
      { resource: "nota", parent: { resource: "empresa", id: empresaId } },
      () => load()
    );
  }, [open, empresaId, load]);

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
        const created = await res.json().catch(() => null);
        dispatchDataChanged({
          resource: "nota",
          resourceId: created?.id,
          action: "create",
          parent: { resource: "empresa", id: empresaId },
          source: "NotasSection/crear",
        });
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

  async function responder(parentId: number, contenido: string): Promise<boolean> {
    const res = await fetch(`/api/empresas/${empresaId}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contenido, parentId }),
    });
    if (res.ok) {
      const created = await res.json().catch(() => null);
      dispatchDataChanged({
        resource: "nota",
        resourceId: created?.id,
        action: "create",
        parent: { resource: "empresa", id: empresaId },
        source: "NotasSection/responder",
      });
      load();
      return true;
    }
    const msg = await extractError(res);
    console.error("[NotasSection.responder]", msg);
    setError(msg);
    return false;
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
        dispatchDataChanged({
          resource: "nota",
          resourceId: id,
          action: "update",
          parent: { resource: "empresa", id: empresaId },
          source: "NotasSection/guardarEdit",
        });
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
    // Cascade en BD borra respuestas. Avisamos para que no sea sorpresa.
    if (!confirm("¿Borrar esta nota? Si tiene respuestas, también se borrarán.")) return;
    await fetch(`/api/notas/${id}`, { method: "DELETE" });
    dispatchDataChanged({
      resource: "nota",
      resourceId: id,
      action: "delete",
      parent: { resource: "empresa", id: empresaId },
      source: "NotasSection/borrar",
    });
    load();
  }

  const tree = buildNotaTree(notas);

  return (
    <div className="rounded-lg border border-wr-border bg-wr-surface2/40 p-3 space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <p className="text-[9px] font-semibold text-wr-muted uppercase tracking-widest">
          Notas {open && `(${notas.length})`}
        </p>
        <span className="text-base text-wr-muted leading-none">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
      <>
      <div className="space-y-1.5">
        <MentionTextarea
          value={nueva}
          onChange={setNueva}
          candidatesEndpoint={MENTION_ENDPOINT_ADMIN}
          empresaId={empresaId}
          placeholder="Nueva nota interna… (escribe @ para mencionar)"
          rows={2}
          className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue resize-none"
        />
        <button
          onClick={crear}
          disabled={saving || !nueva.trim()}
          className="w-full px-2 py-2 sm:py-1 text-xs rounded bg-wr-blue/15 text-wr-blue border border-wr-blue/30 hover:bg-wr-blue/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Guardando…" : "Añadir nota"}
        </button>
        {error && (
          <p className="text-[10px] text-wr-red bg-wr-red/10 border border-wr-red/30 rounded px-2 py-1">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {tree.length === 0 && (
          <p className="text-[10px] text-wr-hint italic text-center py-2">
            Sin notas
          </p>
        )}
        {tree.map((node) => (
          <NotaItem
            key={node.id}
            empresaId={empresaId}
            node={node}
            depth={0}
            editingId={editing}
            editContent={editContent}
            replyingTo={replyingTo}
            onStartEdit={(n) => { setEditing(n.id); setEditContent(n.contenido); }}
            onCancelEdit={() => setEditing(null)}
            onSaveEdit={guardarEdit}
            onChangeEditContent={setEditContent}
            onStartReply={setReplyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onSubmitReply={async (parentId, contenido) => {
              const ok = await responder(parentId, contenido);
              if (ok) setReplyingTo(null);
              return ok;
            }}
            onBorrar={borrar}
          />
        ))}
      </div>
      </>
      )}
    </div>
  );
}

/**
 * Render recursivo de un nodo del árbol de notas. Indenta visualmente hasta
 * `NOTA_INDENT_MAX` y luego mantiene el indent (evita scroll horizontal en
 * threads muy profundos). Forms de edit/reply son inline.
 */
function NotaItem({
  empresaId,
  node,
  depth,
  editingId,
  editContent,
  replyingTo,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeEditContent,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onBorrar,
}: {
  empresaId: number;
  node: NotaNode;
  depth: number;
  editingId: number | null;
  editContent: string;
  replyingTo: number | null;
  onStartEdit: (n: Nota) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: number) => void;
  onChangeEditContent: (v: string) => void;
  onStartReply: (id: number) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: number, contenido: string) => Promise<boolean>;
  onBorrar: (id: number) => void;
}) {
  const indent = Math.min(depth, NOTA_INDENT_MAX);
  // 8px por nivel — visible sin invadir el contenido.
  const marginLeft = indent * 8;

  return (
    <div style={{ marginLeft }}>
      <div className="bg-wr-surface rounded border border-wr-border p-2 text-xs text-wr-text">
        {editingId === node.id ? (
          <>
            <MentionTextarea
              value={editContent}
              onChange={onChangeEditContent}
              candidatesEndpoint={MENTION_ENDPOINT_ADMIN}
              empresaId={empresaId}
              rows={2}
              className="w-full bg-wr-bg border border-wr-border rounded px-2 py-1 text-xs text-wr-text resize-none mb-1"
            />
            <div className="flex gap-1 justify-end">
              <button onClick={onCancelEdit} className="text-[10px] text-wr-muted hover:text-wr-text">
                Cancelar
              </button>
              <button
                onClick={() => onSaveEdit(node.id)}
                className="text-[10px] text-wr-blue hover:underline"
              >
                Guardar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-wr-text">
              <MentionRender content={node.contenido} />
            </p>
            <div className="flex items-center justify-between mt-1.5 text-[9px] text-wr-hint gap-1.5">
              <span className="flex items-center gap-1.5 flex-wrap">
                {node.autorFinder ? <FinderBadge name={node.autorFinder.name} /> : <span>{node.autor?.name ?? "—"}</span>}
                <span className="text-wr-hint">· {fmtDate(node.createdAt)}</span>
              </span>
              <span className="flex gap-1.5 items-center">
                <button
                  onClick={() => onStartReply(node.id)}
                  className="hover:text-wr-text"
                  title="Responder"
                >
                  Responder
                </button>
                {/* Editar: solo notas de admin. Editar texto literal de un finder lo tergiversaría. */}
                {!node.autorFinder && (
                  <button
                    onClick={() => onStartEdit(node)}
                    className="hover:text-wr-text p-0.5"
                    title="Editar"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => onBorrar(node.id)}
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

      {replyingTo === node.id && (
        <ReplyForm
          empresaId={empresaId}
          onCancel={onCancelReply}
          onSubmit={(c) => onSubmitReply(node.id, c)}
        />
      )}

      {node.respuestas.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {node.respuestas.map((child) => (
            <NotaItem
              key={child.id}
              empresaId={empresaId}
              node={child}
              depth={depth + 1}
              editingId={editingId}
              editContent={editContent}
              replyingTo={replyingTo}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSaveEdit={onSaveEdit}
              onChangeEditContent={onChangeEditContent}
              onStartReply={onStartReply}
              onCancelReply={onCancelReply}
              onSubmitReply={onSubmitReply}
              onBorrar={onBorrar}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Form inline de respuesta. Estado local — no contamina el padre. */
function ReplyForm({
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
    <div className="mt-1.5 ml-2 bg-wr-surface2/60 rounded border border-wr-border p-2">
      <MentionTextarea
        autoFocus
        value={contenido}
        onChange={setContenido}
        candidatesEndpoint={MENTION_ENDPOINT_ADMIN}
        empresaId={empresaId}
        placeholder="Escribe tu respuesta… (escribe @ para mencionar)"
        rows={2}
        className="w-full bg-wr-bg border border-wr-border rounded px-2 py-1 text-xs text-wr-text resize-none"
      />
      <div className="flex gap-1 justify-end mt-1">
        <button
          onClick={onCancel}
          className="text-[10px] text-wr-muted hover:text-wr-text px-2 py-1"
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
          className="text-[10px] text-wr-blue hover:underline px-2 py-1 disabled:opacity-40"
        >
          {submitting ? "Enviando…" : "Responder"}
        </button>
      </div>
    </div>
  );
}

// ─── Sección TAREAS ───────────────────────────────────────────────────────

type User = { id: string; name: string; email: string };

/**
 * Finder asignado al target — opcional. Si se pasa, aparece como opción del
 * dropdown "Asignar a…" además de los admins. La asignación es mutex (admin
 * O finder, no ambos): el endpoint setea `asignadoId` o `asignadoFinderId`
 * en función de qué se eligió. El selector usa prefijo `f:<id>` para
 * distinguir finder de admin sin colisionar con IDs de usuarios.
 */
const FINDER_PREFIX = "f:";

export function TareasSection({
  empresaId,
  finderAsignado,
}: {
  empresaId: number;
  finderAsignado?: { id: string; name: string } | null;
}) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [incluirCompletadas, setIncluirCompletadas] = useState(false);
  const [tipo, setTipo] = useState<TareaTipo>("llamada");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  // null = el usuario no ha tocado el selector → vale el default (él mismo).
  // "" = eligió "Sin asignar" a propósito. Distinguirlos evita que un efecto
  // le devuelva el default encima de una elección explícita.
  const [asignadoId, setAsignadoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTipo, setEditTipo] = useState<TareaTipo>("llamada");
  const [editTitulo, setEditTitulo] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editFechaLimite, setEditFechaLimite] = useState("");
  const [editAsignadoId, setEditAsignadoId] = useState("");
  // Mover la tarea a otra ficha. Es raro, así que va plegado tras un enlace:
  // `moviendoEmpresa` abre el buscador, `editEmpresaDestino` guarda la elegida.
  const [moviendoEmpresa, setMoviendoEmpresa] = useState(false);
  const [editEmpresaDestino, setEditEmpresaDestino] = useState<EmpresaSearchResult | null>(null);
  const [open, setOpen] = useState(false);

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

  // Solo carga al abrir (lazy) — evita N requests al montar el panel.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Escucha el bus global. Refresca solo si la sección está abierta y
  // el evento es una tarea bajo ESTA empresa. Si está cerrada, no hace
  // falta — el próximo open ya dispara `load()` con datos frescos.
  useEffect(() => {
    if (!open) return;
    return subscribeDataChanged(
      { resource: "tarea", parent: { resource: "empresa", id: empresaId } },
      () => load()
    );
  }, [open, empresaId, load]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/users?role=admin", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setUsers(data))
      .catch(() => setUsers([]));
  }, [open]);

  // Una tarea nueva se asigna por defecto a quien la crea. Sin esto nacía sin
  // responsable y el digest diario no la mostraba nunca (el email solo lista
  // tareas con responsable), así que vencía en silencio. La sesión no lleva el
  // id del User, así que lo resolvemos por email — es único en la tabla.
  const { data: session } = useSession();
  const miUserId = useMemo(
    () => users.find((u) => u.email === session?.user?.email)?.id ?? "",
    [users, session?.user?.email]
  );
  const asignadoValue = asignadoId ?? miUserId;

  // Helper para parsear el valor del select unificado admin/finder.
  // "" = sin asignar; "f:<id>" = finder; "<id>" = admin user.
  const parseAsignado = (v: string): { asignadoId: string | null; asignadoFinderId: string | null } => {
    if (!v) return { asignadoId: null, asignadoFinderId: null };
    if (v.startsWith(FINDER_PREFIX)) return { asignadoId: null, asignadoFinderId: v.slice(FINDER_PREFIX.length) };
    return { asignadoId: v, asignadoFinderId: null };
  };

  async function crear() {
    if (!titulo.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { asignadoId: aId, asignadoFinderId: afId } = parseAsignado(asignadoValue);
      const res = await fetch(`/api/empresas/${empresaId}/tareas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          titulo,
          descripcion: descripcion.trim() || null,
          fechaLimite: fechaLimite || null,
          asignadoId: aId,
          asignadoFinderId: afId,
        }),
      });
      if (res.ok) {
        const created = await res.json().catch(() => null);
        setTitulo("");
        setDescripcion("");
        setFechaLimite("");
        setAsignadoId(null);
        setTipo("llamada");
        dispatchDataChanged({
          resource: "tarea",
          resourceId: created?.id,
          action: "create",
          parent: { resource: "empresa", id: empresaId },
          source: "TareasSection/crear",
        });
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
    // Si la tarea está asignada a un finder, prefijamos `f:` para que el
    // select unificado lo seleccione correctamente.
    setEditAsignadoId(
      t.asignadoFinder?.id
        ? `${FINDER_PREFIX}${t.asignadoFinder.id}`
        : t.asignado?.id ?? ""
    );
    cerrarMover();
  }

  /** Deja el bloque "mover a otra empresa" plegado y sin destino elegido. */
  function cerrarMover() {
    setMoviendoEmpresa(false);
    setEditEmpresaDestino(null);
  }

  async function guardarEdit() {
    if (editingId == null || !editTitulo.trim()) return;
    setError(null);
    try {
      const { asignadoId: aId, asignadoFinderId: afId } = parseAsignado(editAsignadoId);
      const destino = editEmpresaDestino;
      const res = await fetch(`/api/tareas/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: editTipo,
          titulo: editTitulo,
          descripcion: editDescripcion.trim() || null,
          fechaLimite: editFechaLimite || null,
          asignadoId: aId,
          asignadoFinderId: afId,
          ...(destino ? { empresaId: destino.id } : {}),
        }),
      });
      if (res.ok) {
        const id = editingId;
        setEditingId(null);
        cerrarMover();
        dispatchDataChanged({
          resource: "tarea",
          resourceId: id ?? undefined,
          action: "update",
          parent: { resource: "empresa", id: empresaId },
          source: "TareasSection/guardarEdit",
        });
        // Si se ha movido, la ficha destino también cambia: avisamos a la suya
        // para que su lista no se quede sin la tarea recién llegada.
        if (destino) {
          dispatchDataChanged({
            resource: "tarea",
            resourceId: id ?? undefined,
            action: "create",
            parent: { resource: "empresa", id: destino.id },
            source: "TareasSection/moverEmpresa",
          });
        }
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
      dispatchDataChanged({
        resource: "tarea",
        resourceId: t.id,
        action: "update",
        parent: { resource: "empresa", id: empresaId },
        source: "TareasSection/toggleCompletada",
      });
      load();
    } catch (err) {
      console.error("[TareasSection.toggleCompletada] network", err);
      setError("Error de red");
    }
  }

  async function borrar(id: number) {
    if (!confirm("¿Borrar esta tarea?")) return;
    await fetch(`/api/tareas/${id}`, { method: "DELETE" });
    dispatchDataChanged({
      resource: "tarea",
      resourceId: id,
      action: "delete",
      parent: { resource: "empresa", id: empresaId },
      source: "TareasSection/borrar",
    });
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
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center justify-between"
        >
          <p className="text-[9px] font-semibold text-wr-muted uppercase tracking-widest">
            Tareas {open && `(${pendientes} pendientes)`}
          </p>
          <span className="text-base text-wr-muted leading-none mr-2">{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <button
            onClick={() => setIncluirCompletadas((v) => !v)}
            className="text-[10px] text-wr-hint hover:text-wr-text"
          >
            {incluirCompletadas ? "Ocultar hechas" : "Ver hechas"}
          </button>
        )}
      </div>

      {open && (
      <>
      <div className="space-y-1.5">
        {/* En mobile los 3 selects (tipo/fecha/asignado) van apilados — 3 cols
            con select de fecha + nombre asignado no caben legibles en <sm. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
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
            value={asignadoValue}
            onChange={(e) => setAsignadoId(e.target.value)}
            className="bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text focus:outline-none focus:border-wr-blue cursor-pointer"
          >
            <option value="">Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
            {finderAsignado && (
              <option value={`${FINDER_PREFIX}${finderAsignado.id}`}>
                Finder: {finderAsignado.name}
              </option>
            )}
          </select>
        </div>
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título de la tarea…"
          className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue"
        />
        <MentionTextarea
          value={descripcion}
          onChange={setDescripcion}
          candidatesEndpoint={MENTION_ENDPOINT_ADMIN}
          empresaId={empresaId}
          placeholder="Descripción (opcional, escribe @ para mencionar)…"
          rows={2}
          className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1.5 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue resize-none"
        />
        <button
          onClick={crear}
          disabled={saving || !titulo.trim()}
          className="w-full px-2 py-2 sm:py-1 text-xs rounded bg-wr-blue/15 text-wr-blue border border-wr-blue/30 hover:bg-wr-blue/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                      {finderAsignado && (
                        <option value={`${FINDER_PREFIX}${finderAsignado.id}`}>
                          Finder: {finderAsignado.name}
                        </option>
                      )}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={editTitulo}
                    onChange={(e) => setEditTitulo(e.target.value)}
                    className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1 text-xs text-wr-text focus:outline-none focus:border-wr-blue"
                  />
                  <MentionTextarea
                    value={editDescripcion}
                    onChange={setEditDescripcion}
                    candidatesEndpoint={MENTION_ENDPOINT_ADMIN}
                    empresaId={empresaId}
                    rows={2}
                    placeholder="Descripción (opcional, escribe @ para mencionar)…"
                    className="w-full bg-wr-bg border border-wr-border rounded-md px-2 py-1 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue resize-none"
                  />

                  {/* Mover a otra ficha. Plegado por defecto: se usa poco y no
                      debe estorbar al caso normal de editar título o fecha. */}
                  <div className="text-[10px]">
                    {editEmpresaDestino ? (
                      <div className="rounded border border-wr-amber/30 bg-wr-amber/5 px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-wr-muted flex-shrink-0">Mover a</span>
                          <span className="text-wr-text font-medium truncate">
                            {editEmpresaDestino.nombre}
                          </span>
                          <button
                            onClick={cerrarMover}
                            className="ml-auto flex-shrink-0 text-wr-muted hover:text-wr-text"
                          >
                            Quitar
                          </button>
                        </div>
                        {editAsignadoId.startsWith(FINDER_PREFIX) && (
                          <p className="mt-1 text-wr-amber">
                            Al moverla se quedará sin finder asignado: solo puede
                            tener tareas de sus propios targets.
                          </p>
                        )}
                        <p className="mt-1 text-wr-hint">Se aplica al guardar.</p>
                      </div>
                    ) : moviendoEmpresa ? (
                      <div className="space-y-1">
                        <EmpresaPicker
                          onSelect={setEditEmpresaDestino}
                          excludeId={empresaId}
                          autoFocus
                          placeholder="Empresa destino, por nombre o CIF…"
                          maxHeightClass="max-h-40"
                        />
                        <button
                          onClick={cerrarMover}
                          className="text-wr-muted hover:text-wr-text"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setMoviendoEmpresa(true)}
                        className="text-wr-muted hover:text-wr-blue"
                      >
                        Mover a otra empresa…
                      </button>
                    )}
                  </div>

                  <div className="flex gap-1 justify-end text-[10px]">
                    <button
                      onClick={() => { setEditingId(null); cerrarMover(); }}
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
                      <MentionRender content={t.titulo} />
                    </p>
                    {t.descripcion && (
                      <p className="text-[10px] text-wr-muted whitespace-pre-wrap mt-0.5">
                        <MentionRender content={t.descripcion} />
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
      </>
      )}
    </div>
  );
}

// ─── (HistorialSection eliminada 2026-05-12) ──────────────────────────────
//
// El feed cronológico unificado vive ahora en `components/TimelineSection.tsx`
// a nivel del PanelEmpresa (no dentro del CrmBlock). Razón: aplica también a
// empresas sin CRM (BORME, emails ingestados, etc.). El endpoint legacy
// `/api/empresas/[id]/historial` queda DEPRECATED — el cliente nuevo usa
// `/api/empresas/[id]/timeline`. Si nadie más lo invoca, eliminar también
// el endpoint en una limpieza posterior.
