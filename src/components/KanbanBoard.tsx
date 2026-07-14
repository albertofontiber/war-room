"use client";

import { useMemo, useState } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_COLOR,
  ESTANCADO_DIAS,
  FUNNEL_STAGES,
  SIDE_STAGES,
} from "@/lib/crm";
import { fmtM } from "@/lib/format";
import { useIsDesktop } from "@/lib/breakpoints";
import { BottomSheet } from "@/components/ui/responsive";
import type { DealStage } from "@/types";

export type SortOption = "nombre" | "ingresos_desc" | "ingresos_asc" | "act_desc" | "act_asc" | "stage_desc" | "stage_asc";

export const SORT_LABEL: Record<SortOption, string> = {
  nombre: "Nombre",
  ingresos_desc: "Ingresos ↓",
  ingresos_asc: "Ingresos ↑",
  act_desc: "Última actividad (más reciente)",
  act_asc: "Última actividad (más antigua)",
  stage_desc: "Días en stage ↓",
  stage_asc: "Días en stage ↑",
};

export type KanbanCard = {
  id: number;
  cif: string;
  nombre: string;
  ccaa: string | null;
  provincia: string | null;
  sector: string | null;
  web: string | null;
  grupoNombre: string | null;
  dealStage: DealStage | null;
  ingresos: number | null;
  margenBrutoPct: number | null;
  ebitda: number | null;
  ownerName: string | null;
  finderName: string | null;
  ultimaActividad: { fecha: string; tipo: string } | null;
  diasSinActividad: number | null;
  diasEnStage: number | null;
  tareasPendientes: number;
  esAnonima: boolean;
};

type Props = {
  grouped: Record<DealStage, KanbanCard[]>;
  onStageChange: (empresaId: number, nuevo: DealStage) => Promise<void> | void;
  onCardClick?: (empresaId: number) => void;
  sort?: SortOption;
};

function sortCards(cards: KanbanCard[], option: SortOption): KanbanCard[] {
  const nullLast = (a: number | null, b: number | null, asc: boolean) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return asc ? a - b : b - a;
  };
  const copy = [...cards];
  switch (option) {
    case "ingresos_desc":
      copy.sort((a, b) => nullLast(a.ingresos, b.ingresos, false));
      break;
    case "ingresos_asc":
      copy.sort((a, b) => nullLast(a.ingresos, b.ingresos, true));
      break;
    case "act_desc":
      // más reciente primero = diasSinActividad ASC (menos días = más reciente)
      copy.sort((a, b) => nullLast(a.diasSinActividad, b.diasSinActividad, true));
      break;
    case "act_asc":
      copy.sort((a, b) => nullLast(a.diasSinActividad, b.diasSinActividad, false));
      break;
    case "stage_desc":
      copy.sort((a, b) => nullLast(a.diasEnStage, b.diasEnStage, false));
      break;
    case "stage_asc":
      copy.sort((a, b) => nullLast(a.diasEnStage, b.diasEnStage, true));
      break;
    case "nombre":
    default:
      copy.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  return copy;
}

