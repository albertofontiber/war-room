"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { fmt, fmtM, fmtPct, fmtDate, fmtMillions } from "@/lib/format";
import type { EmpresaDetalle, TipoActividad } from "@/types";
import { getBormeTipo } from "@/lib/borme-constants";
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
  identificado:    "Identificado",
  contactado:      "Contactado",
  primera_reunion: "1ª reunión",
  analisis:        "Análisis",
  "LOI enviada":   "LOI enviada",
  execution:       "Ejecución",
  portfolio:       "Portfolio",
  muerto:          "Muerto",
};

const STAGE_COLOR: Record<string, string> = {
  identificado:    "bg-[#64748b]/20 text-[#94a3b8] border-[#64748b]/30",
  contactado:      "bg-wr-blue/20 text-wr-blue border-wr-blue/30",
  primera_reunion: "bg-wr-blue/20 text-wr-blue border-wr-blue/30",
  analisis:        "bg-wr-blue/20 text-wr-blue border-wr-blue/30",
  "LOI enviada":   "bg-wr-amber/20 text-wr-amber border-wr-amber/30",
  execution:       "bg-wr-amber/20 text-wr-amber border-wr-amber/30",
  portfolio:       "bg-wr-green/20 text-wr-green border-wr-green/30",
  muerto:          "bg-wr-red/20 text-wr-red border-wr-red/30",
};

const ACTIVIDAD_ICON: Record<TipoActividad, string> = {
  nota: "N",
  llamada: "T",
  email: "E",
  reunion: "R",
};


