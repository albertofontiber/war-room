"use client";

import { useState } from "react";
import StageChevron from "@/components/StageChevron";
import { NotasSection, TareasSection, HistorialSection } from "@/components/CrmSections";
import FinderSelector from "@/components/FinderSelector";
import { diasDesde } from "@/lib/crm";
import { fmtDate } from "@/lib/format";
import type { EmpresaDetalle, DealStage } from "@/types";

/**
 * Bloque CRM (Funnel + Tareas + Historial + Notas) collapsible.
 * Default cerrado (PR #46) para que la financiera y BORME sean lo primero
 * visible al abrir el panel; el usuario expande "CRM" cuando quiere ver el
 * detalle. El sub-bloque "Funnel" tiene su propio toggle individual.
 */
export function CrmBlock({
  empresa,
  setEmpresa,
  onStageChange,
  onEmpresaChanged,
}: {
  empresa: EmpresaDetalle;
  setEmpresa: React.Dispatch<React.SetStateAction<EmpresaDetalle | null>>;
  onStageChange: (nuevo: DealStage | null) => void | Promise<void>;
  onEmpresaChanged?: () => void;
}) {
  const [crmOpen, setCrmOpen] = useState(false);
  const [funnelOpen, setFunnelOpen] = useState(false);
  const dealStage = empresa.crmEstado?.dealStage;
  const ultimaAct = empresa.ultimaActividad;
  const fechaEntrada = empresa.crmEstado?.fechaEntradaStage;
  const diasActividad = ultimaAct ? diasDesde(ultimaAct.fecha) : null;
  const diasEntrada = fechaEntrada ? diasDesde(fechaEntrada) : null;

  return (
    <div className="rounded-lg border border-wr-blue/30 bg-wr-blue/5">
      <button
        onClick={() => setCrmOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <p className="text-[10px] font-bold text-wr-blue uppercase tracking-widest">
          CRM
        </p>
        <span className="text-base text-wr-blue leading-none">{crmOpen ? "▾" : "▸"}</span>
      </button>
      {crmOpen && (
        <div className="px-3 pb-3 space-y-2">
          <div className="rounded-lg border border-wr-border bg-wr-surface2/40 p-3 space-y-2">
            <button
              onClick={() => setFunnelOpen((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <p className="text-[9px] font-semibold text-wr-muted uppercase tracking-widest">
                Funnel
              </p>
              <span className="text-base text-wr-muted leading-none">{funnelOpen ? "▾" : "▸"}</span>
            </button>
            {funnelOpen && (
              <>
                <StageChevron
                  stage={dealStage ?? null}
                  diasEnStage={
                    empresa.crmEstado?.fechaEntradaStage
                      ? diasDesde(empresa.crmEstado.fechaEntradaStage)
                      : null
                  }
                  stageDurations={empresa.stageDurations}
                  onChange={onStageChange}
                />

                {(ultimaAct || fechaEntrada) && (
                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-1">
                    {fechaEntrada && (
                      <div>
                        <p className="text-wr-hint uppercase tracking-wider text-[8px]">
                          En stage desde
                        </p>
                        <p className="text-wr-text">
                          {fmtDate(fechaEntrada)}
                          {diasEntrada != null && (
                            <span className="text-wr-hint"> · {diasEntrada}d</span>
                          )}
                        </p>
                      </div>
                    )}
                    {ultimaAct && (
                      <div>
                        <p className="text-wr-hint uppercase tracking-wider text-[8px]">
                          Última actividad
                        </p>
                        <p className="text-wr-text">
                          {fmtDate(ultimaAct.fecha)}
                          {diasActividad != null && (
                            <span className="text-wr-hint"> · hace {diasActividad}d</span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-1">
                  <p className="text-wr-hint uppercase tracking-wider text-[8px] mb-1">
                    Finder
                  </p>
                  <FinderSelector
                    empresaId={empresa.id}
                    finderActual={
                      empresa.finderSource
                        ? { id: empresa.finderSource.id, name: empresa.finderSource.name }
                        : null
                    }
                    onChange={(next) => {
                      setEmpresa((prev) =>
                        prev
                          ? {
                              ...prev,
                              finderSource: next
                                ? { id: next.id, name: next.name, email: next.email }
                                : null,
                            }
                          : prev
                      );
                      onEmpresaChanged?.();
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <TareasSection
            empresaId={empresa.id}
            finderAsignado={
              empresa.finderSource
                ? { id: empresa.finderSource.id, name: empresa.finderSource.name }
                : null
            }
          />
          <HistorialSection empresaId={empresa.id} />
          <NotasSection empresaId={empresa.id} />
        </div>
      )}
    </div>
  );
}
