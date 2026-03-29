"use client";

import { useEffect, useState, useCallback } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import type { EmpresaDetalle, TipoActividad, TipoActo } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

// ─── Constantes ────────────────────────────────────────────────────────────

const SECTOR_LABEL: Record<string, string> = {
  PCI: "PCI",
  seguridad_electronica: "Seg. Electrónica",
  mixto: "Mixto",
};

const STAGE_LABEL: Record<string, string> = {
  identificado: "Identificado",
  contactado: "Contactado",
  "LOI enviada": "LOI enviada",
  execution: "Execution",
  muerto: "Muerto",
  portfolio: "Portfolio",
};

const STAGE_COLOR: Record<string, string> = {
  identificado: "bg-[#64748b]/20 text-[#94a3b8] border-[#64748b]/30",
  contactado: "bg-wr-blue/20 text-wr-blue border-wr-blue/30",
  "LOI enviada": "bg-wr-amber/20 text-wr-amber border-wr-amber/30",
  execution: "bg-wr-amber/20 text-wr-amber border-wr-amber/30",
  portfolio: "bg-wr-green/20 text-wr-green border-wr-green/30",
  muerto: "bg-wr-red/20 text-wr-red border-wr-red/30",
};

const ACTIVIDAD_ICON: Record<TipoActividad, string> = {
  nota: "N",
  llamada: "T",
  email: "E",
  reunion: "R",
};

const ACTO_LABEL: Record<TipoActo, string> = {
  adquisicion: "Adquisición",
  disolucion: "Disolución",
  cambio_titular: "Cambio titular",
  fusion: "Fusión",
  otros: "Otros",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number | null): string {
  if (n === null || n === undefined) return "n.a.";
  return n.toLocaleString("es-ES");
}