function Card({ card, onClick, blur = false }: { card: KanbanCard; onClick?: () => void; blur?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `empresa-${card.id}`,
    data: { empresaId: card.id },
  });

  const estancado =
    typeof card.diasEnStage === "number" && card.diasEnStage >= ESTANCADO_DIAS;

  const blurCls = blur ? "blur-sm select-none" : "";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Si no está arrastrando, click normal dispara detalle
        if (!isDragging && onClick) onClick();
        e.stopPropagation();
      }}
      className={`bg-wr-surface border border-wr-border rounded-md p-2.5 cursor-grab active:cursor-grabbing hover:border-wr-muted transition-colors ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className={`text-xs font-semibold text-wr-text truncate flex-1 ${blurCls}`} title={card.nombre}>
          {card.nombre}
        </h4>
        <div className="flex items-center gap-1 flex-shrink-0">
          {card.esAnonima && (
            <span
              className="text-[9px] font-bold bg-wr-blue/20 text-wr-blue border border-wr-blue/30 rounded px-1 py-0.5 whitespace-nowrap"
              title="Lead sin identificar (identidad confidencial)"
            >
              LEAD
            </span>
          )}
          {card.tareasPendientes > 0 && (
            <span
              className="text-[9px] font-bold bg-wr-amber/20 text-wr-amber border border-wr-amber/30 rounded px-1 py-0.5 whitespace-nowrap"
              title={`${card.tareasPendientes} tareas pendientes`}
            >
              {card.tareasPendientes}T
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-wr-hint mb-1.5 flex-wrap">
        {!card.esAnonima && <span className={`truncate ${blurCls}`}>{card.cif}</span>}
        {card.esAnonima && <span className="text-wr-hint italic">Sin CIF</span>}
        {card.provincia && <span className="truncate">· {card.provincia}</span>}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-wr-muted">
        <span title="Ingresos">
          <span className="text-wr-hint">I:</span> {fmtM(card.ingresos, "—")}
        </span>
        <span title="EBITDA">
          <span className="text-wr-hint">E:</span> {fmtM(card.ebitda, "—")}
        </span>
        {card.margenBrutoPct != null && (
          <span title="GM (gross margin)">
            <span className="text-wr-hint">GM:</span> {card.margenBrutoPct.toFixed(0)}%
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-wr-border/50 gap-1.5">
        <span className="text-[9px] text-wr-hint truncate flex items-center gap-1.5 min-w-0">
          <span className="truncate">{card.ownerName ?? "Sin owner"}</span>
          {card.finderName && (
            <span
              className="bg-wr-blue/15 text-wr-blue border border-wr-blue/30 rounded px-1 py-0.5 text-[9px] font-medium whitespace-nowrap flex-shrink-0"
              title={`Finder: ${card.finderName}`}
            >
              F · {card.finderName}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {estancado && (
            <span
              className="text-[9px] font-bold bg-wr-red/20 text-wr-red border border-wr-red/30 rounded px-1 py-0.5"
              title="Estancado en este stage"
            >
              {card.diasEnStage}d
            </span>
          )}
          {!estancado && card.diasEnStage != null && (
            <span className="text-[9px] text-wr-hint" title="Días en stage">
              {card.diasEnStage}d
            </span>
          )}
          {card.diasSinActividad != null && (
            <span
              className={`text-[9px] ${
                card.diasSinActividad > 30 ? "text-wr-amber" : "text-wr-hint"
              }`}
              title={`Días desde la última actividad (${card.ultimaActividad?.tipo ?? ""})`}
            >
              · {card.diasSinActividad}d s/act
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Column({
  stage,
  cards,
  onCardClick,
  collapsed = false,
  onToggleCollapse,
  blur = false,
}: {
  stage: DealStage;
  cards: KanbanCard[];
  onCardClick?: (id: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  blur?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage}`,
    data: { stage },
  });

  const color = DEAL_STAGE_COLOR[stage];

  // Total de ingresos de la columna (suma solo las que tienen dato).
  // No sumamos EBITDA: en PYMEs pequeñas el ajuste por sueldo del founder distorsiona.
  const totalIngresos = cards.reduce((acc, c) => acc + (c.ingresos ?? 0), 0);
  const hasAnyIngresos = cards.some((c) => c.ingresos != null);

  function fmtShort(n: number): string {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K€`;
    return `${n.toFixed(0)}€`;
  }

  return (
    <div
      ref={setNodeRef}
      className={`snap-start flex flex-col min-w-[240px] w-[240px] ${collapsed ? "!w-[48px] !min-w-[48px]" : ""} bg-wr-bg border border-wr-border rounded-lg overflow-hidden transition-all ${
        isOver ? "border-wr-blue shadow-lg shadow-wr-blue/20" : ""
      }`}
    >
      {/* header */}
      <div
        className="px-3 py-2 border-b border-wr-border cursor-pointer select-none"
        style={{ background: `${color}12` }}
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          {!collapsed && (
            <>
              <h3 className="text-xs font-semibold text-wr-text truncate flex-1" style={{ color }}>
                {DEAL_STAGE_LABEL[stage]}
              </h3>
              <span className="text-[10px] text-wr-muted bg-wr-surface rounded px-1.5 py-0.5">
                {cards.length}
              </span>
            </>
          )}
          {collapsed && (
            <span
              className="text-[10px] font-semibold writing-mode-vertical text-wr-muted"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              title={DEAL_STAGE_LABEL[stage]}
            >
              {DEAL_STAGE_LABEL[stage]} · {cards.length}
            </span>
          )}
        </div>
        {!collapsed && hasAnyIngresos && (
          <div className="mt-1 text-[9px] text-wr-hint">
            <span title="Suma de ingresos de las empresas de esta etapa">
              <span className="opacity-60">Ingresos:</span> {fmtShort(totalIngresos)}
            </span>
          </div>
        )}
      </div>

      {/* cards */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
          {cards.length === 0 ? (
            <div className="text-[10px] text-wr-hint italic text-center py-6">
              —
            </div>
          ) : (
            cards.map((c) => (
              <Card key={c.id} card={c} blur={blur} onClick={() => onCardClick?.(c.id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function KanbanBoard({ grouped, onStageChange, onCardClick, sort = "nombre" }: Props) {
  const modoPresentacion = useWarRoomStore((s) => s.modoPresentacion);
  const [sideCollapsed, setSideCollapsed] = useState<Record<string, boolean>>({
    on_hold: true,
    muerto: true,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  // En móvil/tablet pedimos confirmación antes de mover (el drag táctil es
  // propenso a sueltas accidentales). null = no hay confirmación pendiente.
  const [pendingMove, setPendingMove] = useState<{
    empresaId: number;
    nombre: string;
    fromStage: DealStage;
    toStage: DealStage;
  } | null>(null);
  // Ratón: arrastra al superar 6px (preciso). Táctil: pulsación mantenida de
  // 200ms inicia el arrastre; un swipe (mover >8px antes) deja scrollear la
  // columna en vez de capturar la tarjeta como drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const sortedGrouped = useMemo(() => {
    const out: Record<DealStage, KanbanCard[]> = {} as Record<DealStage, KanbanCard[]>;
    for (const s of DEAL_STAGES) {
      out[s] = sortCards(grouped[s] ?? [], sort);
    }
    return out;
  }, [grouped, sort]);

  function handleStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const empresaId = active.data.current?.empresaId as number | undefined;
    const nuevoStage = over.data.current?.stage as DealStage | undefined;
    if (!empresaId || !nuevoStage) return;

    // Encontrar stage actual
    let actualStage: DealStage | null = null;
    for (const s of DEAL_STAGES) {
      if (grouped[s].some((c) => c.id === empresaId)) {
        actualStage = s;
        break;
      }
    }
    if (!actualStage || actualStage === nuevoStage) return;

    // En desktop (ratón, preciso) movemos directo. En móvil/tablet abrimos un
    // bottom-sheet de confirmación: hasta confirmar no llamamos a onStageChange,
    // así la tarjeta vuelve a su columna y un movimiento accidental no persiste.
    if (!isDesktop) {
      const card = grouped[actualStage].find((c) => c.id === empresaId);
      setPendingMove({
        empresaId,
        nombre: card?.nombre ?? `#${empresaId}`,
        fromStage: actualStage,
        toStage: nuevoStage,
      });
      return;
    }

    onStageChange(empresaId, nuevoStage);
  }

  function confirmMove() {
    if (!pendingMove) return;
    onStageChange(pendingMove.empresaId, pendingMove.toStage);
    setPendingMove(null);
  }

  const activeCard = activeId
    ? Object.values(grouped)
        .flat()
        .find((c) => `empresa-${c.id}` === activeId)
    : null;

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleStart} onDragEnd={handleEnd}>
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto p-2 sm:gap-3 sm:snap-none sm:p-4 h-full">
          {FUNNEL_STAGES.map((s) => (
            <Column key={s} stage={s} cards={sortedGrouped[s] ?? []} onCardClick={onCardClick} blur={modoPresentacion} />
          ))}
          {SIDE_STAGES.map((s) => (
            <Column
              key={s}
              stage={s}
              cards={sortedGrouped[s] ?? []}
              onCardClick={onCardClick}
              collapsed={sideCollapsed[s]}
              onToggleCollapse={() =>
                setSideCollapsed((prev) => ({ ...prev, [s]: !prev[s] }))
              }
              blur={modoPresentacion}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <Card card={activeCard} blur={modoPresentacion} /> : null}
        </DragOverlay>
      </DndContext>

      <BottomSheet
        open={pendingMove != null}
        onOpenChange={(o) => {
          if (!o) setPendingMove(null);
        }}
        title="Mover target"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setPendingMove(null)}
              className="px-3 py-2 text-sm rounded border border-wr-border text-wr-muted hover:text-wr-text transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmMove}
              className="px-4 py-2 text-sm rounded bg-wr-blue text-white hover:bg-wr-blue-light transition-colors"
            >
              Mover
            </button>
          </div>
        }
      >
        {pendingMove && (
          <p className="text-sm text-wr-text leading-relaxed">
            ¿Mover <span className="font-semibold">{pendingMove.nombre}</span> de{" "}
            <span className="font-medium" style={{ color: DEAL_STAGE_COLOR[pendingMove.fromStage] }}>
              {DEAL_STAGE_LABEL[pendingMove.fromStage]}
            </span>{" "}
            a{" "}
            <span className="font-medium" style={{ color: DEAL_STAGE_COLOR[pendingMove.toStage] }}>
              {DEAL_STAGE_LABEL[pendingMove.toStage]}
            </span>
            ?
          </p>
        )}
      </BottomSheet>
    </>
  );
}
