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
  grupoId: number | null;
  rol: string | null;
  ultimaFecha: string;
  enPerimetro: boolean;
  ccaa: string | null;
  provincia: string | null;
  sector: string | null;
  web: string | null;
  ingresos: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  anioFinanciero: number | null;
}

interface PersonaCompartida {
  nombreNorm: string;
  numEmpresas: number;
  ultimaAparicion: string;
  empresas: PersonaEnEmpresa[];
}

// Flat row for the personas table
interface PersonaRow {
  nombreNorm: string;
  isFirstForPersona: boolean;
  numEmpresas: number;
  empresa: PersonaEnEmpresa;
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

// ─── Badge config ─────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<string, { label: string; pill: string }> = {
  fusion:              { label: "Fusión",       pill: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  adquisicion:         { label: "Adquisición",  pill: "bg-wr-blue/20 text-wr-blue border-wr-blue/30" },
  posible_adquisicion: { label: "Posible adq.", pill: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  cambio_denominacion: { label: "Rebranding",   pill: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
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

// ─── Row detail drawer ────────────────────────────────────────────────────────

function RowDetail({ item, onClose }: { item: OperacionItem; onClose: () => void }) {
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
                className="text-wr-blue hover:underline">Ver BORME ↗</a>
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

// ─── Señales M&A table row ────────────────────────────────────────────────────

function OperacionRow({
  item, isExpanded, onToggle, onVerPerfil,
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
        <td className="px-3 py-2.5 text-[11px] text-wr-hint whitespace-nowrap">
          {fmtFechaShort(item.fecha)}
        </td>
        <td className="px-3 py-2.5"><TipoPill tipo={item.efectiveTipo} /></td>
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
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </a>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 max-w-[180px]">
          <AdquirenteCell adquirente={item.adquirente} />
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-wr-text">
          {fmtM(item.empresa.ingresos)}
          {item.empresa.anioFinanciero && (
            <span className="text-wr-hint text-[9px] ml-1">{String(item.empresa.anioFinanciero).slice(2)}</span>
          )}
        </td>
        <td className={`px-3 py-2.5 text-right tabular-nums ${ebitdaColor(item.empresa.ebitdaPct)}`}>
          {fmtM(item.empresa.ebitda)}
          {item.empresa.ebitdaPct !== null && (
            <span className="ml-1 text-[9px] opacity-70">({fmtPct(item.empresa.ebitdaPct)})</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-wr-muted text-[10px]">
          {fmtPct(item.empresa.margenBrutoPct)}
        </td>
        <td className="px-3 py-2.5 text-center">
          {item.urlBorme ? (
            <a href={item.urlBorme} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-wr-hint hover:text-wr-blue text-[10px]">↗</a>
          ) : (
            <span className="text-wr-border">—</span>
          )}
        </td>
      </tr>
      {isExpanded && <RowDetail item={item} onClose={onToggle} />}
    </>
  );
}

// ─── Alertas personas table ───────────────────────────────────────────────────

function AlertasPersonasTable({
  rows,
  onVerPerfil,
}: {
  rows: PersonaRow[];
  onVerPerfil: (id: number) => void;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="bg-wr-surface border-b border-wr-border text-wr-hint">
          <th className="px-3 py-2 text-left font-medium">Persona</th>
          <th className="px-3 py-2 text-left font-medium">Empresa</th>
          <th className="px-3 py-2 text-left font-medium">Rol</th>
          <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Fecha</th>
          <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Ingresos</th>
          <th className="px-3 py-2 text-right font-medium">EBITDA</th>
          <th className="px-3 py-2 text-right font-medium text-[9px]">MB%</th>
          <th className="px-3 py-2 text-left font-medium">Grupo</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => {
          const isGroupStart = row.isFirstForPersona;
          const isOdd = idx % 2 === 0;
          return (
            <tr
              key={`${row.nombreNorm}-${row.empresa.empresaId}`}
              className={`border-b transition-colors text-xs ${
                isGroupStart
                  ? "border-t-2 border-t-wr-muted/20 border-b-wr-border"
                  : "border-wr-border/50"
              } ${isOdd ? "bg-wr-surface/30" : ""} hover:bg-wr-surface2`}
            >
              {/* Persona — shown only on first row of the group */}
              <td className="px-3 py-2 max-w-[160px]">
                {isGroupStart ? (
                  <div>
                    <span className="font-semibold text-wr-text text-[10px] tracking-wide">
                      {row.nombreNorm}
                    </span>
                    <span className="ml-2 text-[9px] text-wr-hint">
                      {row.numEmpresas} soc.
                    </span>
                  </div>
                ) : null}
              </td>
              {/* Empresa */}
              <td className="px-3 py-2 max-w-[200px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => onVerPerfil(row.empresa.empresaId)}
                    className="font-medium text-wr-text hover:text-wr-blue transition-colors truncate text-left"
                    title={row.empresa.empresaNombre}
                  >
                    {row.empresa.empresaNombre}
                  </button>
                  {row.empresa.enPerimetro && (
                    <span className="w-1.5 h-1.5 rounded-full bg-wr-blue flex-shrink-0" title="En perímetro" />
                  )}
                  {row.empresa.web && (
                    <a
                      href={row.empresa.web.startsWith("http") ? row.empresa.web : `https://${row.empresa.web}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-wr-hint hover:text-wr-blue transition-colors flex-shrink-0"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </a>
                  )}
                </div>
              </td>
              {/* Rol */}
              <td className="px-3 py-2 text-wr-muted text-[10px] whitespace-nowrap">
                {row.empresa.rol ? row.empresa.rol.replace(/_/g, " ") : "—"}
              </td>
              {/* Fecha */}
              <td className="px-3 py-2 text-[11px] text-wr-hint whitespace-nowrap">
                {fmtFechaShort(row.empresa.ultimaFecha)}
              </td>
              {/* Ingresos */}
              <td className="px-3 py-2 text-right tabular-nums text-wr-text">
                {fmtM(row.empresa.ingresos)}
                {row.empresa.anioFinanciero && (
                  <span className="text-wr-hint text-[9px] ml-1">
                    {String(row.empresa.anioFinanciero).slice(2)}
                  </span>
                )}
              </td>
              {/* EBITDA */}
              <td className={`px-3 py-2 text-right tabular-nums ${ebitdaColor(row.empresa.ebitdaPct)}`}>
                {fmtM(row.empresa.ebitda)}
                {row.empresa.ebitdaPct !== null && (
                  <span className="ml-1 text-[9px] opacity-70">
                    ({fmtPct(row.empresa.ebitdaPct)})
                  </span>
                )}
              </td>
              {/* MB% */}
              <td className="px-3 py-2 text-right tabular-nums text-wr-muted text-[10px]">
                {fmtPct(row.empresa.margenBrutoPct)}
              </td>
              {/* Grupo */}
              <td className="px-3 py-2">
                {row.empresa.grupoNombre ? (
                  <span className="text-[9px] text-wr-blue border border-wr-blue/30 px-1.5 py-0.5 rounded whitespace-nowrap">
                    {row.empresa.grupoNombre}
                  </span>
                ) : (
                  <span className="text-wr-border text-[10px]">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
  const [tiposActivos, setTiposActivos] = useState<Set<string>>(new Set(FILTER_TIPOS));
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<string>("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [personaSortKey, setPersonaSortKey] = useState<string>("ultimaAparicion");
  const [personaSortDir, setPersonaSortDir] = useState<"asc" | "desc">("desc");

  // Fetch señales
  useEffect(() => {
    setLoading(true);
    fetch("/api/borme/operaciones")
      .then((r) => r.json())
      .then((d) => { setItems(d.items ?? []); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  // Fetch personas (lazy)
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

  const togglePersonaSort = (key: string) => {
    if (personaSortKey === key) setPersonaSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setPersonaSortKey(key); setPersonaSortDir("desc"); }
  };

  const SortIcon = ({ k, activeKey, dir }: { k: string; activeKey: string; dir: "asc" | "desc" }) =>
    activeKey !== k
      ? <span className="text-wr-border ml-0.5">↕</span>
      : <span className="text-wr-blue ml-0.5">{dir === "asc" ? "↑" : "↓"}</span>;

  // ── Shared filter logic ──────────────────────────────────────────────────────
  function applyStoreFilters<T extends {
    empresa?: { enPerimetro?: boolean; ccaa?: string | null; provincia?: string | null; sector?: string | null; grupoId?: number | null; ingresos?: number | null };
    enPerimetro?: boolean; ccaa?: string | null; provincia?: string | null; sector?: string | null; grupoId?: number | null; ingresos?: number | null;
  }>(list: T[]): T[] {
    return list.filter((item) => {
      const e = "empresa" in item && item.empresa ? item.empresa : item;
      if (filtros.enPerimetro !== null && e.enPerimetro !== filtros.enPerimetro) return false;
      if (filtros.ccaa.length && (!e.ccaa || !filtros.ccaa.includes(e.ccaa))) return false;
      if (filtros.provincia.length && (!e.provincia || !filtros.provincia.includes(e.provincia))) return false;
      if (filtros.sector.length && (!e.sector || !(filtros.sector as string[]).includes(e.sector))) return false;
      if (filtros.grupoId.length && (e.grupoId === null || !filtros.grupoId.includes(e.grupoId!))) return false;
      if (filtros.ingresosMin > 0 && (e.ingresos === null || e.ingresos < filtros.ingresosMin)) return false;
      if (filtros.ingresosMax < Infinity && (e.ingresos === null || e.ingresos > filtros.ingresosMax)) return false;
      return true;
    });
  }

  // ── Filtered señales ─────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let result = items.filter((item) => tiposActivos.has(item.efectiveTipo));
    result = applyStoreFilters(result);
    if (fechaDesde) result = result.filter((i) => i.fecha >= fechaDesde);
    if (fechaHasta) result = result.filter((i) => i.fecha <= fechaHasta + "T23:59:59");
    return [...result].sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "fecha") { av = new Date(a.fecha).getTime(); bv = new Date(b.fecha).getTime(); }
      else if (sortKey === "ingresos") { av = a.empresa.ingresos ?? -Infinity; bv = b.empresa.ingresos ?? -Infinity; }
      else if (sortKey === "ebitda") { av = a.empresa.ebitdaPct ?? -Infinity; bv = b.empresa.ebitdaPct ?? -Infinity; }
      else return 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tiposActivos, filtros, fechaDesde, fechaHasta, sortKey, sortDir]);

  // ── Filtered personas (flat rows) ────────────────────────────────────────────
  const filteredPersonaRows = useMemo((): PersonaRow[] => {
    // Apply store filters to each empresa row
    let filtered = personas.map((p) => ({
      ...p,
      empresas: applyStoreFilters(
        p.empresas.map((e) => ({
          ...e,
          // adapt shape for applyStoreFilters (flat, not nested)
          enPerimetro: e.enPerimetro,
          ccaa: e.ccaa,
          provincia: e.provincia,
          sector: e.sector,
          grupoId: e.grupoId,
          ingresos: e.ingresos,
        }))
      ),
    })).filter((p) => p.empresas.length >= 2); // must still have 2+ empresas after filter

    // Date filter on ultimaAparicion
    if (fechaDesde) filtered = filtered.filter((p) => p.ultimaAparicion >= fechaDesde);
    if (fechaHasta) filtered = filtered.filter((p) => p.ultimaAparicion <= fechaHasta + "T23:59:59");

    // Sort personas
    filtered = [...filtered].sort((a, b) => {
      let av: number, bv: number;
      if (personaSortKey === "ultimaAparicion") {
        av = new Date(a.ultimaAparicion).getTime();
        bv = new Date(b.ultimaAparicion).getTime();
      } else if (personaSortKey === "numEmpresas") {
        av = a.numEmpresas; bv = b.numEmpresas;
      } else return 0;
      return personaSortDir === "asc" ? av - bv : bv - av;
    });

    // Flatten to rows
    const rows: PersonaRow[] = [];
    for (const p of filtered) {
      p.empresas.forEach((emp, idx) => {
        rows.push({
          nombreNorm: p.nombreNorm,
          isFirstForPersona: idx === 0,
          numEmpresas: p.empresas.length,
          empresa: emp,
        });
      });
    }
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, filtros, fechaDesde, fechaHasta, personaSortKey, personaSortDir]);

  const numPersonasFiltradas = useMemo(
    () => new Set(filteredPersonaRows.map((r) => r.nombreNorm)).size,
    [filteredPersonaRows]
  );

  // Stats señales
  const stats = useMemo(() => {
    const porTipo: Record<string, number> = {};
    for (const i of filteredItems) porTipo[i.efectiveTipo] = (porTipo[i.efectiveTipo] ?? 0) + 1;
    const gruposActivos = new Set(
      filteredItems.filter((i) => i.adquirente.tipo === "grupo_conocido").map((i) => i.adquirente.grupoNombre)
    ).size;
    return { porTipo, gruposActivos };
  }, [filteredItems]);

  // Active sidebar filter chips
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
        {/* Sub-tab toggle */}
        <div className="flex items-center gap-1 bg-wr-surface2 border border-wr-border rounded-md p-0.5">
          <button
            onClick={() => setSubVista("senales")}
            className={`px-3 py-1 text-xs rounded transition-colors ${subVista === "senales" ? "bg-wr-blue text-white" : "text-wr-muted hover:text-wr-text"}`}
          >
            Señales M&A
          </button>
          <button
            onClick={() => setSubVista("alertas_personas")}
            className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${subVista === "alertas_personas" ? "bg-wr-blue text-white" : "text-wr-muted hover:text-wr-text"}`}
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

        {/* Sidebar filter chips */}
        {filtrosAplicados.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-wr-hint">Filtros:</span>
            {filtrosAplicados.map((f) => (
              <span key={f} className="text-[10px] bg-wr-blue/10 text-wr-blue border border-wr-blue/20 px-1.5 py-0.5 rounded">{f}</span>
            ))}
          </div>
        )}

        {/* Tipo pills — señales only */}
        {subVista === "senales" && (
          <div className="flex items-center gap-1">
            {FILTER_TIPOS.map((t) => {
              const cfg = TIPO_CONFIG[t];
              const on = tiposActivos.has(t);
              return (
                <button key={t} onClick={() => toggleTipo(t)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${on ? cfg.pill : "bg-transparent border-wr-border text-wr-hint hover:border-wr-muted"}`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Sort options — personas only */}
        {subVista === "alertas_personas" && (
          <div className="flex items-center gap-2 text-[10px] text-wr-hint">
            <span>Ordenar por:</span>
            {(["ultimaAparicion", "numEmpresas"] as const).map((k) => (
              <button key={k} onClick={() => togglePersonaSort(k)}
                className={`px-2 py-0.5 rounded border transition-colors ${personaSortKey === k ? "border-wr-blue text-wr-blue bg-wr-blue/10" : "border-wr-border hover:border-wr-muted"}`}
              >
                {k === "ultimaAparicion" ? "Fecha" : "Nº empresas"}
                <SortIcon k={k} activeKey={personaSortKey} dir={personaSortDir} />
              </button>
            ))}
          </div>
        )}

        {/* Date range */}
        <div className="flex items-center gap-1.5 text-[10px] text-wr-hint">
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
            className="bg-wr-surface2 border border-wr-border rounded px-2 py-0.5 text-[10px] text-wr-text focus:outline-none focus:border-wr-blue"
            title="Desde"
          />
          <span>—</span>
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
            className="bg-wr-surface2 border border-wr-border rounded px-2 py-0.5 text-[10px] text-wr-text focus:outline-none focus:border-wr-blue"
            title="Hasta"
          />
          {(fechaDesde || fechaHasta) && (
            <button onClick={() => { setFechaDesde(""); setFechaHasta(""); }}
              className="text-wr-hint hover:text-wr-text" title="Quitar filtro fechas">×</button>
          )}
        </div>
      </div>

      {/* ── Description banner ── */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-wr-border/50 bg-wr-surface/40">
        {subVista === "senales" ? (
          <p className="text-[10px] text-wr-hint">
            <span className="font-medium text-wr-muted">Señales M&A</span>
            {" "}— Fusiones, adquisiciones y movimientos societarios detectados en el BORME para empresas del perímetro.
            Las filas en <span className="text-orange-300">naranja</span> indican posibles nuevas adquisiciones (persona conocida de un grupo detectada en empresa no mapeada aún).
            Haz clic en una fila para ver la descripción completa del acto.
          </p>
        ) : (
          <p className="text-[10px] text-wr-hint">
            <span className="font-medium text-wr-muted">Alertas personas</span>
            {" "}— Personas detectadas en actos de nombramiento de 2 o más sociedades distintas, no incluidas en los grupos ya identificados.
            Pueden indicar un consolidador activo no catalogado. Cada bloque agrupa las sociedades donde aparece la misma persona.
          </p>
        )}
      </div>

      {/* ── Stats bar ── */}
      <div className="flex-shrink-0 flex items-center gap-4 px-4 py-1.5 border-b border-wr-border bg-wr-surface/50 text-[10px] text-wr-muted flex-wrap">
        {subVista === "senales" && !loading && !error && (
          <>
            <span className="font-semibold text-wr-text">{filteredItems.length} señales</span>
            <span className="text-wr-border">·</span>
            {Object.entries(stats.porTipo).map(([tipo, n]) => (
              <span key={tipo}><span className="font-medium text-wr-text">{n}</span> {TIPO_CONFIG[tipo]?.label ?? tipo}</span>
            ))}
            <span className="text-wr-border">·</span>
            <span><span className="font-medium text-wr-blue">{stats.gruposActivos}</span> grupos activos</span>
          </>
        )}
        {subVista === "alertas_personas" && !loadingPersonas && !errorPersonas && (
          <>
            <span className="font-semibold text-wr-text">{numPersonasFiltradas} personas</span>
            <span className="text-wr-border">·</span>
            <span><span className="font-medium text-wr-text">{filteredPersonaRows.length}</span> apariciones en empresas</span>
          </>
        )}
        {filtrosAplicados.length > 0 && (
          <span className="text-wr-amber ml-auto">⬡ Filtros del panel activos</span>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* Señales M&A */}
        {subVista === "senales" && (
          <>
            {loading && <div className="flex items-center justify-center h-40"><p className="text-wr-muted text-sm animate-pulse">Cargando señales…</p></div>}
            {error && <div className="flex items-center justify-center h-40"><p className="text-red-400 text-sm">Error: {error}</p></div>}
            {!loading && !error && filteredItems.length === 0 && (
              <div className="flex items-center justify-center h-40"><p className="text-wr-muted text-sm">Sin señales para los filtros seleccionados.</p></div>
            )}
            {!loading && !error && filteredItems.length > 0 && (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-wr-surface border-b border-wr-border text-wr-hint">
                    <th className="px-3 py-2 text-left font-medium cursor-pointer hover:text-wr-text whitespace-nowrap" onClick={() => toggleSort("fecha")}>
                      Fecha <SortIcon k="fecha" activeKey={sortKey} dir={sortDir} />
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Empresa</th>
                    <th className="px-3 py-2 text-left font-medium">Adquirente</th>
                    <th className="px-3 py-2 text-right font-medium cursor-pointer hover:text-wr-text whitespace-nowrap" onClick={() => toggleSort("ingresos")}>
                      Ingresos <SortIcon k="ingresos" activeKey={sortKey} dir={sortDir} />
                    </th>
                    <th className="px-3 py-2 text-right font-medium cursor-pointer hover:text-wr-text whitespace-nowrap" onClick={() => toggleSort("ebitda")}>
                      EBITDA <SortIcon k="ebitda" activeKey={sortKey} dir={sortDir} />
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

        {/* Alertas personas */}
        {subVista === "alertas_personas" && (
          <>
            {loadingPersonas && <div className="flex items-center justify-center h-40"><p className="text-wr-muted text-sm animate-pulse">Analizando personas…</p></div>}
            {errorPersonas && <div className="flex items-center justify-center h-40"><p className="text-red-400 text-sm">{errorPersonas}</p></div>}
            {!loadingPersonas && !errorPersonas && filteredPersonaRows.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <p className="text-wr-muted text-sm">No se detectaron personas compartidas con los filtros actuales.</p>
              </div>
            )}
            {!loadingPersonas && !errorPersonas && filteredPersonaRows.length > 0 && (
              <AlertasPersonasTable rows={filteredPersonaRows} onVerPerfil={handleVerPerfil} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
