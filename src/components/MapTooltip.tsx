"use client";

import { useWarRoomStore } from "@/store/useWarRoomStore";
import { fmt, fmtM } from "@/lib/format";

interface TooltipProps {
  x: number;
  y: number;
  // GeoJSON feature properties
  props: {
    id: number;
    nombre: string;
    provincia: string;
    sector: string;
    dealStage: string | null;
    ingresos: number | null;
    margenBrutoPct: number | null;
    ebitdaPct: number | null;
    empleados: number | null;
    grupoNombre: string | null;
    logoUrl: string | null;
    web: string | null;
    tendencia: "up" | "flat" | "down";
    variacionPct: number | null;
    hasBormeReciente: boolean;
    enPerimetro: boolean;
    tareasPendientesCount: number;
  };
}

const SECTOR_LABEL: Record<string, string> = {
  PCI: "PCI",
  seguridad_electronica: "Seg. Electrónica",
  mixto: "Mixto",
};

const STAGE_LABEL: Record<string, string> = {
  identificado: "Identificado",
  contactado: "Contactado",
  primera_reunion: "1ª reunión",
  analisis: "Análisis",
  "LOI enviada": "LOI enviada",
  execution: "Ejecución",
  portfolio: "Portfolio",
  on_hold: "On hold",
  muerto: "Muerto",
};

const STAGE_COLOR: Record<string, string> = {
  identificado: "bg-[#64748b]/20 text-[#94a3b8]",
  contactado: "bg-wr-blue/20 text-wr-blue",
  primera_reunion: "bg-wr-blue/20 text-wr-blue",
  analisis: "bg-[#8b5cf6]/20 text-[#8b5cf6]",
  "LOI enviada": "bg-wr-amber/20 text-wr-amber",
  execution: "bg-wr-amber/20 text-wr-amber",
  portfolio: "bg-wr-green/20 text-wr-green",
  on_hold: "bg-[#a8a29e]/20 text-[#a8a29e]",
  muerto: "bg-wr-red/20 text-wr-red",
};


function TendenciaIcon({ dir, pct }: { dir: string; pct: number | null }) {
  if (dir === "up")
    return (
      <span className="text-wr-green text-xs flex items-center gap-0.5">
        ↑ {pct !== null ? `+${pct.toFixed(1)}%` : ""}
      </span>
    );
  if (dir === "down")
    return (
      <span className="text-wr-red text-xs flex items-center gap-0.5">
        ↓ {pct !== null ? `${pct.toFixed(1)}%` : ""}
      </span>
    );
  return <span className="text-wr-muted text-xs">→</span>;
}

function Initials({ nombre }: { nombre: string }) {
  const parts = nombre.split(" ").filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-xs font-bold flex items-center justify-center flex-shrink-0">
      {initials}
    </div>
  );
}

export default function MapTooltip({ x, y, props }: TooltipProps) {
  const { modoPresentacion } = useWarRoomStore();

  // Position: offset from cursor, flip if near edges
  const offsetX = x + 16;
  const offsetY = y - 8;

  const stageClass =
    STAGE_COLOR[props.dealStage ?? ""] ?? "bg-[#64748b]/20 text-[#94a3b8]";

  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{ left: offsetX, top: offsetY, maxWidth: 240 }}
    >
      <div className="bg-wr-surface border border-wr-border rounded-lg shadow-2xl p-3 text-xs">
        {/* Header */}
        <div className="flex items-start gap-2 mb-2">
          {props.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.logoUrl}
              alt=""
              className="w-8 h-8 object-contain rounded"
            />
          ) : (
            <Initials nombre={props.nombre} />
          )}
          <div className="min-w-0">
            {props.web ? (
              <p className="font-semibold text-wr-text truncate leading-tight">
                {props.nombre}
              </p>
            ) : (
              <p className="font-semibold text-wr-text truncate leading-tight">
                {props.nombre}
              </p>
            )}
            <p className="text-wr-muted truncate">{props.provincia}</p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1 mb-2">
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-wr-surface2 text-wr-muted border border-wr-border">
            {SECTOR_LABEL[props.sector] ?? props.sector}
          </span>
          {props.dealStage && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${stageClass}`}>
              {STAGE_LABEL[props.dealStage] ?? props.dealStage}
            </span>
          )}
          {!props.enPerimetro && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-wr-hint/20 text-wr-hint border border-wr-hint/20">
              Fuera perímetro
            </span>
          )}
          {props.tareasPendientesCount > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] bg-wr-amber/20 text-wr-amber border border-wr-amber/30"
              title={`${props.tareasPendientesCount} tareas pendientes`}
            >
              {props.tareasPendientesCount}T
            </span>
          )}
        </div>

        {/* Financieros — ocultos en modo presentación */}
        {!modoPresentacion && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mb-1.5">
            <div className="text-wr-hint">Ingresos</div>
            <div className="text-wr-text flex items-center gap-1">
              {fmtM(props.ingresos)}
              <TendenciaIcon dir={props.tendencia} pct={props.variacionPct} />
            </div>
            <div className="text-wr-hint">Margen bruto</div>
            <div className="text-wr-text">
              {props.margenBrutoPct != null
                ? `${props.margenBrutoPct.toFixed(1)}%`
                : "n.a."}
            </div>
            <div className="text-wr-hint">Empleados</div>
            <div className="text-wr-text">{fmt(props.empleados)}</div>
          </div>
        )}

        {/* Grupo */}
        {props.grupoNombre && (
          <p className="text-wr-hint truncate">
            Grupo: <span className="text-wr-muted">{props.grupoNombre}</span>
          </p>
        )}

        {/* BORME */}
        {props.hasBormeReciente && (
          <p className="text-wr-amber mt-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-wr-amber inline-block" />
            Alerta BORME reciente
          </p>
        )}
      </div>
    </div>
  );
}