function fmtM(n: number | null): string {
  if (n === null || n === undefined) return "n.a.";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K€`;
  return `${n.toLocaleString("es-ES")}€`;
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "n.a.";
  return `${n.toFixed(1)}%`;
}

function fmtDate(d: string | null): string {
  if (!d) return "n.a.";
  return new Date(d).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function TendenciaArrow({
  dir,
  pct,
}: {
  dir: "up" | "flat" | "down" | null;
  pct: number | null;
}) {
  if (!dir || dir === "flat")
    return <span className="text-wr-muted text-xs">→</span>;
  if (dir === "up")
    return (
      <span className="text-wr-green text-xs">
        ↑ {pct !== null ? `+${pct.toFixed(1)}%` : ""}
      </span>
    );
  return (
    <span className="text-wr-red text-xs">
      ↓ {pct !== null ? `${pct.toFixed(1)}%` : ""}
    </span>
  );
}

function Initials({ nombre }: { nombre: string }) {
  const parts = nombre.split(" ").filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <div className="w-12 h-12 rounded-lg bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-lg font-bold flex items-center justify-center flex-shrink-0">
      {initials}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-wr-muted uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

function KpiRow({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-wr-hint text-xs">{label}</span>
      <span className="text-wr-text text-xs font-medium flex items-center gap-1.5">
        {value}
        {trend}
      </span>
    </div>
  );
}

// ─── HistoricoChart ────────────────────────────────────────────────────────

type FinRow = {
  anio: number;
  ingresos: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
};

function fmtMillions(v: number) {
  return `${(v / 1_000_000).toFixed(1)}M`;
}

function HistoricoChart({ financieros }: { financieros: FinRow[] }) {
  // Orden cronológico ascendente para el eje X
  const data = [...financieros]
    .sort((a, b) => a.anio - b.anio)
    .map((f) => ({
      anio: String(f.anio),
      Ingresos: f.ingresos ?? 0,
      EBITDA: f.ebitda ?? 0,
      "EBITDA%": f.ebitdaPct != null ? Number(f.ebitdaPct.toFixed(1)) : null,
    }));

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#1a2035] border border-[#2d3548] rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-[#94a3b8] mb-1 font-medium">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span style={{ color: p.color }}>{p.name}:</span>
            <span className="text-[#e2e8f0] font-medium">
              {p.name === "EBITDA%"
                ? `${p.value.toFixed(1)}%`
                : `${fmtMillions(p.value)}€`}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mt-1 mb-2" style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 28, bottom: 0, left: -8 }}
          barCategoryGap="28%"
          barGap={3}
        >
          <CartesianGrid
            vertical={false}
            stroke="#2d3548"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="anio"
            tick={{ fill: "#4a5568", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          {/* Eje izquierdo: valores absolutos en M€ */}
          <YAxis
            yAxisId="abs"
            orientation="left"
            tickFormatter={(v) => `${fmtMillions(v)}`}
            tick={{ fill: "#4a5568", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          {/* Eje derecho: % EBITDA */}
          <YAxis
            yAxisId="pct"
            orientation="right"
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#4a5568", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={30}
            domain={[0, "auto"]}
          />
          <ReTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Legend
            iconSize={8}
            iconType="circle"
            formatter={(value) => (
              <span style={{ color: "#94a3b8", fontSize: 10 }}>{value}</span>
            )}
          />
          <Bar
            yAxisId="abs"
            dataKey="Ingresos"
            fill="#3b82f6"
            radius={[2, 2, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            yAxisId="abs"
            dataKey="EBITDA"
            fill="#22c55e"
            radius={[2, 2, 0, 0]}
            maxBarSize={22}
            fillOpacity={0.85}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="EBITDA%"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function PanelEmpresa() {
  const { empresaSeleccionadaId, cerrarPanel, modoPresentacion } =
    useWarRoomStore();

  const [empresa, setEmpresa] = useState<EmpresaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Fetch detail when selected empresa changes
  useEffect(() => {
    if (!empresaSeleccionadaId) return;
    setLoading(true);
    fetch(`/api/empresas/${empresaSeleccionadaId}`)
      .then((r) => r.json())
      .then((data) => setEmpresa(data))
      .catch(() => setEmpresa(null))
      .finally(() => setLoading(false));
  }, [empresaSeleccionadaId]);

  // Toggle perímetro
  const togglePerimetro = useCallback(async () => {
    if (!empresa || toggling) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}/perimetro`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enPerimetro: !empresa.enPerimetro }),
      });
      if (res.ok) {
        setEmpresa((prev) =>
          prev ? { ...prev, enPerimetro: !prev.enPerimetro } : prev
        );
      }
    } finally {
      setToggling(false);
    }
  }, [empresa, toggling]);

  // Loading state
  if (loading || !empresa) {
    return (
      <aside className="w-[340px] flex-shrink-0 bg-wr-surface border-l border-wr-border flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between p-4 border-b border-wr-border">
          <div className="h-3 w-24 bg-wr-surface2 rounded animate-pulse" />
          <button
            onClick={cerrarPanel}
            className="text-wr-muted hover:text-wr-text transition-colors p-1 rounded"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-wr-blue border-t-transparent rounded-full animate-spin" />
            <p className="text-wr-hint text-xs">Cargando…</p>
          </div>
        </div>
      </aside>
    );
  }

  const latestFin = empresa.financieros[0] ?? null;
  const dealStage = empresa.crmEstado?.dealStage;
  const stageClass = STAGE_COLOR[dealStage ?? ""] ?? STAGE_COLOR.prospecto;

  return (
    <aside className="w-[340px] flex-shrink-0 bg-wr-surface border-l border-wr-border flex flex-col animate-slide-in-right">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4 border-b border-wr-border">
        {empresa.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={empresa.logoUrl}
            alt=""
            className="w-12 h-12 object-contain rounded-lg border border-wr-border bg-wr-surface2 flex-shrink-0"
          />
        ) : (
          <Initials nombre={empresa.nombre} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {empresa.web ? (
                <a
                  href={empresa.web.startsWith("http") ? empresa.web : `https://${empresa.web}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sm text-wr-text hover:text-wr-blue transition-colors truncate block"
                >
                  {empresa.nombre}{" "}
                  <span className="text-wr-blue text-xs">↗</span>
                </a>
              ) : (
                <p className="font-semibold text-sm text-wr-text truncate">
                  {empresa.nombre}
                </p>
              )}
              <p className="text-wr-muted text-xs truncate">
                {empresa.localidad
                  ? `${empresa.localidad}, ${empresa.provincia}`
                  : empresa.provincia}{" "}
                · {empresa.ccaa}
              </p>
            </div>
            <button
              onClick={cerrarPanel}
              className="text-wr-muted hover:text-wr-text transition-colors p-1 rounded flex-shrink-0 -mt-0.5"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant="outline"
              className="text-[10px] bg-wr-surface2 text-wr-muted border-wr-border"
            >
              {SECTOR_LABEL[empresa.sector] ?? empresa.sector}
            </Badge>
            {dealStage && (
              <Badge
                variant="outline"
                className={`text-[10px] border ${stageClass}`}
              >
                {STAGE_LABEL[dealStage] ?? dealStage}
              </Badge>
            )}
            {empresa.cepreven && (
              <Badge
                variant="outline"
                className="text-[10px] bg-wr-amber/10 text-wr-amber border-wr-amber/30"
              >
                Cepreven
              </Badge>
            )}
            {empresa.aerme && (
              <Badge
                variant="outline"
                className="text-[10px] bg-wr-amber/10 text-wr-amber border-wr-amber/30"
              >
                Aerme
              </Badge>
            )}
            {empresa.grupo && (
              <Badge
                variant="outline"
                className="text-[10px] bg-wr-surface2 text-wr-muted border-wr-border"
              >
                Grupo: {empresa.grupo.nombre}
              </Badge>
            )}
          </div>

          {/* Toggle en perímetro */}
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-wr-surface2 border border-wr-border">
            <div>
              <p className="text-xs font-medium text-wr-text">En perímetro</p>
              <p className="text-[10px] text-wr-hint">
                {empresa.enPerimetro
                  ? "Incluida en análisis"
                  : "Excluida del análisis"}
              </p>
            </div>
            <Switch
              checked={empresa.enPerimetro}
              onCheckedChange={togglePerimetro}
              disabled={toggling}
            />
          </div>

          {/* Descripción */}
          {empresa.descripcion && (
            <p className="text-xs text-wr-muted leading-relaxed">
              {empresa.descripcion}
            </p>
          )}

          <Separator className="bg-wr-border" />

          {/* KPIs financieros — ocultos en modo presentación */}
          {!modoPresentacion && latestFin && (
            <>
              <div>
                <SectionLabel>
                  Financieros ({latestFin.anio})
                </SectionLabel>
                <div className="space-y-0.5">
                  <KpiRow
                    label="Ingresos"
                    value={fmtM(latestFin.ingresos)}
                    trend={
                      empresa.tendenciaIngresos ? (
                        <TendenciaArrow
                          dir={empresa.tendenciaIngresos.direccion}
                          pct={empresa.tendenciaIngresos.variacionPct}
                        />
                      ) : undefined
                    }
                  />
                  <KpiRow
                    label="Margen bruto"
                    value={fmtPct(latestFin.margenBrutoPct)}
                    trend={
                      empresa.tendenciaMargenBruto ? (
                        <TendenciaArrow
                          dir={empresa.tendenciaMargenBruto.direccion}
                          pct={empresa.tendenciaMargenBruto.variacionPct}
                        />
                      ) : undefined
                    }
                  />
                  <KpiRow
                    label="EBITDA"
                    value={fmtM(latestFin.ebitda)}
                  />
                  <KpiRow
                    label="% EBITDA"
                    value={fmtPct(latestFin.ebitdaPct)}
                  />
                  <KpiRow
                    label="Resultado neto"
                    value={fmtM(latestFin.resultadoNeto)}
                  />
                </div>
              </div>

              {/* Histórico financiero — gráfico */}
              {empresa.financieros.length > 1 && (
                <div>
                  <SectionLabel>Histórico</SectionLabel>
                  <HistoricoChart financieros={empresa.financieros} />
                </div>
              )}

              <Separator className="bg-wr-border" />
            </>
          )}

          {/* Datos generales */}
          <div>
            <SectionLabel>Datos generales</SectionLabel>
            <div className="space-y-0.5">
              <KpiRow label="CIF" value={empresa.cif} />
              <KpiRow label="Empleados" value={fmt(empresa.empleados)} />
              {empresa.servicios.length > 0 && (
                <div className="py-1">
                  <span className="text-wr-hint text-xs">Servicios</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {empresa.servicios.map((s) => (
                      <span
                        key={s}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-wr-surface2 text-wr-muted border border-wr-border"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {empresa.linkedin && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-wr-hint text-xs">LinkedIn</span>
                  <a
                    href={empresa.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-wr-blue text-xs hover:underline truncate max-w-[180px]"
                  >
                    Ver perfil ↗
                  </a>
                </div>
              )}
              {empresa.score !== null && (
                <KpiRow label="Score" value={empresa.score.toFixed(1)} />
              )}
            </div>
          </div>

          {/* CRM */}
          {empresa.crmEstado && (
            <>
              <Separator className="bg-wr-border" />
              <div>
                <SectionLabel>CRM</SectionLabel>
                <div className="space-y-0.5">
                  {empresa.crmEstado.owner && (
                    <KpiRow label="Owner" value={empresa.crmEstado.owner} />
                  )}
                  <KpiRow
                    label="Actualizado"
                    value={fmtDate(empresa.crmEstado.updatedAt)}
                  />
                </div>
                {empresa.crmEstado.pipedriveOrgId && (
                  <a
                    href={`https://fontiber.pipedrive.com/organization/${empresa.crmEstado.pipedriveOrgId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-wr-blue hover:underline"
                  >
                    Ver en Pipedrive →
                  </a>
                )}
              </div>
            </>
          )}

          {/* Actividades CRM */}
          {empresa.actividades.length > 0 && (
            <>
              <Separator className="bg-wr-border" />
              <div>
                <SectionLabel>
                  Actividades ({empresa.actividades.length})
                </SectionLabel>
                <div className="space-y-2">
                  {empresa.actividades.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-2 text-xs"
                    >
                      <div className="w-5 h-5 rounded bg-wr-surface2 border border-wr-border text-wr-muted text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {ACTIVIDAD_ICON[a.tipo as TipoActividad] ?? "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-wr-text leading-snug line-clamp-2">
                          {a.texto || "Sin descripción"}
                        </p>
                        <p className="text-wr-hint text-[10px] mt-0.5">
                          {a.autor && `${a.autor} · `}
                          {fmtDate(a.fecha)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Alertas BORME */}
          {empresa.bormeAlertas.length > 0 && (
            <>
              <Separator className="bg-wr-border" />
              <div>
                <SectionLabel>
                  Alertas BORME ({empresa.bormeAlertas.length})
                </SectionLabel>
                <div className="space-y-2">
                  {empresa.bormeAlertas.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-2 text-xs"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-wr-amber flex-shrink-0 mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-wr-text font-medium">
                          {ACTO_LABEL[a.tipoActo as TipoActo] ?? a.tipoActo}
                        </p>
                        {a.descripcion && (
                          <p className="text-wr-muted leading-snug line-clamp-2">
                            {a.descripcion}
                          </p>
                        )}
                        <p className="text-wr-hint text-[10px] mt-0.5">
                          {fmtDate(a.fecha)}
                          {a.urlBorme && (
                            <>
                              {" · "}
                              <a
                                href={a.urlBorme}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-wr-blue hover:underline"
                              >
                                Ver BORME ↗
                              </a>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Spacer bottom */}
          <div className="h-4" />
        </div>
      </ScrollArea>
    </aside>
  );
}
