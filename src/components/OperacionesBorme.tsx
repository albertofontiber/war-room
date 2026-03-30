"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubVista = "senales" | "alertas_personas";

interface Adquirente {
  tipo: "grupo_conocido" | "empresa_extraida" | "desconocido";
  grupoId?: number;
  grupoNombre?: string;
  empresaNombre?: string;
  personaDetectada?: string | null;
}

interface EmpresaOp {
  id: number;
  nombre: string;
  cif: string;
  web: string | null;
  grupoId: number | null;
  enPerimetro: boolean;
  ccaa: string | null;
  provincia: string | null;
  sector: string | null;
  ingresos: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  anioFinanciero: number | null;
}

interface OperacionItem {
  id: number;
  fecha: string;
  tipoActo: string;
  efectiveTipo: string;
  descripcion: string | null;
  urlBorme: string | null;
  leido: boolean;
  empresa: EmpresaOp;
  adquirente: Adquirente;
}

interface PersonaEnEmpresa {
  empresaId: number;
  empresaNombre: string;
  grupoNombre: string | null;
  rol: string | null;
  ultimaFecha: string;
}

interface PersonaCompartida {
  nombreNorm: string;
  numEmpresas: number;
  ultimaAparicion: string;
  empresas: PersonaEnEmpresa[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtM(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K€`;
  return `${v.toFixed(0)}€`;
}

function fmtPct(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(1)}%`;
}

function ebitdaColor(v: number | null): string {
  if (v === null) return "text-wr-muted";
  if (v >= 15) return "text-green-400";
  if (v >= 5) return "text-wr-text";
  if (v >= 0) return "text-yellow-400";
  return "text-red-400";
}

function fmtFechaShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtFechaFull(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Badge configuración ──────────────────────────────────────────────────────

const TIPO_CONFIG: Record<string, { label: string; pill: string }> = {
  fusion:              { label: "Fusión",          pill: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  adquisicion:         { label: "Adquisición",     pill: "bg-wr-blue/20 text-wr-blue border-wr-blue/30" },
  posible_adquisicion: { label: "Posible adq.",    pill: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  cambio_denominacion: { label: "Rebranding",      pill: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  nombramiento_grupo:  { label: "Nombramiento",    pill: "bg-green-500/20 text-green-300 border-green-500/30" },
};

const FILTER_TIPOS = ["fusion", "adquisicion", "posible_adquisicion", "cambio_denominacion"] as const;

function TipoPill({ tipo }: { tipo: string }) {
  const cfg = TIPO_CONFIG[tipo] ?? { label: tipo, pill: "bg-wr-surface2 text-wr-muted border-wr-border" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap ${cfg.pill}`}>
      {cfg.label}
    </span>
  );
}

// ─── Adquirente cell ──────────────────────────────────────────────────────────

function AdquirenteCell({ adquirente }: { adquirente: Adquirente }) {
  if (adquirente.tipo === "grupo_conocido") {
    return (
      <span className="text-wr-blue font-medium">
        {adquirente.grupoNombre}
        {adquirente.personaDetectada && (
          <span className="text-wr-hint font-normal ml-1 text-[9px]">
            via {adquirente.personaDetectada.split(" ").slice(0, 2).join(" ")}
          </span>
        )}
      </span>
    );
  }
  if (adquirente.tipo === "empresa_extraida") {
    return <span className="text-wr-amber text-[10px]">{adquirente.empresaNombre}</span>;
  }
  return <span className="text-wr-hint italic text-[10px]">—</span>;
}

// ─── Row detail drawer (expandable) ──────────────────────────────────────────

function RowDetail({
  item,
  onClose,
}: {
  item: OperacionItem;
  onClose: () => void;
}) {
  return (
    <tr>
      <td colSpan={8} className="bg-wr-surface2 border-b border-wr-border px-4 py-3">
        <div className="flex items-start gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-wr-muted leading-relaxed break-words">
              {item.descripcion ?? "Sin descripción"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 text-[10px] text-wr-hint">
            {item.empresa.ccaa && <span>{item.empresa.ccaa}</span>}
            {item.empresa.sector && <span>{item.empresa.sector}</span>}
            {item.urlBorme && (
              <a href={item.urlBorme} target="_blank" rel="noopener noreferrer"
                className="text-wr-blue hover:underline">
                Ver BORME ↗
              </a>
            )}
            <button onClick={onClose} className="text-wr-hint hover:text-wr-text ml-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main table row ───────────────────────────────────────────────────────────

function OperacionRow({
  item,
  isExpanded,
  onToggle,
  onVerPerfil,
}: {
  item: OperacionItem;
  isExpanded: boolean;
  onToggle: () => void;
  onVerPerfil: (id: number) => void;
}) {
  const isPosible = item.efectiveTipo === "posible_adquisicion";

  return (
    <>
      <tr
        onClick={onToggle}
        className={`group border-b transition-colors cursor-pointer text-xs ${
          isExpanded
            ? "bg-wr-surface2 border-wr-muted/30"
            : isPosible
            ? "border-wr-border bg-orange-500/5 hover:bg-orange-500/10"
            : "border-wr-border hover:bg-wr-surface2"
        }`}
      >
        {/* Fecha */}
        <td className="px-3 py-2.5 text-[11px] text-wr-hint whitespace-nowrap">
          {fmtFechaShort(item.fecha)}
        </td>

        {/* Tipo */}
        <td className="px-3 py-2.5">
          <TipoPill tipo={item.efectiveTipo} />
        </td>

        {/* Empresa */}
        <td className="px-3 py-2.5 max-w-[220px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={(e) => { e.stopPropagation(); onVerPerfil(item.empresa.id); }}
              className="font-medium text-wr-text hover:text-wr-blue transition-colors truncate text-left"
              title={item.empresa.nombre}
            >
              {item.empresa.nombre}
            </button>
            {item.empresa.enPerimetro && (
              <span className="w-1.5 h-1.5 rounded-full bg-wr-blue flex-shrink-0" title="En perímetro" />
            )}
            {item.empresa.web && (
              <a
                href={item.empresa.web.startsWith("http") ? item.empresa.web : `https://${item.empresa.web}`}
                target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-wr-hint hover:text-wr-blue transition-colors flex-shrink-0"
                title="Web"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </a>
            )}
          </div>
        </td>

        {/* Adquirente */}
        <td className="px-3 py-2.5 max-w-[180px]">
          <AdquirenteCell adquirente={item.adquirente} />
        </td>

        {/* Ingresos */}
        <td className="px-3 py-2.5 text-right tabular-nums text-wr-text">
          {fmtM(item.empresa.ingresos)}
          {item.empresa.anioFinanciero && (
            <span className="text-wr-hint text-[9px] ml-1">{String(item.empresa.anioFinanciero).slice(2)}</span>
          )}
        </td>

        {/* EBITDA */}
        <td className={`px-3 py-2.5 text-right tabular-nums ${ebitdaColor(item.empresa.ebitdaPct)}`}>
          {fmtM(item.empresa.ebitda)}
          {item.empresa.ebitdaPct !== null && (
            <span className="ml-1 text-[9px] opacity-70">({fmtPct(item.empresa.ebitdaPct)})</span>
          )}
        </td>

        {/* MB% */}
        <td className="px-3 py-2.5 text-right tabular-nums text-wr-muted text-[10px]">
          {fmtPct(item.empresa.margenBrutoPct)}
        </td>

        {/* BORME link */}
        <td className="px-3 py-2.5 text-center">
          {item.urlBorme ? (
            <a
              href={item.urlBorme}
              target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-wr-hint hover:text-wr-blue text-[10px]"
              title="Abrir BORME"
            >↗</a>
          ) : (
            <span className="text-wr-border">—</span>
          )}
        </td>
      </tr>

      {isExpanded && (
        <RowDetail item={item} onClose={onToggle} />
      )}
    </>
  );
}

// ─── Alertas personas ─────────────────────────────────────────────────────────

function AlertasPersonas({
  personas,
  loading,
  error,
  onVerPerfil,
}: {
  personas: PersonaCompartida[];
  loading: boolean;
  error: string | null;
  onVerPerfil: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-wr-muted text-sm animate-pulse">Analizando personas…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }
  if (personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <p className="text-wr-muted text-sm">No se han detectado personas compartidas entre empresas.</p>
        <p className="text-wr-hint text-xs">Las alertas aparecen cuando una persona no identificada aparece en 2+ sociedades distintas.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
      <div className="text-[11px] text-wr-hint bg-wr-surface border border-wr-border/60 rounded-lg px-4 py-2.5">
        <span className="font-semibold text-wr-amber">⚠ {personas.length} persona{personas.length !== 1 ? "s" : ""} detectada{personas.length !== 1 ? "s" : ""}</span>
        {" "}en 2+ sociedades distintas (excluidas personas ya identificadas en grupos conocidos).
        Pueden indicar un nuevo grupo consolidador no catalogado aún.
      </div>

      {personas.map((persona) => (
        <div key={persona.nombreNorm} className="bg-wr-surface border border-wr-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-wr-border bg-wr-surface2">
            <div>
              <span className="text-sm font-semibold text-wr-text tracking-wide">{persona.nombreNorm}</span>
              <span className="ml-3 text-[10px] text-wr-hint bg-wr-border/30 px-2 py-0.5 rounded-full">
                {persona.numEmpresas} sociedades
              </span>
            </div>
            <span className="text-[10px] text-wr-hint">
              Última aparición: {fmtFechaFull(persona.ultimaAparicion)}
            </span>
          </div>
          <div className="divide-y divide-wr-border/40">
            {persona.empresas.map((emp) => (
              <div key={emp.empresaId} className="flex items-center justify-between px-4 py-2.5 hover:bg-wr-surface2 transition-colors">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onVerPerfil(emp.empresaId)}
                    className="text-xs font-medium text-wr-text hover:text-wr-blue transition-colors"
                  >
                    {emp.empresaNombre}
                  </button>
                  {emp.grupoNombre && (
                    <span className="text-[9px] text-wr-blue border border-wr-blue/30 px-1.5 py-0.5 rounded">
                      {emp.grupoNombre}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-wr-hint">
                  {emp.rol && <span>{emp.rol.replace(/_/g, " ")}</span>}
                  <span>{fmtFechaShort(emp.ultimaFecha)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OperacionesBorme() {
  const seleccionarEmpresa = useWarRoomStore((s) => s.seleccionarEmpresa);
  const setVista = useWarRoomStore((s) => s.setVista);
  const filtros = useWarRoomStore((s) => s.filtros);

  const [items, setItems] = useState<OperacionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [personas, setPersonas] = useState<PersonaCompartida[]>([]);
  const [loadingPersonas, setLoadingPersonas] = useState(false);
  const [errorPersonas, setErrorPersonas] = useState<string | null>(null);

  const [subVista, setSubVista] = useState<SubVista>("senales");
  const [tiposActivos, setTiposActivos] = useState<Set<string>>(
    new Set(FILTER_TIPOS)
  );
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<string>("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Fetch operaciones
  useEffect(() => {
    setLoading(true);
    fetch("/api/borme/operaciones")
      .then((r) => r.json())
      .then((d) => { setItems(d.items ?? []); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  // Fetch personas compartidas (lazy — solo cuando se abre la tab)
  useEffect(() => {
    if (subVista !== "alertas_personas" || personas.length > 0 || loadingPersonas) return;
    setLoadingPersonas(true);
    fetch("/api/borme/personas-compartidas")
      .then((r) => r.json())
      .then((d) => { setPersonas(d.personas ?? []); setLoadingPersonas(false); })
      .catch((e) => { setErrorPersonas(String(e)); setLoadingPersonas(false); });
  }, [subVista, personas.length, loadingPersonas]);

  const handleVerPerfil = useCallback((id: number) => {
    seleccionarEmpresa(id);
    setVista("mapa");
  }, [seleccionarEmpresa, setVista]);

  const toggleTipo = (t: string) => {
    setTiposActivos((prev) => {
      const next = new Set(prev);
      if (next.has(t)) { if (next.size > 1) next.delete(t); }
      else next.add(t);
      return next;
    });
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ k }: { k: string }) => {
    if (sortKey !== k) return <span className="text-wr-border ml-0.5">↕</span>;
    return <span className="text-wr-blue ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  // Aplicar filtros del sidebar + tipo + fecha
  const filteredItems = useMemo(() => {
    let result = items.filter((item) => tiposActivos.has(item.efectiveTipo));

    // Filtros de store
    if (filtros.enPerimetro !== null) {
      result = result.filter((i) => i.empresa.enPerimetro === filtros.enPerimetro);
    }
    if (filtros.ccaa.length) {
      result = result.filter((i) => i.empresa.ccaa && filtros.ccaa.includes(i.empresa.ccaa));
    }
    if (filtros.provincia.length) {
      result = result.filter((i) => i.empresa.provincia && filtros.provincia.includes(i.empresa.provincia));
    }
    if (filtros.sector.length) {
      result = result.filter((i) => i.empresa.sector && (filtros.sector as string[]).includes(i.empresa.sector));
    }
    if (filtros.grupoId.length) {
      result = result.filter((i) => i.empresa.grupoId !== null && filtros.grupoId.includes(i.empresa.grupoId));
    }
    if (filtros.ingresosMin > 0) {
      result = result.filter((i) => i.empresa.ingresos !== null && i.empresa.ingresos >= filtros.ingresosMin);
    }
    if (filtros.ingresosMax < Infinity) {
      result = result.filter((i) => i.empresa.ingresos !== null && i.empresa.ingresos <= filtros.ingresosMax);
    }

    // Filtro fecha
    if (fechaDesde) {
      result = result.filter((i) => i.fecha >= fechaDesde);
    }
    if (fechaHasta) {
      result = result.filter((i) => i.fecha <= fechaHasta + "T23:59:59");
    }

    // Ordenar
    result = [...result].sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "fecha":
          av = new Date(a.fecha).getTime();
          bv = new Date(b.fecha).getTime();
          break;
        case "ingresos":
          av = a.empresa.ingresos ?? -Infinity;
          bv = b.empresa.ingresos ?? -Infinity;
          break;
        case "ebitda":
          av = a.empresa.ebitdaPct ?? -Infinity;
          bv = b.empresa.ebitdaPct ?? -Infinity;
          break;
        default:
          return 0;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return result;
  }, [items, tiposActivos, filtros, fechaDesde, fechaHasta, sortKey, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const porTipo: Record<string, number> = {};
    for (const i of filteredItems) {
      porTipo[i.efectiveTipo] = (porTipo[i.efectiveTipo] ?? 0) + 1;
    }
    const gruposActivos = new Set(
      filteredItems
        .filter((i) => i.adquirente.tipo === "grupo_conocido")
        .map((i) => i.adquirente.grupoNombre)
    ).size;
    return { porTipo, gruposActivos };
  }, [filteredItems]);

  // Active sidebar filters chip
  const filtrosAplicados = useMemo(() => {
    const chips: string[] = [];
    if (filtros.enPerimetro !== null) chips.push(filtros.enPerimetro ? "En perímetro" : "Fuera perímetro");
    if (filtros.ccaa.length) chips.push(`CCAA: ${filtros.ccaa.join(", ")}`);
    if (filtros.provincia.length) chips.push(`Prov: ${filtros.provincia.join(", ")}`);
    if (filtros.sector.length) chips.push(`Sector: ${filtros.sector.join(", ")}`);
    if (filtros.grupoId.length) chips.push(`${filtros.grupoId.length} grupo(s)`);
    if (filtros.ingresosMin > 0 || filtros.ingresosMax < Infinity) chips.push("Ingresos");
    return chips;
  }, [filtros]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-wr-bg">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-wr-border bg-wr-surface flex items-center gap-3 flex-wrap">
        {/* Title + sub-tabs */}
        <div className="flex items-center gap-1 bg-wr-surface2 border border-wr-border rounded-md p-0.5">
          <button
            onClick={() => setSubVista("senales")}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              subVista === "senales" ? "bg-wr-blue text-white" : "text-wr-muted hover:text-wr-text"
            }`}
          >
            Señales M&A
          </button>
          <button
            onClick={() => setSubVista("alertas_personas")}
            className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
              subVista === "alertas_personas" ? "bg-wr-blue text-white" : "text-wr-muted hover:text-wr-text"
            }`}
          >
            Alertas personas
            {personas.length > 0 && (
              <span className={`text-[9px] font-bold px-1 rounded ${subVista === "alertas_personas" ? "bg-white/20" : "bg-wr-amber/20 text-wr-amber"}`}>
                {personas.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1" />

        {subVista === "senales" && (
          <>
            {/* Sidebar filter chips */}
            {filtrosAplicados.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-wr-hint">Filtros:</span>
                {filtrosAplicados.map((f) => (
                  <span key={f} className="text-[10px] bg-wr-blue/10 text-wr-blue border border-wr-blue/20 px-1.5 py-0.5 rounded">
                    {f}
                  </span>
                ))}
              </div>
            )}

            {/* Tipo pills */}
            <div className="flex items-center gap-1">
              {FILTER_TIPOS.map((t) => {
                const cfg = TIPO_CONFIG[t];
                const on = tiposActivos.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTipo(t)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                      on ? cfg.pill : "bg-transparent border-wr-border text-wr-hint hover:border-wr-muted"
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5 text-[10px] text-wr-hint">
              <span>Desde</span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="bg-wr-surface2 border border-wr-border rounded px-2 py-0.5 text-[10px] text-wr-text focus:outline-none focus:border-wr-blue"
              />
              <span>hasta</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="bg-wr-surface2 border border-wr-border rounded px-2 py-0.5 text-[10px] text-wr-text focus:outline-none focus:border-wr-blue"
              />
              {(fechaDesde || fechaHasta) && (
                <button
                  onClick={() => { setFechaDesde(""); setFechaHasta(""); }}
                  className="text-wr-hint hover:text-wr-text"
                  title="Quitar filtro de fechas"
                >×</button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Stats bar (senales only) ── */}
      {subVista === "senales" && !loading && !error && (
        <div className="flex-shrink-0 flex items-center gap-4 px-4 py-1.5 border-b border-wr-border bg-wr-surface/50 text-[10px] text-wr-muted flex-wrap">
          <span className="font-semibold text-wr-text">{filteredItems.length} señales</span>
          <span className="text-wr-border">·</span>
          {Object.entries(stats.porTipo).map(([tipo, n]) => (
            <span key={tipo}>
              <span className="font-medium text-wr-text">{n}</span>{" "}
              {TIPO_CONFIG[tipo]?.label ?? tipo}
            </span>
          ))}
          <span className="text-wr-border">·</span>
          <span><span className="font-medium text-wr-blue">{stats.gruposActivos}</span> grupos activos</span>
          {filtrosAplicados.length > 0 && (
            <span className="text-wr-amber">⬡ Filtros del panel activos</span>
          )}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {subVista === "alertas_personas" ? (
          <AlertasPersonas
            personas={personas}
            loading={loadingPersonas}
            error={errorPersonas}
            onVerPerfil={handleVerPerfil}
          />
        ) : (
          <>
            {loading && (
              <div className="flex items-center justify-center h-40">
                <p className="text-wr-muted text-sm animate-pulse">Cargando señales…</p>
              </div>
            )}
            {error && (
              <div className="flex items-center justify-center h-40">
                <p className="text-red-400 text-sm">Error: {error}</p>
              </div>
            )}
            {!loading && !error && filteredItems.length === 0 && (
              <div className="flex items-center justify-center h-40">
                <p className="text-wr-muted text-sm">Sin señales para los filtros seleccionados.</p>
              </div>
            )}
            {!loading && !error && filteredItems.length > 0 && (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-wr-surface border-b border-wr-border text-wr-hint">
                    <th
                      className="px-3 py-2 text-left font-medium cursor-pointer hover:text-wr-text whitespace-nowrap"
                      onClick={() => toggleSort("fecha")}
                    >
                      Fecha <SortIcon k="fecha" />
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Empresa</th>
                    <th className="px-3 py-2 text-left font-medium">Adquirente</th>
                    <th
                      className="px-3 py-2 text-right font-medium cursor-pointer hover:text-wr-text whitespace-nowrap"
                      onClick={() => toggleSort("ingresos")}
                    >
                      Ingresos <SortIcon k="ingresos" />
                    </th>
                    <th
                      className="px-3 py-2 text-right font-medium cursor-pointer hover:text-wr-text whitespace-nowrap"
                      onClick={() => toggleSort("ebitda")}
                    >
                      EBITDA <SortIcon k="ebitda" />
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-[9px]">MB%</th>
                    <th className="px-3 py-2 text-center font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <OperacionRow
                      key={item.id}
                      item={item}
                      isExpanded={expandedId === item.id}
                      onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      onVerPerfil={handleVerPerfil}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
