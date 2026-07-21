"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { useNavegacion } from "@/lib/navegacion";
import { isInFilter } from "@/lib/filtros";
import { fmt, fmtM, fmtPct } from "@/lib/format";
import { DEAL_STAGE_LABEL, DEAL_STAGE_TEXT_CLASS } from "@/lib/crm";
import type { DealStage } from "@/types";
import {
  buildFinancialHistorySheet,
  excelHeaderCell,
  type FinancieroExportRecord,
} from "@/lib/empresa-excel-export";
import type { SheetData } from "write-excel-file/browser";
// El escritor de Excel se importa dinámicamente sólo cuando el usuario
// pulsa "Exportar a Excel" — la mayoría de visitas a la tabla nunca lo
// usan, así que mantenerlo fuera del chunk inicial mejora TTI.

const SECTOR_LABEL: Record<string, string> = {
  PCI: "PCI",
  seguridad_electronica: "Seg. Electrónica",
  mixto: "Mixto",
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
    mapBounds,
    empresasFullLoaded,
    empresasFullLoading,
    hydrateEmpresasFull,
  } = useWarRoomStore();
  const { seleccionarEmpresa, empresaSeleccionadaId } = useNavegacion();

  // La tabla muestra `logoUrl, empleados, web, tareasPendientesCount,
  // variacionPct` — campos exclusivos de `/api/empresas` (full). El store
  // lo carga únicamente cuando se abre la tabla (idempotente), sin gastar
  // red móvil cuando el usuario solo consulta el mapa.
  useEffect(() => {
    if (!empresasFullLoaded && !empresasFullLoading) {
      void hydrateEmpresasFull();
    }
  }, [empresasFullLoaded, empresasFullLoading, hydrateEmpresasFull]);

  const [sortKey, setSortKey] = useState<SortKey>("nombre");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [usarVistaMapas, setUsarVistaMapas] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
      .map((f) => f.properties);

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

  // Export to Excel — la primera pestaña conserva el mismo orden/filtros que
  // Tabla. El histórico se pide bajo demanda únicamente para esas empresas,
  // evitando cargar ~19k registros cada vez que se abre la vista.
  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);

    try {
      const response = await fetch("/api/empresas/export-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaIds: rows.map((row) => row.id) }),
      });
      if (!response.ok) throw new Error(`API ${response.status}`);

      const payload = (await response.json()) as {
        records?: FinancieroExportRecord[];
      };
      const historyRecords = Array.isArray(payload.records)
        ? payload.records
        : [];

      const headers = [
        "Empresa",
        "CIF",
        "Grupo",
        "Ciudad",
        "Provincia",
        "Sector",
        "CRM",
        "Web",
        ...(!modoPresentacion
          ? ["Año del último dato", "Ingresos (€)", "GM%", "EBITDA%"]
          : []),
        "Empleados",
      ];
      const summaryData: SheetData = [
        headers.map((header) => excelHeaderCell(header)),
        ...rows.map((row) => [
          row.nombre,
          row.cif ?? "",
          row.grupoNombre ?? "",
          row.localidad ?? "",
          row.provincia,
          SECTOR_LABEL[row.sector as string] ?? row.sector,
          DEAL_STAGE_LABEL[row.dealStage as DealStage] ?? row.dealStage ?? "—",
          row.web ?? "",
          ...(!modoPresentacion
            ? [
                row.anioFinanciero ?? null,
                row.ingresos ?? null,
                row.margenBrutoPct != null
                  ? Number(row.margenBrutoPct.toFixed(1))
                  : null,
                row.ebitdaPct != null
                  ? Number(row.ebitdaPct.toFixed(1))
                  : null,
              ]
            : []),
          row.empleados ?? null,
        ]),
      ];

      const history = buildFinancialHistorySheet(
        rows.map((row) => ({
          id: row.id,
          nombre: row.nombre,
          cif: row.cif,
        })),
        historyRecords
      );

      const summaryWidths = headers.map((header) => ({
        width:
          header === "Empresa"
            ? 38
            : header === "Web"
              ? 28
              : header === "Grupo" || header === "Ciudad"
                ? 22
                : header === "Provincia" || header === "Sector"
                  ? 18
                  : 15,
      }));
      const historyWidths = [
        { width: 38 },
        { width: 14 },
        { width: 22 },
        ...history.years.map(() => ({ width: 16 })),
      ];

      const { default: writeXlsxFile } = await import(
        "write-excel-file/browser"
      );
      await writeXlsxFile(
        [
          {
            data: summaryData,
            sheet: "Empresas",
            columns: summaryWidths,
            stickyRowsCount: 1,
            showGridLines: false,
            orientation: "landscape",
            zoomScale: 0.9,
          },
          {
            data: history.data,
            sheet: "Histórico financiero",
            columns: historyWidths,
            stickyRowsCount: 1,
            stickyColumnsCount: 3,
            showGridLines: false,
            orientation: "landscape",
            zoomScale: 0.9,
          },
        ],
        { fontFamily: "Calibri", fontSize: 10 }
      ).toFile(
        `fontiber-war-room-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error) {
      console.error("[TablaEmpresas/export]", error);
      setExportError("No se ha podido generar el Excel. Reintenta.");
    } finally {
      setExporting(false);
    }
  }, [rows, modoPresentacion, exporting]);

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
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-wr-border bg-wr-surface flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-xs text-wr-muted flex-shrink-0">
            <span className="text-wr-text font-medium">{rows.length}</span>{" "}
            empresa{rows.length !== 1 ? "s" : ""}
          </p>
          {/* Indicador de filtro por vista del mapa — oculto en <sm
              porque mapBounds no se setea sin pasar por el mapa antes. */}
          {mapBounds && (
            <button
              onClick={() => setUsarVistaMapas((v) => !v)}
              title={usarVistaMapas ? "Mostrando solo empresas en la vista actual del mapa. Clic para ver todas." : "Clic para filtrar por vista del mapa."}
              className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border transition-colors flex-shrink-0 ${
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
        <div className="flex items-center gap-2 flex-shrink-0">
          {exportError && (
            <span className="hidden sm:inline text-[10px] text-wr-red" role="alert">
              {exportError}
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text hover:border-wr-muted disabled:opacity-50 disabled:cursor-wait transition-colors flex-shrink-0"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden sm:inline">
              {exporting ? "Generando…" : "Exportar Excel"}
            </span>
            <span className="sm:hidden">{exporting ? "…" : "Excel"}</span>
          </button>
        </div>
      </div>

      {/* Cards layout — solo en <md (tablet vertical y mobile).
          Más legible que una tabla con scroll horizontal infinito. */}
      <div className="md:hidden flex-1 overflow-auto p-2 space-y-2">
        {rows.length === 0 && (
          <p className="text-center py-16 text-wr-hint text-sm">
            Sin resultados con los filtros actuales
          </p>
        )}
        {rows.map((r) => {
          const id = r.id as number;
          const isSelected = id === empresaSeleccionadaId;
          const tendencia = r.tendencia as string;
          return (
            <button
              key={id}
              onClick={() => seleccionarEmpresa(id)}
              className={`w-full text-left bg-wr-surface border rounded-lg p-3 transition-colors tap-target-h ${
                isSelected ? "border-wr-blue/50 bg-wr-blue/5" : "border-wr-border hover:border-wr-muted"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <LogoCell
                  logoUrl={r.logoUrl as string | null}
                  nombre={r.nombre as string}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-wr-text leading-snug">
                      {r.nombre as string}
                    </p>
                    {(r.tareasPendientesCount as number | undefined) ? (
                      <span
                        className="text-[10px] font-bold bg-wr-amber/20 text-wr-amber border border-wr-amber/30 rounded px-1.5 py-0.5 whitespace-nowrap flex-shrink-0"
                        title={`${r.tareasPendientesCount} tareas pendientes`}
                      >
                        {r.tareasPendientesCount as number}T
                      </span>
                    ) : null}
                  </div>
                  {r.grupoNombre ? (
                    <p className="text-wr-hint text-[11px] mt-0.5">{r.grupoNombre as string}</p>
                  ) : null}
                  <p className="text-wr-muted text-[11px] mt-1">
                    {[r.localidad as string | null, r.provincia as string].filter(Boolean).join(", ")}
                    {r.sector ? ` · ${SECTOR_LABEL[r.sector as string] ?? r.sector}` : ""}
                  </p>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                    {r.dealStage ? (
                      <span
                        className={`text-[11px] font-medium ${DEAL_STAGE_TEXT_CLASS[r.dealStage as DealStage] ?? "text-wr-muted"}`}
                      >
                        {DEAL_STAGE_LABEL[r.dealStage as DealStage] ?? (r.dealStage as string)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-wr-hint">Sin CRM</span>
                    )}
                    {!modoPresentacion && r.ingresos != null && (
                      <span className="text-[11px] text-wr-text flex items-center gap-1">
                        {fmtM(r.ingresos as number | null)}
                        {tendencia === "up" && <span className="text-wr-green">↑</span>}
                        {tendencia === "down" && <span className="text-wr-red">↓</span>}
                      </span>
                    )}
                    {!modoPresentacion && r.ebitdaPct != null && (
                      <span className="text-[11px] text-wr-muted">
                        EBITDA {fmtPct(r.ebitdaPct as number | null)}
                      </span>
                    )}
                    {r.empleados != null && (
                      <span className="text-[11px] text-wr-hint">{fmt(r.empleados as number | null)} empl.</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Table — md+ */}
      <div className="hidden md:block flex-1 overflow-auto">
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
                      <div className="min-w-0 flex-1">
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
                      {(r.tareasPendientesCount as number | undefined) ? (
                        <span
                          className="text-[9px] font-bold bg-wr-amber/20 text-wr-amber border border-wr-amber/30 rounded px-1 py-0.5 whitespace-nowrap flex-shrink-0"
                          title={`${r.tareasPendientesCount} tareas pendientes`}
                        >
                          {r.tareasPendientesCount as number}T
                        </span>
                      ) : null}
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
                        className={`font-medium ${DEAL_STAGE_TEXT_CLASS[r.dealStage as DealStage] ?? "text-wr-muted"}`}
                      >
                        {DEAL_STAGE_LABEL[r.dealStage as DealStage] ?? (r.dealStage as string)}
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
