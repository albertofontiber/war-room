"use client";

import { useEffect, useState, useMemo } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type TipoVista = "cronologica" | "grupos";

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
  descripcion: string | null;
  urlBorme: string | null;
  leido: boolean;
  empresa: EmpresaOp;
  adquirente: Adquirente;
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

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function fmtMes(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

// ─── Badge tipoActo ───────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  fusion:              { label: "Fusión",           color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  adquisicion:         { label: "Adquisición",      color: "bg-wr-blue/20 text-wr-blue border-wr-blue/30" },
  cambio_denominacion: { label: "Rebranding",       color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  nombramiento_grupo:  { label: "Nombramiento",     color: "bg-green-500/20 text-green-300 border-green-500/30" },
};

function TipoBadge({ tipo }: { tipo: string }) {
  const cfg = TIPO_CONFIG[tipo] ?? { label: tipo, color: "bg-wr-surface2 text-wr-muted border-wr-border" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Adquirente badge ─────────────────────────────────────────────────────────

function AdquirenteBadge({ adquirente }: { adquirente: Adquirente }) {
  if (adquirente.tipo === "grupo_conocido") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-wr-blue flex-shrink-0" />
        <span className="text-xs font-semibold text-wr-blue">{adquirente.grupoNombre}</span>
        {adquirente.personaDetectada && (
          <span className="text-[10px] text-wr-muted">via {adquirente.personaDetectada.split(" ").slice(0, 2).join(" ")}</span>
        )}
      </div>
    );
  }
  if (adquirente.tipo === "empresa_extraida") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-wr-amber flex-shrink-0" />
        <span className="text-xs text-wr-amber font-medium">{adquirente.empresaNombre}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-wr-hint flex-shrink-0" />
      <span className="text-xs text-wr-hint italic">Comprador no identificado</span>
    </div>
  );
}

// ─── Tarjeta de operación ─────────────────────────────────────────────────────

