"use client";

/**
 * Feed cronológico unificado por empresa.
 *
 * Combina en una sola lista (vía `/api/.../timeline`):
 *   - Notas + respuestas (categoría "conversación")
 *   - Tareas completadas (categoría "actividad")
 *   - Cambios de stage (categoría "pipeline")
 *   - Señales BORME (categoría "señales")
 *
 * UX:
 *   - Filtros por chips de categoría (multi-select, default todo ON).
 *   - Agrupación por día con header relativo ("Hoy", "Ayer", "Lunes 11 may", "Mayo 2026").
 *   - Cursor "── N nuevas desde tu última visita ──" entre eventos
 *     `fecha > lastSeenAt` y resto.
 *   - Densidad mixta: cards completas para notas/tareas/BORME, líneas
 *     compactas para cambios de stage.
 *
 * Reuso admin/portal: el caller pasa `endpoint` y `seenEndpoint` distintos
 * (portal usa `/api/portal/...`). El componente no sabe de sesiones.
 *
 * Cursor de "leído hasta":
 *   - Se envía POST a `seenEndpoint` cuando el componente se desmonta o el
 *     usuario pulsa "marcar todo como leído".
 *   - Se persiste el `lastSeenAt` recibido del servidor para pintar la línea
 *     consistentemente entre montajes.
 *
 * Limitaciones conocidas:
 *   - No agrupa ráfagas del mismo actor (≤30min) — apuntado para v2.
 *   - Sin search ni filtros por autor — apuntado para v2.
 *   - Sin paginación (todo el feed se carga). Un deal típico ronda 20-100
 *     eventos; si crece, paginar por fecha cursor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtDate } from "@/lib/format";
import { MentionRender } from "@/components/MentionRender";
import {
  TAREA_TIPO_LABEL,
  TAREA_TIPO_ICON,
  DEAL_STAGE_LABEL,
} from "@/lib/crm";
import { getBormeTipo } from "@/lib/borme-constants";
import type {
  TimelineEvent,
  TimelineCategory,
} from "@/lib/timeline-types";
import { categoryForKind } from "@/lib/timeline-types";
import type { TareaTipo, DealStage } from "@/types";

type Props = {
  empresaId: number;
  /** GET endpoint que devuelve `{ events, lastSeenAt }`. */
  endpoint?: string;
  /** POST endpoint para actualizar el cursor leído. */
  seenEndpoint?: string;
};

type ApiResponse = {
  events: TimelineEvent[];
  lastSeenAt: string | null;
};

const CATEGORY_LABEL: Record<TimelineCategory, string> = {
  conversacion: "Conversación",
  actividad: "Actividad",
  pipeline: "Pipeline",
  senales: "Señales",
  sistema: "Sistema",
};

const DEFAULT_CATEGORIES: TimelineCategory[] = [
  "conversacion",
  "actividad",
  "pipeline",
  "senales",
];

