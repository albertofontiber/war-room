"use client";

import { useState, useRef, useEffect } from "react";
import {
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_COLOR,
  ESTANCADO_DIAS,
} from "@/lib/crm";
import type { DealStage } from "@/types";

type Props = {
  /** Stage actual. null = empresa no está en el funnel. */
  stage: DealStage | null;
  /** Días en el stage actual (fallback si no hay stageDurations). */
  diasEnStage?: number | null;
  /** Días acumulados por stage (derivados de CrmLog). */
  stageDurations?: Partial<Record<DealStage, number>>;
  /** Callback cuando el usuario elige un nuevo stage. null = sacar del funnel. */
  onChange?: (nuevo: DealStage | null) => void;
  /** Variante compacta para tarjetas del Kanban. */
  compact?: boolean;
};

/**
 * Chevron del funnel: cada segmento es un polígono SVG.
 *   • Primer segmento → pentágono (izquierda recta, punta derecha)
 *   • Resto → hexágono (corte "V" izquierda, punta derecha), encajando con el anterior
 *
 * Texto renderizado dentro del SVG (foreignObject con HTML) para que la forma y el
 * texto compartan el mismo viewport y no haya desalineamientos entre overlays.
 */
export default function StageChevron({
  stage,
  diasEnStage,
  stageDurations,
  onChange,
  compact = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const currentIdx = stage ? DEAL_STAGES.indexOf(stage) : -1;
  const isEstancado =
    typeof diasEnStage === "number" && diasEnStage >= ESTANCADO_DIAS;

  const visibleStages = DEAL_STAGES.filter((s) => s !== "muerto" && s !== "on_hold");
  const heightPx = compact ? 22 : 30;
  const textSize = compact ? "text-[9px]" : "text-[11px]";

  // viewBox: 100 unidades por segmento, 40 de alto. Tip de 10 unidades.
  const segW = 100;
  const tip = 10;
  const vbH = 40;
  const total = visibleStages.length;
  const vbW = segW * total;

  function labelFor(s: DealStage, i: number): string {
    const isCompleted = currentIdx >= 0 && i < currentIdx;
    const isCurrent = currentIdx === i;
    const duracion =
      stageDurations?.[s] ??
      (isCurrent && typeof diasEnStage === "number" ? diasEnStage : null);
    // Para el stage actual usamos solo días (el nombre ya está en el dropdown de abajo)
    // — los segmentos no tienen ancho suficiente para el nombre completo.
    if (isCurrent) {
      return duracion != null ? `${duracion}d` : "●";
    }
    if (duracion != null) return `${duracion}d`;
    if (isCompleted) return "✓";
    return "";
  }

  return (
    <div className="w-full space-y-2">
      <div className="relative w-full" style={{ height: heightPx }}>
        {/* Fondo SVG: solo polígonos, escalados con preserveAspectRatio="none" */}
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          style={{ display: "block" }}
        >
          {visibleStages.map((s, i) => {
            const isCompleted = currentIdx >= 0 && i < currentIdx;
            const isCurrent = currentIdx === i;
            const fill = isCurrent
              ? DEAL_STAGE_COLOR[s]
              : isCompleted
              ? `${DEAL_STAGE_COLOR[s]}55`
              : "#1a2035";
            const x0 = i * segW;
            const x1 = x0 + segW;
            let points: string;
            if (i === 0) {
              // PENTÁGONO: 5 puntos — izquierda recta, punta derecha
              points = `${x0},0 ${x1 - tip},0 ${x1},${vbH / 2} ${x1 - tip},${vbH} ${x0},${vbH}`;
            } else {
              // HEXÁGONO: 6 puntos — corte izq "V" + punta dcha.
              // Esquinas izq (top/bottom) en x0-tip para encajar con la punta
              // del segmento anterior y que no quede triángulo vacío entre ellos.
              points = `${x0 - tip},0 ${x1 - tip},0 ${x1},${vbH / 2} ${x1 - tip},${vbH} ${x0 - tip},${vbH} ${x0},${vbH / 2}`;
            }
            return (
              <polygon
                key={`poly-${s}`}
                points={points}
                fill={fill}
                stroke="#2d3548"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* Overlay HTML: textos con CSS natural + truncate */}
        <div className="absolute inset-0 flex items-stretch pointer-events-none">
          {visibleStages.map((s, i) => {
            const isCompleted = currentIdx >= 0 && i < currentIdx;
            const isCurrent = currentIdx === i;
            const color = isCurrent
              ? "#0f1117"
              : isCompleted
              ? DEAL_STAGE_COLOR[s]
              : "#4a5568";
            // El primer segmento no tiene punta izquierda, solo derecha: padding asimétrico
            const padL = i === 0 ? 4 : 10;
            const padR = 10;
            return (
              <div
                key={`lbl-${s}`}
                className={`flex-1 flex items-center justify-center ${textSize} font-medium min-w-0`}
                style={{ color, paddingLeft: padL, paddingRight: padR }}
                title={DEAL_STAGE_LABEL[s]}
              >
                <span className="truncate">{labelFor(s, i)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {onChange && !compact && (
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              className="w-full flex items-center justify-between text-[11px] text-wr-text border border-wr-border rounded px-2 py-1.5 bg-wr-surface2 hover:bg-wr-surface transition-colors"
            >
              <span className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: stage ? DEAL_STAGE_COLOR[stage] : "#94a3b8" }}
                />
                {stage ? DEAL_STAGE_LABEL[stage] : "Sin CRM"}
              </span>
              <span className="text-wr-hint">▾</span>
            </button>
            {menuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-wr-surface border border-wr-border rounded-lg shadow-xl z-50 overflow-hidden">
                {DEAL_STAGES.map((s) => (
                  <button
                    key={s}
                    onClick={() => { onChange(s); setMenuOpen(false); }}
                    className={`w-full text-left text-xs px-3 py-1.5 flex items-center gap-2 hover:bg-wr-surface2 transition-colors ${
                      s === stage ? "text-wr-text font-medium bg-wr-surface2/50" : "text-wr-muted"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: DEAL_STAGE_COLOR[s] }}
                    />
                    {DEAL_STAGE_LABEL[s]}
                  </button>
                ))}
                {stage && (
                  <>
                    <div className="border-t border-wr-border" />
                    <button
                      onClick={() => { onChange(null); setMenuOpen(false); }}
                      className="w-full text-left text-xs px-3 py-1.5 text-wr-red hover:bg-wr-red/10 transition-colors"
                    >
                      Sacar del funnel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {isEstancado && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-wr-red bg-wr-red/15 border border-wr-red/30 px-1.5 py-1 rounded whitespace-nowrap">
              Estancado {diasEnStage}d
            </span>
          )}
        </div>
      )}
    </div>
  );
}