function OperacionCard({ item, onVerPerfil }: { item: OperacionItem; onVerPerfil: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const desc = item.descripcion;
  const shortDesc = desc && desc.length > 140 ? desc.slice(0, 140) + "…" : desc;

  return (
    <div className="bg-wr-surface border border-wr-border rounded-lg p-4 hover:border-wr-muted/40 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <TipoBadge tipo={item.tipoActo} />
          <span className="text-[11px] text-wr-hint">{fmtFecha(item.fecha)}</span>
        </div>
        {item.urlBorme && (
          <a
            href={item.urlBorme}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-wr-muted hover:text-wr-blue transition-colors flex-shrink-0"
          >
            BORME ↗
          </a>
        )}
      </div>

      {/* Target empresa */}
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onVerPerfil(item.empresa.id)}
            className="text-sm font-semibold text-wr-text hover:text-wr-blue transition-colors text-left"
          >
            {item.empresa.nombre}
          </button>
          {item.empresa.web && (
            <a
              href={item.empresa.web.startsWith("http") ? item.empresa.web : `https://${item.empresa.web}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-wr-hint hover:text-wr-blue transition-colors"
              title="Web"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Adquirente */}
      <div className="mb-3">
        <span className="text-[10px] text-wr-hint uppercase tracking-wide mr-2">Adquirente:</span>
        <AdquirenteBadge adquirente={item.adquirente} />
      </div>

      {/* Financials */}
      {(item.empresa.ingresos !== null || item.empresa.ebitda !== null) && (
        <div className="flex items-center gap-4 mb-3 p-2 bg-wr-surface2 rounded-md">
          {item.empresa.ingresos !== null && (
            <div>
              <p className="text-[9px] text-wr-hint uppercase tracking-wide">Ingresos {item.empresa.anioFinanciero ?? ""}</p>
              <p className="text-xs font-semibold text-wr-text">{fmtM(item.empresa.ingresos)}</p>
            </div>
          )}
          {item.empresa.ebitda !== null && (
            <div>
              <p className="text-[9px] text-wr-hint uppercase tracking-wide">EBITDA</p>
              <p className="text-xs font-semibold text-wr-text">
                {fmtM(item.empresa.ebitda)}
                {item.empresa.ebitdaPct !== null && (
                  <span className="text-wr-muted font-normal ml-1">({fmtPct(item.empresa.ebitdaPct)})</span>
                )}
              </p>
            </div>
          )}
          {item.empresa.margenBruto !== null && (
            <div>
              <p className="text-[9px] text-wr-hint uppercase tracking-wide">Margen bruto</p>
              <p className="text-xs font-semibold text-wr-text">
                {fmtPct(item.empresa.margenBrutoPct)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Descripción */}
      {desc && (
        <div>
          <p className="text-[11px] text-wr-muted leading-relaxed">
            {expanded ? desc : shortDesc}
          </p>
          {desc.length > 140 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] text-wr-blue mt-1 hover:underline"
            >
              {expanded ? "Ver menos" : "Ver más"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Vista cronológica ────────────────────────────────────────────────────────

function VistaCronologica({ items, onVerPerfil }: { items: OperacionItem[]; onVerPerfil: (id: number) => void }) {
  // Group by month
  const grouped = useMemo(() => {
    const map = new Map<string, OperacionItem[]>();
    for (const item of items) {
      const mes = fmtMes(item.fecha);
      if (!map.has(mes)) map.set(mes, []);
      map.get(mes)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="space-y-6">
      {grouped.map(([mes, ops]) => (
        <div key={mes}>
          <h3 className="text-[11px] font-semibold text-wr-muted uppercase tracking-widest mb-3 capitalize">
            {mes}
          </h3>
          <div className="space-y-3">
            {ops.map((item) => (
              <OperacionCard key={item.id} item={item} onVerPerfil={onVerPerfil} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Vista por grupos ─────────────────────────────────────────────────────────

function VistaGrupos({ items, onVerPerfil }: { items: OperacionItem[]; onVerPerfil: (id: number) => void }) {
  const { grupos, desconocidos } = useMemo(() => {
    const grupoMap = new Map<string, { grupoId: number; ops: OperacionItem[] }>();
    const descMap = new Map<string, OperacionItem[]>();
    const sinIdentificar: OperacionItem[] = [];

    for (const item of items) {
      if (item.adquirente.tipo === "grupo_conocido") {
        const nombre = item.adquirente.grupoNombre!;
        if (!grupoMap.has(nombre)) {
          grupoMap.set(nombre, { grupoId: item.adquirente.grupoId!, ops: [] });
        }
        grupoMap.get(nombre)!.ops.push(item);
      } else if (item.adquirente.tipo === "empresa_extraida") {
        const nombre = item.adquirente.empresaNombre!;
        if (!descMap.has(nombre)) descMap.set(nombre, []);
        descMap.get(nombre)!.push(item);
      } else {
        sinIdentificar.push(item);
      }
    }

    const grupos = Array.from(grupoMap.entries())
      .map(([nombre, { grupoId, ops }]) => ({ nombre, grupoId, ops }))
      .sort((a, b) => b.ops.length - a.ops.length);

    const desconocidos = {
      porEmpresa: Array.from(descMap.entries())
        .map(([nombre, ops]) => ({ nombre, ops }))
        .sort((a, b) => b.ops.length - a.ops.length),
      sinIdentificar,
    };

    return { grupos, desconocidos };
  }, [items]);

  return (
    <div className="space-y-8">
      {/* Grupos conocidos */}
      {grupos.map(({ nombre, ops }) => (
        <section key={nombre}>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-2 h-2 rounded-full bg-wr-blue" />
            <h3 className="text-sm font-semibold text-wr-text">{nombre}</h3>
            <span className="text-[10px] text-wr-hint bg-wr-surface2 border border-wr-border px-2 py-0.5 rounded-full">
              {ops.length} señal{ops.length !== 1 ? "es" : ""}
            </span>
          </div>
          <div className="space-y-3">
            {ops.map((item) => (
              <OperacionCard key={item.id} item={item} onVerPerfil={onVerPerfil} />
            ))}
          </div>
        </section>
      ))}

      {/* Compradores no identificados con nombre extraído */}
      {desconocidos.porEmpresa.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2 h-2 rounded-full bg-wr-amber" />
            <h3 className="text-sm font-semibold text-wr-text">Compradores externos identificados</h3>
            <span className="text-[10px] text-wr-hint bg-wr-surface2 border border-wr-border px-2 py-0.5 rounded-full">
              {desconocidos.porEmpresa.reduce((s, e) => s + e.ops.length, 0)} señales
            </span>
          </div>
          <div className="space-y-4">
            {desconocidos.porEmpresa.map(({ nombre, ops }) => (
              <div key={nombre} className="border border-wr-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-wr-surface2 border-b border-wr-border">
                  <span className="text-xs font-semibold text-wr-amber">{nombre}</span>
                  <span className="text-[10px] text-wr-hint">{ops.length} adquisición{ops.length !== 1 ? "es" : ""}</span>
                </div>
                <div className="p-3 space-y-3">
                  {ops.map((item) => (
                    <OperacionCard key={item.id} item={item} onVerPerfil={onVerPerfil} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sin identificar */}
      {desconocidos.sinIdentificar.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-2 h-2 rounded-full bg-wr-hint" />
            <h3 className="text-sm font-semibold text-wr-muted">Comprador no identificado</h3>
            <span className="text-[10px] text-wr-hint bg-wr-surface2 border border-wr-border px-2 py-0.5 rounded-full">
              {desconocidos.sinIdentificar.length} señales
            </span>
          </div>
          <div className="space-y-3">
            {desconocidos.sinIdentificar.map((item) => (
              <OperacionCard key={item.id} item={item} onVerPerfil={onVerPerfil} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ items }: { items: OperacionItem[] }) {
  const stats = useMemo(() => {
    const porTipo = items.reduce<Record<string, number>>((acc, i) => {
      acc[i.tipoActo] = (acc[i.tipoActo] ?? 0) + 1;
      return acc;
    }, {});
    const gruposActivos = new Set(
      items
        .filter((i) => i.adquirente.tipo === "grupo_conocido")
        .map((i) => i.adquirente.grupoNombre)
    ).size;
    const desconocidos = items.filter((i) => i.adquirente.tipo !== "grupo_conocido").length;
    return { porTipo, gruposActivos, desconocidos };
  }, [items]);

  return (
    <div className="flex items-center gap-4 px-6 py-2.5 border-b border-wr-border bg-wr-surface/50 text-[11px] text-wr-muted flex-wrap">
      <span className="font-semibold text-wr-text">{items.length} operaciones</span>
      <span className="text-wr-border">·</span>
      {Object.entries(stats.porTipo).map(([tipo, n]) => (
        <span key={tipo}>
          <span className="font-medium text-wr-text">{n}</span>{" "}
          {TIPO_CONFIG[tipo]?.label ?? tipo}
        </span>
      ))}
      <span className="text-wr-border">·</span>
      <span>
        <span className="font-medium text-wr-blue">{stats.gruposActivos}</span> grupos activos
      </span>
      <span>
        <span className="font-medium text-wr-amber">{stats.desconocidos}</span> compradores a investigar
      </span>
    </div>
  );
}

// ─── Filtros de tipo ──────────────────────────────────────────────────────────

const TODOS_TIPOS = ["fusion", "adquisicion", "cambio_denominacion", "nombramiento_grupo"] as const;

function FiltrosTipo({
  activos,
  toggle,
}: {
  activos: Set<string>;
  toggle: (t: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TODOS_TIPOS.map((t) => {
        const cfg = TIPO_CONFIG[t];
        const on = activos.has(t);
        return (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-colors ${
              on ? cfg.color : "bg-transparent border-wr-border text-wr-hint hover:border-wr-muted hover:text-wr-muted"
            }`}
          >
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OperacionesBorme() {
  const seleccionarEmpresa = useWarRoomStore((s) => s.seleccionarEmpresa);
  const setVista = useWarRoomStore((s) => s.setVista);

  const [items, setItems] = useState<OperacionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoVista, setTipoVista] = useState<TipoVista>("cronologica");
  const [tiposActivos, setTiposActivos] = useState<Set<string>>(
    new Set(TODOS_TIPOS)
  );

  useEffect(() => {
    setLoading(true);
    fetch("/api/borme/operaciones")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  const filteredItems = useMemo(
    () => items.filter((i) => tiposActivos.has(i.tipoActo)),
    [items, tiposActivos]
  );

  const toggleTipo = (t: string) => {
    setTiposActivos((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size > 1) next.delete(t); // keep at least one
      } else {
        next.add(t);
      }
      return next;
    });
  };

  const handleVerPerfil = (id: number) => {
    seleccionarEmpresa(id);
    setVista("mapa");
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-wr-bg">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-wr-border bg-wr-surface flex items-center gap-4 flex-wrap">
        {/* Title */}
        <div>
          <h2 className="text-sm font-semibold text-wr-text">Operaciones M&amp;A</h2>
          <p className="text-[10px] text-wr-hint">Señales BORME — fusiones, adquisiciones y movimientos corporativos</p>
        </div>

        <div className="flex-1" />

        {/* Tipo filters */}
        <FiltrosTipo activos={tiposActivos} toggle={toggleTipo} />

        {/* View toggle */}
        <div className="flex items-center bg-wr-surface2 border border-wr-border rounded-md p-0.5">
          <button
            onClick={() => setTipoVista("cronologica")}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              tipoVista === "cronologica"
                ? "bg-wr-blue text-white"
                : "text-wr-muted hover:text-wr-text"
            }`}
          >
            Cronológico
          </button>
          <button
            onClick={() => setTipoVista("grupos")}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              tipoVista === "grupos"
                ? "bg-wr-blue text-white"
                : "text-wr-muted hover:text-wr-text"
            }`}
          >
            Por grupos
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      {!loading && !error && <StatsBar items={filteredItems} />}

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <p className="text-wr-muted text-sm animate-pulse">Cargando operaciones…</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-40">
            <p className="text-red-400 text-sm">Error: {error}</p>
          </div>
        )}

        {!loading && !error && filteredItems.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-wr-muted text-sm">No hay operaciones para los filtros seleccionados.</p>
          </div>
        )}

        {!loading && !error && filteredItems.length > 0 && (
          <div className="max-w-3xl mx-auto px-6 py-6">
            {tipoVista === "cronologica" ? (
              <VistaCronologica items={filteredItems} onVerPerfil={handleVerPerfil} />
            ) : (
              <VistaGrupos items={filteredItems} onVerPerfil={handleVerPerfil} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
