import React, { useState } from "react";
import { fmtFechaShort } from "@/lib/format";
import { fmtM, fmtPct, ebitdaColor } from "./helpers";
import type { PersonaCompartida, SortDir } from "./types";

/** Tabla maestra-detalle de personas que aparecen en 2+ sociedades.
 *  La cabecera permite ordenar; la fila principal expande sus empresas.
 *  El estado de qué filas están expandidas es local del componente. */
export function AlertasPersonasTable({
  personas,
  onVerPerfil,
  sortKey,
  sortDir,
  onSort,
}: {
  personas: PersonaCompartida[];
  onVerPerfil: (id: number) => void;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (nombre: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) {
        next.delete(nombre);
      } else {
        next.add(nombre);
      }
      return next;
    });

  const Th = ({
    k,
    label,
    align = "left",
  }: {
    k: string;
    label: string;
    align?: "left" | "right";
  }) => (
    <th
      onClick={() => onSort(k)}
      className={`px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:text-wr-text transition-colors text-${align} ${
        sortKey === k ? "text-wr-blue" : "text-wr-hint"
      }`}
    >
      {label}
      <span className="ml-1 text-[9px]">
        {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </th>
  );

  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="bg-wr-surface border-b border-wr-border">
          <th className="px-3 py-2 w-6" />
          <Th k="nombre" label="Persona" align="left" />
          <Th k="numEmpresas" label="Empresas" align="right" />
          <Th k="enPerimetro" label="En perímetro" align="right" />
          <Th k="ingresos" label="Ingresos totales" align="right" />
          <Th k="ultimaAparicion" label="Última incorporación" align="right" />
        </tr>
      </thead>
      <tbody>
        {personas.map((p) => {
          const isOpen = expanded.has(p.nombreNorm);
          const totalIngresos = p.empresas.reduce(
            (sum, e) => sum + (e.ingresos ?? 0),
            0
          );
          const enPerimetroCount = p.empresas.filter((e) => e.enPerimetro).length;
          return (
            <React.Fragment key={p.nombreNorm}>
              {/* ── Collapsed header row ── */}
              <tr
                onClick={() => toggle(p.nombreNorm)}
                className="border-b border-wr-border hover:bg-wr-surface2 cursor-pointer select-none"
              >
                <td className="pl-3 py-2.5 text-wr-hint">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-semibold text-wr-text text-[10px] tracking-wide">
                    {p.displayName}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-wr-muted">
                  {p.numEmpresas}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {enPerimetroCount > 0 ? (
                    <span className="text-wr-blue font-medium">
                      {enPerimetroCount}
                    </span>
                  ) : (
                    <span className="text-wr-border">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-wr-text">
                  {totalIngresos > 0 ? fmtM(totalIngresos) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-wr-hint whitespace-nowrap">
                  {fmtFechaShort(p.ultimaAparicion)}
                </td>
              </tr>

              {/* ── Expanded detail rows ── */}
              {isOpen && (
                <>
                  {/* Sub-header */}
                  <tr className="bg-wr-surface2/60 border-b border-wr-border/50">
                    <td />
                    <td className="px-3 py-1 text-[9px] text-wr-hint font-medium">
                      Empresa
                    </td>
                    <td className="px-3 py-1 text-[9px] text-wr-hint font-medium text-right">
                      Rol
                    </td>
                    <td className="px-3 py-1 text-[9px] text-wr-hint font-medium text-right">
                      Ingresos
                    </td>
                    <td className="px-3 py-1 text-[9px] text-wr-hint font-medium text-right">
                      EBITDA · GM%
                    </td>
                    <td className="px-3 py-1 text-[9px] text-wr-hint font-medium text-right">
                      Fecha · BORME
                    </td>
                  </tr>
                  {p.empresas.map((emp) => (
                    <tr
                      key={`${p.nombreNorm}-${emp.empresaId}`}
                      className="border-b border-wr-border/40 bg-wr-surface/40 hover:bg-wr-surface2/60"
                    >
                      <td />
                      {/* Empresa */}
                      <td className="px-3 py-2 max-w-[260px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onVerPerfil(emp.empresaId);
                            }}
                            className="font-medium text-wr-text hover:text-wr-blue transition-colors truncate text-left"
                            title={emp.empresaNombre}
                          >
                            {emp.empresaNombre}
                          </button>
                          {emp.enPerimetro && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-wr-blue flex-shrink-0"
                              title="En perímetro"
                            />
                          )}
                          {emp.grupoNombre && (
                            <span className="text-[9px] text-wr-blue border border-wr-blue/30 px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                              {emp.grupoNombre}
                            </span>
                          )}
                          {emp.web && (
                            <a
                              href={
                                emp.web.startsWith("http")
                                  ? emp.web
                                  : `https://${emp.web}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
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
                        {emp.provincia && (
                          <div className="text-[9px] text-wr-hint mt-0.5">
                            {emp.provincia}
                          </div>
                        )}
                      </td>
                      {/* Rol + fuente */}
                      <td className="px-3 py-2 text-[10px] whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[8px] text-wr-border">
                            {emp.fuente}
                          </span>
                          <span className="text-wr-muted">
                            {emp.rol ? emp.rol.replace(/_/g, " ") : "—"}
                          </span>
                        </div>
                      </td>
                      {/* Ingresos */}
                      <td className="px-3 py-2 text-right tabular-nums text-wr-text">
                        {fmtM(emp.ingresos)}
                        {emp.anioFinanciero && (
                          <span className="text-wr-hint text-[9px] ml-1">
                            {String(emp.anioFinanciero).slice(2)}
                          </span>
                        )}
                      </td>
                      {/* EBITDA + GM% */}
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={ebitdaColor(emp.ebitdaPct)}>
                          {fmtM(emp.ebitda)}
                          {emp.ebitdaPct !== null && (
                            <span className="ml-1 text-[9px] opacity-70">
                              ({fmtPct(emp.ebitdaPct)})
                            </span>
                          )}
                        </span>
                        {emp.margenBrutoPct !== null && (
                          <span className="text-wr-hint text-[9px] ml-2">
                            GM: {fmtPct(emp.margenBrutoPct)}
                          </span>
                        )}
                      </td>
                      {/* Fecha + link BORME */}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className="text-[10px] text-wr-muted tabular-nums">
                          {fmtFechaShort(emp.ultimaFecha)}
                        </span>
                        {emp.urlBorme && (
                          <a
                            href={emp.urlBorme}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="ml-1.5 inline-flex items-center text-wr-hint hover:text-wr-blue transition-colors"
                            title="Ver en BORME"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
