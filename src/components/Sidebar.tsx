"use client";

import { useMemo, useState } from "react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { fmt, fmtCompactMoney, fmtM } from "@/lib/format";
import { getSelectionStats } from "@/lib/filtros";
import { FILTROS_DEFAULT } from "@/types";
import type { DealStage, Sector } from "@/types";
import {
  ETIQUETA_HABILITACION,
  HABILITACIONES,
} from "@/lib/policia/habilitaciones";

// ─── Range slider de dos thumbs ───────────────────────────────────────────

interface RangeFiltroProps {
  label: string;
  displayMax: number;          // máximo del slider en pantalla
  step: number;
  valueMin: number;
  valueMax: number;            // puede ser Infinity
  useInfinity?: boolean;       // cuando el thumb llega al tope → almacena Infinity
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
  formatMin: (v: number) => string;
  formatMax: (v: number) => string;  // gestiona Infinity si procede
}

function RangeSliderFiltro({
  label,
  displayMax,
  step,
  valueMin,
  valueMax,
  useInfinity = false,
  onChangeMin,
  onChangeMax,
  formatMin,
  formatMax,
}: RangeFiltroProps) {
  const sliderMax = useInfinity && valueMax === Infinity ? displayMax : Math.min(valueMax, displayMax);

  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex justify-between text-[10px] mb-2.5 px-0.5">
        <span className="text-wr-blue font-medium">{formatMin(valueMin)}</span>
        <span className="text-wr-blue font-medium">{formatMax(valueMax)}</span>
      </div>
      <SliderPrimitive.Root
        value={[valueMin, sliderMax]}
        min={0}
        max={displayMax}
        step={step}
        minStepsBetweenValues={1}
        thumbAlignment="edge"
        onValueChange={(vals) => {
          const [newMin, newMax] = vals as readonly number[];
          onChangeMin(newMin);
          onChangeMax(useInfinity && newMax >= displayMax ? Infinity : newMax);
        }}
        className="w-full"
      >
        <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none h-5">
          <SliderPrimitive.Track className="relative grow rounded-full h-[3px] bg-[#1e293b]">
            <SliderPrimitive.Indicator className="h-full bg-wr-blue rounded-full" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block w-3 h-3 rounded-full bg-white border-2 border-wr-blue shadow cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-wr-blue/40" />
          <SliderPrimitive.Thumb className="block w-3 h-3 rounded-full bg-white border-2 border-wr-blue shadow cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-wr-blue/40" />
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-wr-muted uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

type PillColor = "blue" | "sky" | "violet" | "green" | "amber" | "orange" | "red" | "gray";

function TogglePill({
  active,
  onClick,
  children,
  color = "blue",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: PillColor;
}) {
  const base = "max-lg:tap-target-h px-2 py-1 rounded text-[11px] border transition-colors";
  const inactive = "bg-wr-surface2 text-wr-muted border-wr-border hover:border-wr-muted";

  if (!active) {
    return (
      <button onClick={onClick} className={`${base} ${inactive}`}>
        {children}
      </button>
    );
  }

  // Fully explicit class strings — Tailwind scanner can statically detect all of these
  const activeClass =
    color === "green"   ? "bg-wr-green/20 text-wr-green border-wr-green/40" :
    color === "amber"   ? "bg-wr-amber/20 text-wr-amber border-wr-amber/40" :
    color === "orange"  ? "bg-orange-500/20 text-orange-400 border-orange-500/40" :
    color === "red"     ? "bg-wr-red/20 text-wr-red border-wr-red/40" :
    color === "gray"    ? "bg-wr-surface2 text-wr-muted border-wr-muted" :
    color === "sky"     ? "bg-sky-400/20 text-sky-400 border-sky-400/40" :
    color === "violet"  ? "bg-violet-500/20 text-violet-400 border-violet-500/40" :
                          "bg-wr-blue/20 text-wr-blue border-wr-blue/40"; // blue (default)

  return (
    <button onClick={onClick} className={`${base} ${activeClass}`}>
      {children}
    </button>
  );
}

function StatCard({
  value,
  label,
  colorClass,
  className = "",
  title,
}: {
  value: number | string;
  label: string;
  colorClass: string;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={`bg-wr-surface2 rounded-lg p-3 border border-wr-border ${className}`}
      title={title}
    >
      <div className={`text-2xl font-bold leading-none ${colorClass}`}>{value}</div>
      <div className="text-wr-muted text-[10px] mt-1 leading-tight">{label}</div>
    </div>
  );
}

// ─── Checklist multi-select compacto ─────────────────────────────────────

function FilterChecklist({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchable = false,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const visible = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>{label}</SectionLabel>
        {selected.length > 0 && (
          <button
            onClick={onClear}
            className="max-lg:tap-target-h text-[10px] text-wr-hint hover:text-wr-amber transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>
      {searchable && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Buscar ${label.toLowerCase()}…`}
          className="max-lg:tap-target-h w-full mb-1.5 px-2 py-1 text-[11px] bg-wr-surface2 border border-wr-border rounded text-wr-text placeholder:text-wr-hint outline-none focus:border-wr-blue/50 transition-colors"
        />
      )}
      <div className="max-h-[140px] overflow-y-auto space-y-0.5 pr-0.5">
        {visible.length === 0 && (
          <p className="text-[10px] text-wr-hint py-1 text-center">Sin resultados</p>
        )}
        {visible.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`max-lg:tap-target-h w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] transition-colors ${
                active
                  ? "bg-wr-blue/15 text-wr-blue"
                  : "text-wr-muted hover:bg-wr-surface2 hover:text-wr-text"
              }`}
            >
              <span className={`w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                active ? "bg-wr-blue border-wr-blue" : "border-wr-border"
              }`}>
                {active && (
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" />
                  </svg>
                )}
              </span>
              <span className="truncate">{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────

/**
 * Wrapper para uso en desktop: aside de 260px con borde derecho.
 * El cuerpo (header + filtros + stats) está en `<SidebarContent />` para
 * poder reutilizarlo dentro del drawer mobile sin duplicar lógica.
 */
export default function Sidebar() {
  return (
    <aside className="w-[260px] flex-shrink-0 bg-wr-surface text-wr-text border-r border-wr-border flex flex-col overflow-hidden">
      <SidebarContent />
    </aside>
  );
}

/**
 * Cuerpo del sidebar (header con counter + chips activos + secciones de
 * filtros + stat cards). Sin wrapper visual; el consumer decide cómo
 * envolverlo (aside fijo en desktop, drawer en mobile).
 */
export function SidebarContent({
  scroll = true,
  showHeader = true,
}: {
  scroll?: boolean;
  showHeader?: boolean;
} = {}) {
  const {
    filtros,
    setFiltro,
    toggleFiltroArray,
    resetFiltros,
    empresasGeoJSON,
    searchQuery,
    getAvailableCCAA,
    getAvailableProvincias,
    getAvailableGrupos,
  } = useWarRoomStore();

  const availableCCAA = getAvailableCCAA();
  const availableProvincias = getAvailableProvincias();
  const availableGrupos = getAvailableGrupos();

  // ── Stats derivados del GeoJSON (sin filtro) ──────────────────────────
  const stats = useMemo(() => {
    if (!empresasGeoJSON) return { total: 0, enPerimetro: 0, bormeAlertas: 0 };
    let enPerimetro = 0, bormeAlertas = 0;
    for (const f of empresasGeoJSON) {
      const p = f.properties;
      if (p.enPerimetro) enPerimetro++;
      if (p.hasBormeReciente) bormeAlertas++;
    }
    return { total: empresasGeoJSON.length, enPerimetro, bormeAlertas };
  }, [empresasGeoJSON]);

  // El fetch de /api/empresas vive en Navbar (hydrateEmpresas, race-safe).
  // Sidebar consume `empresasGeoJSON` del store sin hacer fetch propio.

  const selectionStats = useMemo(
    () => getSelectionStats(empresasGeoJSON, filtros, searchQuery),
    [empresasGeoJSON, filtros, searchQuery],
  );
  const visiblesCount = selectionStats.count;


  // ── Chips para filtros activos ────────────────────────────────────────
  const activeChips = useMemo(() => {
    const chips: { label: string; remove: () => void }[] = [];

    if (filtros.enPerimetro !== null) {
      chips.push({
        label: filtros.enPerimetro ? "En perímetro" : "Fuera perímetro",
        remove: () => setFiltro("enPerimetro", null),
      });
    }
    filtros.ccaa.forEach((v) =>
      chips.push({ label: `CCAA: ${v}`, remove: () => toggleFiltroArray("ccaa", v) })
    );
    filtros.provincia.forEach((v) =>
      chips.push({ label: `Prov: ${v}`, remove: () => toggleFiltroArray("provincia", v) })
    );
    filtros.sector.forEach((v) => {
      const lbl = v === "PCI" ? "PCI" : v === "seguridad_electronica" ? "Seg. El." : "Mixto";
      chips.push({ label: `Sector: ${lbl}`, remove: () => toggleFiltroArray("sector", v) });
    });
    filtros.grupoId.forEach((v) => {
      // sentinel 0 = "sin grupo"
      const label = v === 0
        ? "Sin grupo"
        : `Grupo: ${availableGrupos.find((g) => g.id === v)?.nombre ?? v}`;
      chips.push({ label, remove: () => toggleFiltroArray("grupoId", v) });
    });
    filtros.crmStage.forEach((v) => {
      const lbls: Record<string, string> = {
        identificado:    "Identificado",
        contactado:      "Contactado",
        primera_reunion: "1ª reunión",
        analisis:        "Análisis",
        "LOI enviada":   "LOI enviada",
        execution:       "Ejecución",
        portfolio:       "Portfolio",
        on_hold:         "On hold",
        muerto:          "Muerto",
      };
      chips.push({ label: `CRM: ${lbls[v] ?? v}`, remove: () => toggleFiltroArray("crmStage", v) });
    });
    if (filtros.cepreven !== null) {
      chips.push({
        label:
          filtros.cepreven === "ninguna"
            ? "Sin Cepreven"
            : filtros.cepreven === "cualquiera"
              ? "Cepreven"
              : `Cepreven: ${filtros.cepreven}`,
        remove: () => setFiltro("cepreven", null),
      });
    }
    if (filtros.aerme !== null) {
      chips.push({
        label: `Aerme: ${filtros.aerme ? "sí" : "no"}`,
        remove: () => setFiltro("aerme", null),
      });
    }
    for (const codigo of filtros.habilitaciones) {
      const ambito =
        filtros.habilitacionAmbito === "E"
          ? " estatal"
          : filtros.habilitacionAmbito === "A"
            ? " autonómica"
            : "";
      chips.push({
        label: `${ETIQUETA_HABILITACION[codigo] ?? codigo}${ambito}`,
        remove: () => toggleFiltroArray("habilitaciones", codigo),
      });
    }
    if (
      filtros.ingresosMin > FILTROS_DEFAULT.ingresosMin ||
      filtros.ingresosMax < FILTROS_DEFAULT.ingresosMax
    ) {
      const maxLabel = filtros.ingresosMax === Infinity ? "∞" : fmtM(filtros.ingresosMax);
      chips.push({
        label: `Ingresos: ${fmtM(filtros.ingresosMin)}–${maxLabel}`,
        remove: () => {
          setFiltro("ingresosMin", FILTROS_DEFAULT.ingresosMin);
          setFiltro("ingresosMax", FILTROS_DEFAULT.ingresosMax);
        },
      });
    }
    if (
      filtros.margenBrutoMin > FILTROS_DEFAULT.margenBrutoMin ||
      filtros.margenBrutoMax < FILTROS_DEFAULT.margenBrutoMax
    ) {
      chips.push({
        label: `GM: ${filtros.margenBrutoMin}–${filtros.margenBrutoMax}%`,
        remove: () => {
          setFiltro("margenBrutoMin", FILTROS_DEFAULT.margenBrutoMin);
          setFiltro("margenBrutoMax", FILTROS_DEFAULT.margenBrutoMax);
        },
      });
    }
    if (
      filtros.ebitdaMin > FILTROS_DEFAULT.ebitdaMin ||
      filtros.ebitdaMax < FILTROS_DEFAULT.ebitdaMax
    ) {
      const eMax = filtros.ebitdaMax === Infinity ? "∞" : `${filtros.ebitdaMax}%`;
      chips.push({
        label: `EBITDA: ${filtros.ebitdaMin}%–${eMax}`,
        remove: () => {
          setFiltro("ebitdaMin", FILTROS_DEFAULT.ebitdaMin);
          setFiltro("ebitdaMax", FILTROS_DEFAULT.ebitdaMax);
        },
      });
    }
    return chips;
  }, [filtros, setFiltro, toggleFiltroArray, availableGrupos]);

  // ─────────────────────────────────────────────────────────────────────

  return (
    <div
      className={`bg-wr-surface text-wr-text ${
        // En desktop SidebarContent gestiona su propio scroll (aside de altura
        // fija). Embebido en el drawer mobile (scroll={false}) fluye en altura
        // natural y el scroll lo lleva el drawer completo — así no queda una
        // franja mínima scrollable bajo la navegación.
        scroll ? "flex-1 flex flex-col min-h-0" : ""
      }`}
    >

      {/* ── Header ── */}
      {showHeader && (
        <div className="px-4 py-3 border-b border-wr-border bg-wr-surface">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-wr-hint uppercase tracking-widest">
              Filtros
            </p>
            {activeChips.length > 0 && (
              <button
                onClick={resetFiltros}
                className="text-[10px] text-wr-hint hover:text-wr-amber transition-colors"
              >
                Limpiar todo
              </button>
            )}
          </div>
          <p className="text-wr-text text-sm font-medium mt-0.5">
            {empresasGeoJSON
              ? `${visiblesCount} de ${stats.total} empresa${stats.total !== 1 ? "s" : ""}`
              : "Cargando…"}
          </p>
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div className={`bg-wr-surface ${scroll ? "flex-1 overflow-y-auto" : ""}`}>

        {/* Chips de filtros activos */}
        {activeChips.length > 0 && (
          <div className="px-3 pt-3 pb-1 flex flex-wrap gap-1.5">
            {activeChips.map((chip, i) => (
              <span
                key={i}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-wr-blue/10 text-wr-blue border border-wr-blue/20"
              >
                {chip.label}
                <button
                  onClick={chip.remove}
                  className="text-wr-blue/60 hover:text-wr-blue leading-none"
                  aria-label="Quitar filtro"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="px-4 py-3 space-y-5">

          {/* ── Perímetro ── */}
          <div>
            <SectionLabel>Perímetro</SectionLabel>
            <div className="flex gap-1.5 flex-wrap">
              <TogglePill
                active={filtros.enPerimetro === null}
                onClick={() => setFiltro("enPerimetro", null)}
              >
                Todos
              </TogglePill>
              <TogglePill
                active={filtros.enPerimetro === true}
                onClick={() => setFiltro("enPerimetro", true)}
                color="green"
              >
                En perímetro
              </TogglePill>
              <TogglePill
                active={filtros.enPerimetro === false}
                onClick={() => setFiltro("enPerimetro", false)}
                color="gray"
              >
                Fuera
              </TogglePill>
            </div>
          </div>

          {/* ── CCAA ── */}
          <FilterChecklist
            label="Comunidad autónoma"
            options={availableCCAA}
            selected={filtros.ccaa}
            onToggle={(v) => toggleFiltroArray("ccaa", v)}
            onClear={() => setFiltro("ccaa", [])}
          />

          {/* ── Provincia ── */}
          <FilterChecklist
            label="Provincia"
            options={availableProvincias}
            selected={filtros.provincia}
            onToggle={(v) => toggleFiltroArray("provincia", v)}
            onClear={() => setFiltro("provincia", [])}
            searchable
          />

          {/* ── Sector ── */}
          <div>
            <SectionLabel>Sector</SectionLabel>
            <div className="flex gap-1.5 flex-wrap">
              {(["PCI", "seguridad_electronica", "mixto"] as Sector[]).map((s) => {
                const lbl = s === "PCI" ? "PCI" : s === "seguridad_electronica" ? "Seg. El." : "Mixto";
                return (
                  <TogglePill
                    key={s}
                    active={filtros.sector.includes(s)}
                    onClick={() => toggleFiltroArray("sector", s)}
                  >
                    {lbl}
                  </TogglePill>
                );
              })}
            </div>
          </div>

          {/* ── CRM ── */}
          <div>
            <SectionLabel>CRM</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  // "sin_crm" sentinel: empresas sin CrmEstado o con dealStage=null.
                  // Distinto de "identificado" (primer stage real del funnel).
                  { value: "sin_crm",         label: "Sin CRM",      color: "gray"   },
                  { value: "identificado",    label: "Identificado", color: "gray"   },
                  { value: "contactado",      label: "Contactado",   color: "sky"    },
                  { value: "primera_reunion", label: "1ª reunión",   color: "blue"   },
                  { value: "analisis",        label: "Análisis",     color: "violet" },
                  { value: "LOI enviada",     label: "LOI enviada",  color: "amber"  },
                  { value: "execution",       label: "Ejecución",    color: "orange" },
                  { value: "portfolio",       label: "Portfolio",    color: "green"  },
                  { value: "on_hold",         label: "On hold",      color: "gray"   },
                  { value: "muerto",          label: "Muerto",       color: "red"    },
                ] as { value: DealStage | "sin_crm"; label: string; color: PillColor }[]
              ).map(({ value, label, color }) => (
                <TogglePill
                  key={value}
                  active={filtros.crmStage.includes(value)}
                  onClick={() => toggleFiltroArray("crmStage", value)}
                  color={color}
                >
                  {label}
                </TogglePill>
              ))}
            </div>
          </div>

          {/* ── Grupo ── */}
          <div>
            <SectionLabel>Grupo</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {/* Pill especial "Sin grupo" — sentinel `0` en filtros.grupoId */}
              <TogglePill
                active={filtros.grupoId.includes(0)}
                onClick={() => toggleFiltroArray("grupoId", 0)}
                color="gray"
              >
                Sin grupo
              </TogglePill>
              {availableGrupos.map((g) => (
                <TogglePill
                  key={g.id}
                  active={filtros.grupoId.includes(g.id)}
                  onClick={() => toggleFiltroArray("grupoId", g.id)}
                  color="blue"
                >
                  {g.nombre}
                </TogglePill>
              ))}
            </div>
          </div>

          {/* ── Habilitaciones del Registro de Seguridad Privada ── */}
          <div className="space-y-2">
            <FilterChecklist
              label="Habilitación"
              options={HABILITACIONES.map((h) => h.etiqueta)}
              selected={filtros.habilitaciones
                .map((c) => ETIQUETA_HABILITACION[c])
                .filter(Boolean)}
              onToggle={(etiqueta) => {
                const codigo = HABILITACIONES.find((h) => h.etiqueta === etiqueta)?.codigo;
                if (codigo) toggleFiltroArray("habilitaciones", codigo);
              }}
              onClear={() => {
                setFiltro("habilitaciones", []);
                setFiltro("habilitacionAmbito", null);
              }}
            />
            {/* El ámbito solo tiene sentido junto a alguna habilitación. */}
            {filtros.habilitaciones.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {([null, "E", "A"] as const).map((a) => (
                  <TogglePill
                    key={a ?? "todas"}
                    active={filtros.habilitacionAmbito === a}
                    onClick={() => setFiltro("habilitacionAmbito", a)}
                  >
                    {a === null ? "Cualquier ámbito" : a === "E" ? "Estatal" : "Autonómica"}
                  </TogglePill>
                ))}
              </div>
            )}
          </div>

          {/* ── Cepreven ── */}
          <div>
            <SectionLabel>Cepreven</SectionLabel>
            <div className="flex gap-1.5 flex-wrap">
              {(["calificada", "asociada"] as const).map((estado) => (
                <TogglePill
                  key={estado}
                  active={filtros.cepreven === estado}
                  onClick={() =>
                    setFiltro("cepreven", filtros.cepreven === estado ? null : estado)
                  }
                  color={estado === "calificada" ? "blue" : "gray"}
                >
                  {estado === "calificada" ? "Calificada" : "Asociada"}
                </TogglePill>
              ))}
              {(["cualquiera", "ninguna"] as const).map((estado) => (
                <TogglePill
                  key={estado}
                  active={filtros.cepreven === estado}
                  onClick={() =>
                    setFiltro("cepreven", filtros.cepreven === estado ? null : estado)
                  }
                  color="gray"
                >
                  {estado === "cualquiera" ? "Cualquiera" : "Sin Cepreven"}
                </TogglePill>
              ))}
            </div>
          </div>

          {/* ── Ingresos range slider ── */}
          <RangeSliderFiltro
            label="Ingresos"
            displayMax={100_000_000}
            step={1_000_000}
            valueMin={filtros.ingresosMin}
            valueMax={filtros.ingresosMax}
            useInfinity
            onChangeMin={(v) => setFiltro("ingresosMin", v)}
            onChangeMax={(v) => setFiltro("ingresosMax", v)}
            formatMin={(v) => fmtM(v)}
            formatMax={(v) => (v === Infinity ? "Sin límite" : fmtM(v))}
          />

          {/* ── GM (gross margin) range slider ── */}
          <RangeSliderFiltro
            label="GM"
            displayMax={100}
            step={1}
            valueMin={filtros.margenBrutoMin}
            valueMax={filtros.margenBrutoMax}
            onChangeMin={(v) => setFiltro("margenBrutoMin", v)}
            onChangeMax={(v) => setFiltro("margenBrutoMax", v)}
            formatMin={(v) => `${v}%`}
            formatMax={(v) => `${v}%`}
          />

          {/* ── EBITDA range slider ── */}
          <RangeSliderFiltro
            label="EBITDA %"
            displayMax={50}
            step={1}
            valueMin={filtros.ebitdaMin}
            valueMax={filtros.ebitdaMax}
            useInfinity
            onChangeMin={(v) => setFiltro("ebitdaMin", v)}
            onChangeMax={(v) => setFiltro("ebitdaMax", v)}
            formatMin={(v) => `${v}%`}
            formatMax={(v) => (v === Infinity ? "Sin límite" : `${v}%`)}
          />

          {/* ── Stat cards ── */}
          <div>
            <SectionLabel>Estadísticas</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                value={stats.total}
                label="Empresas totales"
                colorClass="text-wr-text"
              />
              <StatCard
                value={stats.enPerimetro}
                label="En perímetro"
                colorClass="text-wr-green"
              />
              <StatCard
                value={stats.bormeAlertas}
                label="Alertas BORME"
                colorClass="text-wr-amber"
                className="col-span-2"
              />
              <StatCard
                value={visiblesCount}
                label="En selección"
                colorClass="text-wr-blue"
              />
              <StatCard
                value={fmtCompactMoney(selectionStats.totalIngresos)}
                label="Ingresos selección"
                colorClass="text-wr-blue"
                title={`Suma de los últimos ingresos disponibles de las empresas en selección: ${fmt(selectionStats.totalIngresos)} €`}
              />
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}