export function TimelineSection({
  empresaId,
  endpoint = `/api/empresas/${empresaId}/timeline`,
  seenEndpoint = `/api/empresas/${empresaId}/seen`,
}: Props) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<TimelineCategory>>(
    new Set(DEFAULT_CATEGORIES)
  );
  // El cursor que GUARDAREMOS en el server al cerrar/desmontar. Empieza como
  // la fecha del primer fetch — si hay eventos nuevos después, se actualiza.
  const seenToPersist = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: ApiResponse = await res.json();
      setEvents(data.events);
      setLastSeenAt(data.lastSeenAt);
      // El cursor a guardar al desmontar = la fecha del último evento visto
      // (el más reciente). Si no hay eventos, mantenemos el lastSeenAt previo.
      if (data.events.length > 0) {
        seenToPersist.current = data.events[0].fecha;
      } else if (data.lastSeenAt) {
        seenToPersist.current = data.lastSeenAt;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Al desmontar (cerrar el panel), persistir el cursor. fire-and-forget.
  useEffect(() => {
    return () => {
      const cursor = seenToPersist.current;
      if (!cursor) return;
      // navigator.sendBeacon sería ideal aquí (sobrevive a navigation), pero
      // el POST con JSON es suficiente para nuestro caso.
      fetch(seenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastSeenAt: cursor }),
        keepalive: true,
      }).catch(() => {
        // silencioso: si falla, la próxima visita verá "N nuevas" extra
      });
    };
  }, [seenEndpoint]);

  const filteredEvents = useMemo(
    () =>
      events.filter((e) => activeCategories.has(categoryForKind(e.kind))),
    [events, activeCategories]
  );

  const totalCount = events.length;
  const visibleCount = filteredEvents.length;
  const newCount = useMemo(() => {
    if (!lastSeenAt) return 0;
    const cursor = new Date(lastSeenAt).getTime();
    return filteredEvents.filter((e) => new Date(e.fecha).getTime() > cursor).length;
  }, [filteredEvents, lastSeenAt]);

  // Conteos por categoría — para que los chips muestren `(N)`.
  const countsByCategory = useMemo(() => {
    const acc: Record<TimelineCategory, number> = {
      conversacion: 0,
      actividad: 0,
      pipeline: 0,
      senales: 0,
      sistema: 0,
    };
    for (const e of events) acc[categoryForKind(e.kind)]++;
    return acc;
  }, [events]);

  const toggleCategory = (c: TimelineCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  // Agrupación por día. Usamos `YYYY-MM-DD` local del usuario como key.
  const grouped = useMemo(() => groupByDay(filteredEvents), [filteredEvents]);

  return (
    <div className="rounded-lg border border-wr-border bg-wr-surface2/40 p-3 space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <p className="text-[9px] font-semibold text-wr-muted uppercase tracking-widest flex items-center gap-2">
          Timeline
          {open && (
            <span className="text-wr-hint normal-case font-normal tracking-normal">
              ({visibleCount}
              {visibleCount !== totalCount && ` de ${totalCount}`}
              {newCount > 0 && (
                <span className="ml-1 text-wr-blue">· {newCount} nuevas</span>
              )}
              )
            </span>
          )}
        </p>
        <span className="text-base text-wr-muted leading-none">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <>
          {/* Chips de categorías */}
          <div className="flex flex-wrap gap-1.5">
            {(["conversacion", "actividad", "pipeline", "senales"] as TimelineCategory[]).map(
              (c) => (
                <button
                  key={c}
                  onClick={() => toggleCategory(c)}
                  className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                    activeCategories.has(c)
                      ? "bg-wr-blue/15 text-wr-blue border-wr-blue/30"
                      : "bg-wr-surface text-wr-muted border-wr-border hover:text-wr-text"
                  }`}
                >
                  {CATEGORY_LABEL[c]}
                  {countsByCategory[c] > 0 && (
                    <span className="ml-1 opacity-70">({countsByCategory[c]})</span>
                  )}
                </button>
              )
            )}
          </div>

          {/* Cuerpo del feed */}
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {loading && (
              <p className="text-[10px] text-wr-hint italic text-center py-3">
                Cargando…
              </p>
            )}
            {error && (
              <p className="text-[10px] text-wr-red bg-wr-red/10 border border-wr-red/30 rounded px-2 py-1.5">
                {error}
              </p>
            )}
            {!loading && !error && filteredEvents.length === 0 && (
              <p className="text-[10px] text-wr-hint italic text-center py-3">
                {totalCount === 0
                  ? "Sin eventos en esta empresa."
                  : "Sin eventos con los filtros activos."}
              </p>
            )}

            {/* Cursor "leído hasta" — se renderiza UNA VEZ entre nuevos y vistos */}
            <DayList grouped={grouped} lastSeenAt={lastSeenAt} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Día por día ──────────────────────────────────────────────────────────

type DayGroup = { dateKey: string; label: string; events: TimelineEvent[] };

function groupByDay(events: TimelineEvent[]): DayGroup[] {
  const groups = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const d = new Date(e.fecha);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, list]) => ({ dateKey: key, label: dayLabel(key), events: list }));
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

const DOW = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((startOfToday.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return DOW[date.getDay()];
  // Mismo año: "Lunes 11 mayo"
  if (date.getFullYear() === today.getFullYear()) {
    return `${DOW[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
  }
  // Año distinto: "11 mayo 2025"
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function DayList({
  grouped,
  lastSeenAt,
}: {
  grouped: DayGroup[];
  lastSeenAt: string | null;
}) {
  // Encontrar la posición global donde meter la línea "leído hasta". La línea
  // va ENTRE el último evento "nuevo" (fecha > lastSeenAt) y el primero "visto".
  // Solo se renderiza si hay al menos un evento de cada lado.
  const cursorMs = lastSeenAt ? new Date(lastSeenAt).getTime() : null;
  let cursorInserted = false;

  return (
    <div className="space-y-3">
      {grouped.map((group) => (
        <div key={group.dateKey}>
          <h4 className="text-[9px] font-semibold text-wr-muted uppercase tracking-widest mb-1.5">
            {group.label}
          </h4>
          <div className="space-y-1.5 border-l border-wr-border/50 pl-2">
            {group.events.map((event) => {
              // ¿Hay que pintar el cursor antes de este evento?
              const eventMs = new Date(event.fecha).getTime();
              const showCursor =
                cursorMs !== null &&
                !cursorInserted &&
                eventMs <= cursorMs &&
                // Comprobamos que haya al menos un evento NUEVO antes que este
                // — si no, el cursor estaría al principio de todo (innecesario).
                hasNewerEvent(grouped, event, cursorMs);
              if (showCursor) cursorInserted = true;
              return (
                <div key={event.id}>
                  {showCursor && <SeenCursor />}
                  <TimelineItem event={event} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function hasNewerEvent(
  grouped: DayGroup[],
  current: TimelineEvent,
  cursorMs: number
): boolean {
  for (const g of grouped) {
    for (const e of g.events) {
      if (e.id === current.id) return false; // llegamos al actual sin encontrar nada nuevo
      if (new Date(e.fecha).getTime() > cursorMs) return true;
    }
  }
  return false;
}

function SeenCursor() {
  return (
    <div className="flex items-center gap-2 my-2 px-1">
      <div className="flex-1 h-px bg-wr-blue/40" />
      <span className="text-[9px] text-wr-blue uppercase tracking-wider font-semibold">
        Nuevas desde tu última visita
      </span>
      <div className="flex-1 h-px bg-wr-blue/40" />
    </div>
  );
}

// ─── Item por kind ────────────────────────────────────────────────────────

function TimelineItem({ event }: { event: TimelineEvent }) {
  switch (event.kind) {
    case "nota":
      return <NotaItem event={event} />;
    case "tarea_completada":
      return <TareaItem event={event} />;
    case "stage_changed":
      return <StageItem event={event} />;
    case "borme":
      return <BormeItem event={event} />;
  }
}

function ActorBadge({ actor }: { actor: TimelineEvent["actor"] }) {
  if (actor.kind === "finder") {
    return (
      <span className="text-[9px] text-wr-amber bg-wr-amber/10 border border-wr-amber/30 rounded px-1 py-0.5">
        Finder: {actor.name}
      </span>
    );
  }
  if (actor.kind === "system") {
    return (
      <span className="text-[9px] text-wr-hint italic">{actor.name}</span>
    );
  }
  return <span className="text-[9px] text-wr-muted">{actor.name}</span>;
}

function NotaItem({ event }: { event: Extract<TimelineEvent, { kind: "nota" }> }) {
  const isReply = event.payload.parentId !== null;
  return (
    <div className="bg-wr-surface rounded border border-wr-border p-2 text-xs">
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-wr-blue">
          {isReply ? "Respuesta" : "Nota"}
        </span>
        {!event.payload.visibleAFinder && event.actor.kind === "admin" && (
          <span className="text-[9px] text-wr-hint bg-wr-surface2 border border-wr-border rounded px-1">
            Interna
          </span>
        )}
        <ActorBadge actor={event.actor} />
        <span className="text-[9px] text-wr-hint ml-auto">{fmtDate(event.fecha)}</span>
      </div>
      <p className="whitespace-pre-wrap text-wr-text leading-snug">
        <MentionRender content={event.payload.contenido} />
      </p>
    </div>
  );
}

/** Cuerpo de un email en el timeline: muestra ~3 líneas y despliega el resto. */
function EmailBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = body.split("\n");
  const isLong = lines.length > 4 || body.length > 320;
  const preview = isLong ? lines.slice(0, 3).join("\n").slice(0, 320) : body;
  return (
    <div className="mt-1 pt-1 border-t border-wr-border/50">
      <p className="text-[11px] text-wr-muted whitespace-pre-wrap leading-snug">
        {expanded ? body : preview}
        {!expanded && isLong && "…"}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-wr-blue hover:underline mt-0.5"
        >
          {expanded ? "ver menos" : "ver más"}
        </button>
      )}
    </div>
  );
}

function TareaItem({
  event,
}: {
  event: Extract<TimelineEvent, { kind: "tarea_completada" }>;
}) {
  const tipo = event.payload.tipo as TareaTipo;
  const dir = event.payload.emailDirection;
  // Para emails con dirección conocida, icono + label reflejan el sentido.
  let icon = TAREA_TIPO_ICON[tipo] ?? "•";
  let label = TAREA_TIPO_LABEL[tipo] ?? event.payload.tipo;
  if (tipo === "email" && dir) {
    icon = dir === "entrante" ? "📥" : "📤";
    label = dir === "entrante" ? "Email recibido" : "Email enviado";
  }
  const sourceLabel =
    event.payload.source === "graph-email"
      ? "Email auto"
      : event.payload.source === "graph-calendar"
      ? "Calendar auto"
      : null;

  return (
    <div className="bg-wr-surface rounded border border-wr-border p-2 text-xs">
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-wr-green">
          {icon} {label} · completada
        </span>
        {sourceLabel && (
          <span className="text-[9px] text-wr-hint bg-wr-surface2 border border-wr-border rounded px-1">
            {sourceLabel}
          </span>
        )}
        <ActorBadge actor={event.actor} />
        <span className="text-[9px] text-wr-hint ml-auto">{fmtDate(event.fecha)}</span>
      </div>
      <p className="text-wr-text leading-snug">
        <MentionRender content={event.payload.titulo} />
      </p>
      {event.payload.emailContacto && (
        <p className="text-[10px] text-wr-muted mt-0.5">
          <span className="text-wr-hint">
            {event.payload.emailDirection === "entrante" ? "De: " : "Para: "}
          </span>
          {event.payload.emailContacto.nombre && (
            <span className="text-wr-text">
              {event.payload.emailContacto.nombre}
              {event.payload.emailContacto.email ? " · " : ""}
            </span>
          )}
          {event.payload.emailContacto.email}
        </p>
      )}
      {event.payload.emailBody && <EmailBody body={event.payload.emailBody} />}
      {event.payload.resultado && (
        <p className="text-[11px] text-wr-muted whitespace-pre-wrap leading-snug mt-1 pt-1 border-t border-wr-border/50">
          <MentionRender content={event.payload.resultado} />
        </p>
      )}
    </div>
  );
}

function StageItem({
  event,
}: {
  event: Extract<TimelineEvent, { kind: "stage_changed" }>;
}) {
  const from = event.payload.from
    ? DEAL_STAGE_LABEL[event.payload.from as DealStage] ?? event.payload.from
    : "Sin CRM";
  const to = event.payload.to
    ? DEAL_STAGE_LABEL[event.payload.to as DealStage] ?? event.payload.to
    : "Sin CRM";
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-wr-text py-0.5 flex-wrap">
      <span className="text-wr-amber font-semibold">⚡</span>
      <span className="text-wr-muted">Stage:</span>
      <span>{from}</span>
      <span className="text-wr-hint">→</span>
      <span className="text-wr-blue">{to}</span>
      <ActorBadge actor={event.actor} />
      <span className="text-[9px] text-wr-hint ml-auto">{fmtDate(event.fecha)}</span>
      {event.payload.note && (
        <p className="basis-full pl-5 text-[10px] text-wr-muted italic mt-0.5">
          “{event.payload.note}”
        </p>
      )}
    </div>
  );
}

function BormeItem({ event }: { event: Extract<TimelineEvent, { kind: "borme" }> }) {
  const cfg = getBormeTipo(event.payload.tipoActo);
  return (
    <div className="bg-wr-surface rounded border border-wr-border p-2 text-xs">
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${cfg.pill}`}
        >
          {cfg.label}
        </span>
        {event.payload.grupoInferidoNombre && (
          <span className="text-[10px] text-wr-muted">
            → {event.payload.grupoInferidoNombre}
          </span>
        )}
        <ActorBadge actor={event.actor} />
        <span className="text-[9px] text-wr-hint ml-auto">{fmtDate(event.fecha)}</span>
      </div>
      {event.payload.descripcion && (
        <p className="text-wr-muted leading-snug line-clamp-3">
          {event.payload.descripcion}
        </p>
      )}
      {event.payload.urlBorme && (
        <a
          href={event.payload.urlBorme}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-wr-blue hover:underline mt-1 inline-block"
        >
          Ver BORME ↗
        </a>
      )}
    </div>
  );
}
