"use client";

import { useEffect, useMemo, useState } from "react";

export type PipelineFilters = {
  q: string;
  ccaa: string[];
  provincia: string[];
  sector: ("PCI" | "seguridad_electronica" | "mixto")[];
  owner: string | null;       // User.id
  finder: string | null;      // Finder.id
  conTarea: boolean;
  diasSinActividadMin: number | null;
};

export const EMPTY_FILTERS: PipelineFilters = {
  q: "",
  ccaa: [],
  provincia: [],
  sector: [],
  owner: null,
  finder: null,
  conTarea: false,
  diasSinActividadMin: null,
};

type Option = { value: string; label: string };

type Props = {
  filters: PipelineFilters;
  onChange: (next: PipelineFilters) => void;
  ccaaOptions: string[];
  provinciaOptions: string[];
  ownerOptions: Option[];
  finderOptions: Option[];
};

/**
 * Panel horizontal de filtros sobre el Kanban /pipeline. Diseño denso coherente
 * con la paleta dark del War Room.
 */
export default function PipelineFiltros({
  filters,
  onChange,
  ccaaOptions,
  provinciaOptions,
  ownerOptions,
  finderOptions,
}: Props) {
  const count = useMemo(() => {
    let n = 0;
    if (filters.q.trim()) n++;
    if (filters.ccaa.length) n++;
    if (filters.provincia.length) n++;
    if (filters.sector.length) n++;
    if (filters.owner) n++;
    if (filters.finder) n++;
    if (filters.conTarea) n++;
    if (filters.diasSinActividadMin != null) n++;
    return n;
  }, [filters]);

  const [ccaaOpen, setCcaaOpen] = useState(false);
  const [provinciaOpen, setProvinciaOpen] = useState(false);

  useEffect(() => {
    const handler = () => {
      setCcaaOpen(false);
      setProvinciaOpen(false);
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  function toggleInArray<K extends "ccaa" | "provincia" | "sector">(key: K, val: string) {
    const arr = filters[key] as string[];
    const next = arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
    onChange({ ...filters, [key]: next } as PipelineFilters);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* CCAA */}
      <MultiSelect
        label="CCAA"
        selected={filters.ccaa}
        options={ccaaOptions.map((c) => ({ value: c, label: c }))}
        open={ccaaOpen}
        onToggle={(e) => {
          e.stopPropagation();
          setCcaaOpen((v) => !v);
          setProvinciaOpen(false);
        }}
        onChange={(val) => toggleInArray("ccaa", val)}
        onClear={() => onChange({ ...filters, ccaa: [] })}
      />

      {/* Provincia */}
      <MultiSelect
        label="Provincia"
        selected={filters.provincia}
        options={provinciaOptions.map((p) => ({ value: p, label: p }))}
        open={provinciaOpen}
        onToggle={(e) => {
          e.stopPropagation();
          setProvinciaOpen((v) => !v);
          setCcaaOpen(false);
        }}
        onChange={(val) => toggleInArray("provincia", val)}
        onClear={() => onChange({ ...filters, provincia: [] })}
      />

      {/* Sector */}
      <div className="flex items-center bg-wr-surface2 border border-wr-border rounded-md p-0.5">
        {(["PCI", "seguridad_electronica", "mixto"] as const).map((s) => {
          const active = filters.sector.includes(s);
          const label = s === "seguridad_electronica" ? "Seg. Electr." : s === "mixto" ? "Mixto" : "PCI";
          return (
            <button
              key={s}
              onClick={() => toggleInArray("sector", s)}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                active ? "bg-wr-blue text-white" : "text-wr-muted hover:text-wr-text"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Owner */}
      <select
        value={filters.owner ?? ""}
        onChange={(e) => onChange({ ...filters, owner: e.target.value || null })}
        className="bg-wr-surface2 border border-wr-border rounded-md px-2 py-1 text-[10px] text-wr-muted focus:outline-none focus:border-wr-blue cursor-pointer"
      >
        <option value="">Owner: todos</option>
        {ownerOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Finder */}
      <select
        value={filters.finder ?? ""}
        onChange={(e) => onChange({ ...filters, finder: e.target.value || null })}
        className="bg-wr-surface2 border border-wr-border rounded-md px-2 py-1 text-[10px] text-wr-muted focus:outline-none focus:border-wr-blue cursor-pointer"
      >
        <option value="">Finder: todos</option>
        <option value="__none__">Sin finder</option>
        {finderOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Con tarea pendiente */}
      <label className="flex items-center gap-1.5 text-[10px] text-wr-muted cursor-pointer hover:text-wr-text bg-wr-surface2 border border-wr-border rounded-md px-2 py-1">
        <input
          type="checkbox"
          checked={filters.conTarea}
          onChange={(e) => onChange({ ...filters, conTarea: e.target.checked })}
          className="accent-wr-blue cursor-pointer"
        />
        Con tarea pendiente
      </label>

      {/* Días sin actividad mínimo */}
      <div className="flex items-center gap-1 bg-wr-surface2 border border-wr-border rounded-md px-2 py-1">
        <label className="text-[10px] text-wr-muted">Sin actividad ≥</label>
        <input
          type="number"
          min={0}
          value={filters.diasSinActividadMin ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              diasSinActividadMin: e.target.value ? Number(e.target.value) : null,
            })
          }
          placeholder="días"
          className="w-12 bg-transparent text-[10px] text-wr-text focus:outline-none placeholder:text-wr-hint"
        />
      </div>

      {count > 0 && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-[10px] text-wr-red hover:underline ml-1"
        >
          Limpiar ({count})
        </button>
      )}
    </div>
  );
}

function MultiSelect({
  label,
  selected,
  options,
  open,
  onToggle,
  onChange,
  onClear,
}: {
  label: string;
  selected: string[];
  options: Option[];
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onToggle}
        className={`text-[10px] rounded-md px-2 py-1 border transition-colors ${
          selected.length > 0
            ? "bg-wr-blue/15 text-wr-blue border-wr-blue/30"
            : "bg-wr-surface2 text-wr-muted border-wr-border hover:text-wr-text"
        }`}
      >
        {label}{selected.length > 0 ? `: ${selected.length}` : ""} ▾
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-wr-surface border border-wr-border rounded-lg shadow-xl z-50 overflow-hidden min-w-[180px] max-h-80 overflow-y-auto">
          <div className="px-2 py-1 border-b border-wr-border flex items-center justify-between sticky top-0 bg-wr-surface">
            <span className="text-[10px] text-wr-muted">{selected.length} seleccionadas</span>
            {selected.length > 0 && (
              <button
                onClick={onClear}
                className="text-[10px] text-wr-red hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>
          {options.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`w-full flex items-center gap-2 px-2 py-1 text-[11px] text-left transition-colors ${
                  checked ? "bg-wr-blue/10 text-wr-text" : "text-wr-muted hover:bg-wr-surface2 hover:text-wr-text"
                }`}
              >
                <span
                  className={`w-3 h-3 rounded border flex items-center justify-center text-[9px] ${
                    checked ? "bg-wr-blue border-wr-blue text-white" : "border-wr-border"
                  }`}
                >
                  {checked ? "✓" : ""}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