function bormeContexto(tipoActo: string, grupoNombre: string | null | undefined): string | null {
  if (!grupoNombre) return null;
  if (tipoActo === "posible_adquisicion" || tipoActo === "nombramiento_grupo") return `por ${grupoNombre}`;
  if (tipoActo === "adquisicion") return `por ${grupoNombre}`;
  if (tipoActo === "fusion") return `con ${grupoNombre}`;
  return null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

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
          margin={{ top: 12, right: 28, bottom: 0, left: 4 }}
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
  const [expandBorme, setExpandBorme] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState(false);
  const [grupoInput, setGrupoInput] = useState("");
  const [savingGrupo, setSavingGrupo] = useState(false);
  const [grupoDropdownOpen, setGrupoDropdownOpen] = useState(false);
  const [allGrupos, setAllGrupos] = useState<{ id: number; nombre: string }[]>([]);
  const grupoInputRef = useRef<HTMLInputElement>(null);
  const grupoWrapperRef = useRef<HTMLDivElement>(null);

  // Fetch detail when selected empresa changes
  useEffect(() => {
    if (!empresaSeleccionadaId) return;
    setLoading(true);
    setExpandBorme(false);
    fetch(`/api/empresas/${empresaSeleccionadaId}`)
      .then((r) => r.json())
      .then((data) => setEmpresa(data))
      .catch(() => setEmpresa(null))
      .finally(() => setLoading(false));
  }, [empresaSeleccionadaId]);

  // Fetch all grupos once on mount
  useEffect(() => {
    fetch("/api/grupos")
      .then((r) => r.json())
      .then(setAllGrupos)
      .catch(() => {});
  }, []);

  // Filtered suggestions
  const suggestions = useMemo(() => {
    if (!grupoInput.trim()) return allGrupos.slice(0, 8);
    const q = grupoInput.toLowerCase();
    return allGrupos.filter((g) => g.nombre.toLowerCase().includes(q)).slice(0, 8);
  }, [grupoInput, allGrupos]);

  const hasExactMatch = useMemo(
    () => allGrupos.some((g) => g.nombre.toLowerCase() === grupoInput.trim().toLowerCase()),
    [grupoInput, allGrupos]
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!grupoDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (grupoWrapperRef.current && !grupoWrapperRef.current.contains(e.target as Node)) {
        setGrupoDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [grupoDropdownOpen]);

  // Open grupo editor
  const startEditGrupo = useCallback(() => {
    setGrupoInput(empresa?.grupo?.nombre ?? "");
    setEditingGrupo(true);
    setGrupoDropdownOpen(true);
    setTimeout(() => { grupoInputRef.current?.select(); }, 50);
  }, [empresa]);

  // Select a suggestion
  const selectGrupo = useCallback((nombre: string) => {
    setGrupoInput(nombre);
    setGrupoDropdownOpen(false);
    // Immediately save
    if (!empresa) return;
    setSavingGrupo(true);
    fetch(`/api/empresas/${empresa.id}/grupo`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grupoNombre: nombre }),
    })
      .then((r) => r.json())
      .then((data) => setEmpresa((prev) => prev ? { ...prev, grupo: data.grupo } : prev))
      .finally(() => { setSavingGrupo(false); setEditingGrupo(false); });
  }, [empresa]);

  // Save grupo on Enter / blur
  const saveGrupo = useCallback(async () => {
    if (!empresa || savingGrupo || grupoDropdownOpen) return;
    setSavingGrupo(true);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}/grupo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupoNombre: grupoInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setEmpresa((prev) => prev ? { ...prev, grupo: data.grupo } : prev);
        if (data.grupo) {
          setAllGrupos((prev) =>
            prev.some((g) => g.id === data.grupo.id)
              ? prev
              : [...prev, data.grupo].sort((a, b) => a.nombre.localeCompare(b.nombre))
          );
        }
      }
    } finally {
      setSavingGrupo(false);
      setEditingGrupo(false);
    }
  }, [empresa, grupoInput, savingGrupo, grupoDropdownOpen]);

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
      <div className="flex-1 min-h-0 overflow-y-auto">
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
                className={`text-[10px] border ${empresa.cepreven === "calificada" ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-wr-amber/10 text-wr-amber border-wr-amber/30"}`}
              >
                Cepreven {empresa.cepreven === "calificada" ? "✓" : ""}
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
          </div>

          {/* ── Sección GESTIÓN ─────────────────────────────────────────── */}
          <div className="rounded-lg border border-wr-amber/20 bg-wr-amber/5">
            <p className="text-[9px] font-semibold text-wr-amber/70 uppercase tracking-widest px-3 pt-2 pb-1">
              Gestión
            </p>

            {/* Toggle perímetro */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-wr-amber/10">
              <div>
                <p className="text-xs font-medium text-wr-text">En perímetro</p>
                <p className="text-[10px] text-wr-hint">
                  {empresa.enPerimetro ? "Incluida en análisis" : "Excluida del análisis"}
                </p>
              </div>
              <Switch
                checked={empresa.enPerimetro}
                onCheckedChange={togglePerimetro}
                disabled={toggling}
                className="data-[checked]:bg-emerald-500 data-[unchecked]:bg-red-500/80"
              />
            </div>

            {/* Grupo editable con autocomplete */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-wr-amber/10">
              <span className="text-xs text-wr-hint flex-shrink-0">Grupo</span>
              <div ref={grupoWrapperRef} className="relative ml-2 flex-1 flex justify-end">
                {editingGrupo ? (
                  <>
                    <input
                      ref={grupoInputRef}
                      value={grupoInput}
                      onChange={(e) => { setGrupoInput(e.target.value); setGrupoDropdownOpen(true); }}
                      onFocus={() => setGrupoDropdownOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { setGrupoDropdownOpen(false); saveGrupo(); }
                        if (e.key === "Escape") { setGrupoDropdownOpen(false); setEditingGrupo(false); }
                      }}
                      onBlur={() => { setTimeout(() => { setGrupoDropdownOpen(false); saveGrupo(); }, 150); }}
                      placeholder="Sin grupo"
                      className="text-xs bg-wr-surface border border-wr-amber/40 rounded px-1.5 py-0.5 text-wr-text w-36 focus:outline-none focus:border-wr-amber"
                    />
                    {savingGrupo && (
                      <div className="absolute right-1 top-1 w-3 h-3 border border-wr-amber border-t-transparent rounded-full animate-spin" />
                    )}
                    {/* Dropdown */}
                    {grupoDropdownOpen && (suggestions.length > 0 || grupoInput.trim()) && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a2035] border border-wr-border rounded-lg shadow-xl z-50 overflow-hidden">
                        {suggestions.map((g) => (
                          <button
                            key={g.id}
                            onMouseDown={(e) => { e.preventDefault(); selectGrupo(g.nombre); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-wr-text hover:bg-wr-amber/10 hover:text-wr-amber transition-colors flex items-center gap-2"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-wr-amber/50 flex-shrink-0" />
                            {g.nombre}
                          </button>
                        ))}
                        {grupoInput.trim() && !hasExactMatch && (
                          <button
                            onMouseDown={(e) => { e.preventDefault(); selectGrupo(grupoInput.trim()); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-wr-muted hover:bg-wr-surface2 transition-colors border-t border-wr-border flex items-center gap-2"
                          >
                            <span className="text-wr-blue">+</span>
                            Crear: <span className="text-wr-text font-medium">{grupoInput.trim()}</span>
                          </button>
                        )}
                        {grupoInput.trim() && (
                          <button
                            onMouseDown={(e) => { e.preventDefault(); selectGrupo(""); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-wr-red/70 hover:bg-wr-red/10 transition-colors border-t border-wr-border"
                          >
                            Quitar grupo
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    onClick={startEditGrupo}
                    className="text-xs text-wr-text hover:text-wr-amber transition-colors flex items-center gap-1 group"
                  >
                    {empresa.grupo ? (
                      <span>{empresa.grupo.nombre}</span>
                    ) : (
                      <span className="text-wr-hint italic">Sin grupo</span>
                    )}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
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
                  Señales BORME ({empresa.bormeAlertas.length})
                </SectionLabel>
                <div className="space-y-2">
                  {(expandBorme ? empresa.bormeAlertas : empresa.bormeAlertas.slice(0, 5)).map((a) => {
                    const cfg = getBormeTipo(a.tipoActo);
                    const contexto = bormeContexto(a.tipoActo, a.grupoInferido?.nombre);
                    return (
                      <div key={a.id} className="flex items-start gap-2 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${cfg.pill}`}>
                              {cfg.label}
                            </span>
                            {contexto && (
                              <span className="text-wr-muted text-[10px]">{contexto}</span>
                            )}
                          </div>
                          {a.descripcion && (
                            <p className="text-wr-muted leading-snug line-clamp-2 mt-0.5">
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
                    );
                  })}
                </div>
                {empresa.bormeAlertas.length > 5 && (
                  <button
                    onClick={() => setExpandBorme(!expandBorme)}
                    className="mt-2 text-[10px] text-wr-blue hover:underline"
                  >
                    {expandBorme
                      ? "Ver menos ↑"
                      : `Ver todas (${empresa.bormeAlertas.length}) ↓`}
                  </button>
                )}
              </div>
            </>
          )}

          {/* Spacer bottom */}
          <div className="h-4" />
        </div>
      </div>
    </aside>
  );
}
