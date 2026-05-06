"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/format";
import { getBormeTipo } from "@/lib/borme-constants";
import type { EmpresaDetalle } from "@/types";
import { SectionLabel } from "./primitives";
import { bormeContexto } from "./constants";

export function BormeSenales({ empresa }: { empresa: EmpresaDetalle }) {
  const [expandBorme, setExpandBorme] = useState(false);
  if (empresa.bormeAlertas.length === 0) return null;

  return (
    <div>
      <SectionLabel>
        Señales BORME ({empresa.bormeAlertas.length})
      </SectionLabel>
      <div className="space-y-2">
        {(expandBorme ? empresa.bormeAlertas : empresa.bormeAlertas.slice(0, 5)).map((a) => {
          const cfg = getBormeTipo(a.tipoActo);
          const contexto = bormeContexto(a.tipoActo, a.grupoInferido?.nombre);
          return (
            <div key={a.id} className="flex items-start gap-2 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${cfg.pill}`}>
                    {cfg.label}
                  </span>
                  {contexto && (
                    <span className="text-wr-muted text-[10px]">{contexto}</span>
                  )}
                </div>
                {a.descripcion && (
                  <p className="text-wr-muted leading-snug line-clamp-2 mt-0.5">
                    {a.descripcion}
                  </p>
                )}
                <p className="text-wr-hint text-[10px] mt-0.5">
                  {fmtDate(a.fecha)}
                  {a.urlBorme && (
                    <>
                      {" · "}
                      <a
                        href={a.urlBorme}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-wr-blue hover:underline"
                      >
                        Ver BORME ↗
                      </a>
                    </>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {empresa.bormeAlertas.length > 5 && (
        <button
          onClick={() => setExpandBorme(!expandBorme)}
          className="mt-2 text-[10px] text-wr-blue hover:underline"
        >
          {expandBorme
            ? "Ver menos ↑"
            : `Ver todas (${empresa.bormeAlertas.length}) ↓`}
        </button>
      )}
    </div>
  );
}
