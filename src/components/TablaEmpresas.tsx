"use client";

import { useMemo, useState, useCallback } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { isInFilter } from "@/lib/filtros";
import { fmt, fmtM, fmtPct } from "@/lib/format";
import * as XLSX from "xlsx";

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
  identificado:    "text-[#94a3b8]",
  contactado:      "text-wr-blue",
  primera_reunion: "text-sky-400",
  analisis:        "text-violet-400",
  "LOI enviada":   "text-wr-amber",
  execution:       "text-orange-400",
  portfolio:       "text-wr-green",
  muerto:          "text-wr-red",
};

type SortKey =
  | "nombre"
  | "cif"
  | "localidad"
  | "provincia"
  | "sector"
  | "dealStage"
  | "ingresos"
  | "margenBrutoPct"
  | "ebitdaPct"
  | "empleados";

type SortDir = "asc" | "desc";

// Logo con fallback a iniciales si la imagen falla
function LogoCell({ logoUrl, nombre }: { logoUrl: string | null; nombre: string }) {
  const initials = nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const fallback = (
    <div className="w-5 h-5 rounded bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-[9px] font-bold flex items-center justify-center flex-shrink-0">
      {initials}
    </div>
  );

  if (!logoUrl) return fallback;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className="w-5 h-5 object-contain rounded flex-shrink-0"
      onError={(e) => {
        const parent = (e.target as HTMLImageElement).parentElement;
        if (parent) {
          const div = document.createElement("div");
          div.className =
            "w-5 h-5 rounded bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-[9px] font-bold flex items-center justify-center flex-shrink-0";
          div.textContent = initials;
          parent.replaceChild(div, e.target as HTMLImageElement);
        }
      }}
    />
  );
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function TablaEmpresas() {
  const {
    empresasGeoJSON,
    filtros,
    searchQuery,
    modoPresentacion,
    seleccionarEmpresa,
    empresaSeleccionadaId,
    mapBounds,
  } = useWarRoomStore();

  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [usarVistaMapas, setUsarVistaMapas] = useState(true);

  // Filtered + sorted rows
  const rows = useMemo(() => {
    if (!empresasGeoJSON) return [];

    const filtered = empresasGeoJSON
      .filter((f) => isInFilter(f.properties, filtros, searchQuery))
      .filter((f) => {
        if (!usarVistaMapas || !mapBounds) return true;
        const [lng, lat] = f.geometry.coordinates;
        return (
          lng >= mapBounds.west && lng <= mapBounds.east &&
          lat >= mapBounds.south && lat <= mapBounds.north
        );
      })
      .map((f) => f.properties as Record<string, unknown>);

    filtered.sort((a, b) => {
      const va = a[sortKey] ?? null;
      const vb = b[sortKey] ?? null;

      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;

      let cmp = 0;
      if (typeof va === "string" && typeof vb === "string") {
        cmp = va.localeCompare(vb, "es");
      } else {
        cmp = (va as number) < (vb as number) ? -1 : (va as number) > (vb as number) ? 1 : 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [empresasGeoJSON, filtros, searchQuery, sortKey, sortDir, mapBounds, usarVistaMapas]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  // Export to Excel — mismo orden que la tabla
  const handleExport = useCallback(() => {
    const data = rows.map((r) => {
      const row: Record<string, unknown> = {
        Empresa: r.nombre,
        CIF: r.cif ?? "",
        Ciudad: r.localidad ?? "",
        Provincia: r.provincia,
        Sector: SECTOR_LABEL[r.sector as string] ?? r.sector,
        CRM: STAGE_LABEL[r.dealStage as string] ?? r.dealStage ?? "—",
      };
      if (!modoPresentacion) {
        row["Ingresos (€)"] = r.ingresos ?? null;
        row["GM%"] =
          r.margenBrutoPct !== null && r.margenBrutoPct !== undefined
            ? Number((r.margenBrutoPct as number).toFixed(1))
            : null;
        row["EBITDA%"] =
          r.ebitdaPct !== null && r.ebitdaPct !== undefined
            ? Number((r.ebitdaPct as number).toFixed(1))
            : null;
      }
      row["Empleados"] = r.empleados ?? null;
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Empresas");
    XLSX.writeFile(
      wb,
      `fontiber-war-room-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }, [rows, modoPresentacion]);

  // Sort indicator
  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) {
      return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-30 ml-1 inline">
          <path d="M12 5v14M5 12l7-7 7 7" />
        </svg>
      );
    }
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-wr-blue ml-1 inline">
        {sortDir === "asc"
          ? <path d="M12 19V5M5 12l7-7 7 7" />
          : <path d="M12 5v14M5 12l7 7 7-7" />
        }
      </svg>
    );
  }

  function Th({
    col,
    children,
    align = "left",
  }: {
    col: SortKey;
    children: React.ReactNode;
    align?: "left" | "right";
  }) {
    return (
      <th
        onClick={() => handleSort(col)}
        className={`px-3 py-2.5 text-[10px] font-semibold text-wr-muted uppercase tracking-widest cursor-pointer select-none whitespace-nowrap hover:text-wr-text transition-colors ${align === "right" ? "text-right" : "text-left"}`}
      >
        {children}
        <SortIcon col={col} />
      </th>
    );
  }

  const colSpanTotal = modoPresentacion ? 7 : 10;

  return (
    <div className="flex flex-col h-full bg-wr-bg">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-wr-border bg-wr-surface flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-xs text-wr-muted flex-shrink-0">
            <span className="text-wr-text font-medium">{rows.length}</span>{" "}
            empresa{rows.length !== 1 ? "s" : ""}
          </p>
          {/* Indicador de filtro por vista del mapa */}
          {mapBounds && (
            <button
              onClick={() => setUsarVistaMapas((v) => !v)}
              title={usarVistaMapas ? "Mostrando solo empresas en la vista actual del mapa. Clic para ver todas." : "Clic para filtrar por vista del mapa."}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border transition-colors flex-shrink-0 ${
                usarVistaMapas
                  ? "bg-wr-blue/15 text-wr-blue border-wr-blue/30 hover:bg-wr-blue/25"
                  : "bg-wr-surface2 text-wr-muted border-wr-border hover:border-wr-muted"
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 3l7 2 4-2 7 3v10l-7-3-4 2-7-2V3z" />
              </svg>
              {usarVistaMapas ? "Vista del mapa" : "Toda España"}
            </button>
          )}
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text hover:border-wr-muted transition-colors flex-shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Exportar Excel
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-wr-surface border-b border-wr-border z-10">
            <tr>
              <Th col="nombre">Empresa</Th>
              <Th col="cif">CIF</Th>
              <Th col="localidad">Ciudad</Th>
              <Th col="provincia">Provincia</Th>
              <Th col="sector">Sector</Th>
              <Th col="dealStage">CRM</Th>
              {!modoPresentacion && (
                <>
                  <Th col="ingresos" align="right">Ingresos</Th>
                  <Th col="margenBrutoPct" align="right">GM%</Th>
                  <Th col="ebitdaPct" align="right">EBITDA%</Th>
                </>
              )}
              <Th col="empleados" align="right">Empleados</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={colSpanTotal}
                  className="text-center py-16 text-wr-hint"
                >
                  Sin resultados con los filtros actuales
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const id = r.id as number;
              const isSelected = id === empresaSeleccionadaId;
              const tendencia = r.tendencia as string;

              return (
                <tr
                  key={id}
                  onClick={() => seleccionarEmpresa(id)}
                  className={`border-b border-wr-border/50 cursor-pointer transition-colors ${
                    isSelected ? "bg-wr-blue/10" : "hover:bg-wr-surface"
                  }`}
                >
                  {/* Empresa */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <LogoCell
                        logoUrl={r.logoUrl as string | null}
                        nombre={r.nombre as string}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-wr-text truncate">
                          {r.web ? (
                            <a
                              href={(r.web as string).startsWith("http") ? (r.web as string) : `https://${r.web}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-wr-blue transition-colors"
                            >
                              {r.nombre as string}{" "}
                              <span className="text-wr-blue text-[10px]">↗</span>
                            </a>
                          ) : (
                            r.nombre as string
                          )}
                        </p>
                        {r.grupoNombre ? (
                          <p className="text-wr-hint text-[10px] truncate">
                            {r.grupoNombre as string}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  {/* CIF */}
                  <td className="px-3 py-2.5 text-wr-hint whitespace-nowrap font-mono text-[11px]">
                    {(r.cif as string | null) ?? (
                      <span className="text-wr-hint">—</span>
                    )}
                  </td>

                  {/* Ciudad */}
                  <td className="px-3 py-2.5 text-wr-muted whitespace-nowrap">
                    {(r.localidad as string | null) ?? (
                      <span className="text-wr-hint">—</span>
                    )}
                  </td>

                  {/* Provincia */}
                  <td className="px-3 py-2.5 text-wr-muted whitespace-nowrap">
                    {r.provincia as string}
                  </td>

                  {/* Sector */}
                  <td className="px-3 py-2.5 text-wr-muted whitespace-nowrap">
                    {SECTOR_LABEL[r.sector as string] ?? (r.sector as string)}
                  </td>

                  {/* CRM Stage */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {r.dealStage ? (
                      <span
                        className={`font-medium ${STAGE_COLOR[r.dealStage as string] ?? "text-wr-muted"}`}
                      >
                        {STAGE_LABEL[r.dealStage as string] ?? (r.dealStage as string)}
                      </span>
                    ) : (
                      <span className="text-wr-hint">—</span>
                    )}
                  </td>

                  {/* Financieros — ocultos en modo presentación */}
                  {!modoPresentacion && (
                    <>
                      <td className="px-3 py-2.5 text-right text-wr-text whitespace-nowrap">
                        <span className="flex items-center justify-end gap-1">
                          {fmtM(r.ingresos as number | null)}
                          {tendencia === "up" && (
                            <span className="text-wr-green text-[10px]">↑</span>
                          )}
                          {tendencia === "down" && (
                            <span className="text-wr-red text-[10px]">↓</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-wr-text whitespace-nowrap">
                        {fmtPct(r.margenBrutoPct as number | null)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-wr-text whitespace-nowrap">
                        {fmtPct(r.ebitdaPct as number | null)}
                      </td>
                    </>
                  )}

                  {/* Empleados */}
                  <td className="px-3 py-2.5 text-right text-wr-muted whitespace-nowrap">
                    {fmt(r.empleados as number | null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
