"use client";

/**
 * Buscador de empresas reales por nombre o CIF, con debounce.
 *
 * Controlado por el padre: este componente solo busca y ofrece; qué se hace
 * con la empresa elegida es cosa de quien lo monta. El estado de búsqueda es
 * interno y se limpia solo al desmontar, así que el patrón es renderizarlo
 * mientras haga falta elegir y quitarlo en cuanto haya elección.
 *
 * Lo usan el modal de vincular leads y el "mover a otra empresa" de las tareas.
 */

import { useEffect, useState } from "react";
import { DEAL_STAGE_LABEL, DEAL_STAGE_PILL_CLASS } from "@/lib/crm";
import type { DealStage } from "@/types";

export type EmpresaSearchResult = {
  id: number;
  nombre: string;
  cif: string;
  provincia: string | null;
  ccaa: string | null;
  sector: string | null;
  crmEstado: { dealStage: DealStage | null } | null;
};

type Props = {
  onSelect: (empresa: EmpresaSearchResult) => void;
  /** Empresa a excluir de los resultados (normalmente, en la que ya estás). */
  excludeId?: number | null;
  autoFocus?: boolean;
  placeholder?: string;
  /** Alto máximo de la lista de resultados. */
  maxHeightClass?: string;
};

export function EmpresaPicker({
  onSelect,
  excludeId,
  autoFocus,
  placeholder = "Ej. Eivar, B60401353…",
  maxHeightClass = "max-h-[320px]",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EmpresaSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const url = new URL("/api/empresas/search", window.location.origin);
      url.searchParams.set("q", q);
      if (excludeId != null) url.searchParams.set("excludeId", String(excludeId));
      fetch(url.toString(), { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setResults(data); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 200);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, excludeId]);

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue"
      />

      {searching && <p className="text-[10px] text-wr-hint">Buscando…</p>}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-[10px] text-wr-hint italic">Sin resultados.</p>
      )}

      {results.length > 0 && (
        <div className={`border border-wr-border rounded divide-y divide-wr-border overflow-y-auto ${maxHeightClass}`}>
          {results.map((r) => {
            const stage = r.crmEstado?.dealStage;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r)}
                className="w-full text-left px-3 py-2 hover:bg-wr-surface2 transition-colors flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs text-wr-text truncate">{r.nombre}</p>
                  <p className="text-[10px] text-wr-hint truncate">
                    {r.cif}
                    {r.provincia && <> · {r.provincia}</>}
                  </p>
                </div>
                {stage && (
                  <span className={`text-[9px] border rounded px-1.5 py-0.5 whitespace-nowrap ${DEAL_STAGE_PILL_CLASS[stage]}`}>
                    {DEAL_STAGE_LABEL[stage]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
