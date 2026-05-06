"use client";

// Panel de resultados de la herramienta "selección por área" del mapa.
// Aparece anclado en la parte inferior, con altura redimensionable, y
// tabula las empresas que caen dentro del polígono dibujado por el
// usuario. La ordenación numérica es client-side.

import { useCallback, useMemo, useState } from "react";
import { useWarRoomStore, type EmpresaFeatureProperties } from "@/store/useWarRoomStore";
import { useNavegacion } from "@/lib/navegacion";
import { fmtM, fmtPct } from "@/lib/format";
import { SECTOR_LBL, STAGE_LBL, STAGE_CLR } from "./labels";

type Props = EmpresaFeatureProperties;

const fmtMLocal = (n: unknown) => fmtM(n as number | null);
const fmtPctLocal = (n: unknown) => fmtPct(n as number | null, "—");

export function SeleccionAreaPanel({
  empresas,
  onClose,
  height,
  onResizeStart,
}: {
  empresas: Props[];
  onClose: () => void;
  height: number;
  onResizeStart: (e: React.PointerEvent) => void;
}) {
  const { modoPresentacion } = useWarRoomStore();
  const { seleccionarEmpresa } = useNavegacion();
  type NumericSortKey = "ingresos" | "margenBrutoPct" | "ebitdaPct" | "ebitda";
  const [sortKey, setSortKey] = useState<NumericSortKey>("ingresos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = useCallback(
    (key: NumericSortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const sorted = useMemo(
    () =>
      [...empresas].sort((a, b) => {
        const av = a[sortKey] ?? -Infinity;
        const bv = b[sortKey] ?? -Infinity;
        return sortDir === "asc" ? av - bv : bv - av;
      }),
    [empresas, sortKey, sortDir]
  );

  const SortTh = ({ col, children }: { col: NumericSortKey; children: React.ReactNode }) => (
    <th
      className="text-right px-3 py-2 cursor-pointer hover:text-wr-text select-none whitespace-nowrap"
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center justify-end gap-0.5">
        {children}
        <span className={sortKey === col ? "text-wr-blue ml-0.5" : "opacity-30 ml-0.5"}>
          {sortKey === col ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
        </span>
      </span>
    </th>
  );

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 animate-slide-up">
      <div className="bg-wr-surface/95 backdrop-blur-md border-t border-wr-border shadow-2xl relative"
        style={{ height }}
      >
        {/* Resize handle */}
        <div
          onPointerDown={onResizeStart}
          title="Arrastra para redimensionar"
          className="absolute top-0 left-0 right-0 h-2 -translate-y-1/2 cursor-ns-resize z-30 group flex items-center justify-center"
        >
          <div className="w-12 h-1 rounded-full bg-wr-border group-hover:bg-wr-blue transition-colors" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-wr-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
              <path d="M3 3l7 2 4-2 7 3v10l-7-3-4 2-7-2V3z" />
            </svg>
            <span className="text-xs font-semibold text-wr-text">
              Selección de área —{" "}
              <span className="text-wr-blue">{empresas.length}</span>{" "}
              empresa{empresas.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-wr-hint hover:text-wr-text transition-colors p-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabla */}
        <div className="overflow-auto" style={{ height: `calc(100% - 44px)` }}>
          {empresas.length === 0 ? (
            <p className="text-center py-8 text-wr-hint text-xs">
              Ninguna empresa en el área seleccionada
            </p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-wr-surface">
                <tr className="text-[10px] font-semibold text-wr-hint uppercase tracking-widest border-b border-wr-border">
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-left px-3 py-2">Provincia</th>
                  <th className="text-left px-3 py-2">Sector</th>
                  <th className="text-left px-3 py-2">CRM</th>
                  {!modoPresentacion && (
                    <>
                      <SortTh col="ingresos">Ingresos</SortTh>
                      <SortTh col="margenBrutoPct">GM%</SortTh>
                      <SortTh col="ebitdaPct">EBITDA%</SortTh>
                      <SortTh col="ebitda">EBITDA</SortTh>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.id as number}
                    onClick={() => seleccionarEmpresa(r.id as number)}
                    className="border-b border-wr-border/40 hover:bg-wr-surface2 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2 font-medium text-wr-text max-w-[180px]">
                      <span className="truncate block">
                        {r.nombre as string}
                        {r.web ? (
                          <span className="text-wr-blue ml-1 text-[10px]">↗</span>
                        ) : null}
                      </span>
                      {r.grupoNombre ? (
                        <span className="text-wr-hint text-[10px]">
                          {r.grupoNombre as string}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-wr-muted whitespace-nowrap">
                      {r.provincia as string}
                    </td>
                    <td className="px-3 py-2 text-wr-muted whitespace-nowrap">
                      {SECTOR_LBL[r.sector as string] ?? (r.sector as string)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.dealStage ? (
                        <span
                          style={{ color: STAGE_CLR[r.dealStage as string] ?? "#94a3b8" }}
                          className="font-medium"
                        >
                          {STAGE_LBL[r.dealStage as string] ?? (r.dealStage as string)}
                        </span>
                      ) : (
                        <span className="text-wr-hint">—</span>
                      )}
                    </td>
                    {!modoPresentacion && (
                      <>
                        <td className="px-3 py-2 text-right text-wr-text whitespace-nowrap">
                          {fmtMLocal(r.ingresos)}
                        </td>
                        <td className="px-3 py-2 text-right text-wr-muted whitespace-nowrap">
                          {fmtPctLocal(r.margenBrutoPct)}
                        </td>
                        <td className="px-3 py-2 text-right text-wr-muted whitespace-nowrap">
                          {fmtPctLocal(r.ebitdaPct)}
                        </td>
                        <td className="px-3 py-2 text-right text-wr-muted whitespace-nowrap">
                          {fmtMLocal(r.ebitda)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
