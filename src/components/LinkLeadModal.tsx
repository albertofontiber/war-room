"use client";

import { useEffect, useState } from "react";
import { DEAL_STAGE_LABEL, DEAL_STAGE_PILL_CLASS } from "@/lib/crm";
import { dispatchDataChanged } from "@/lib/data-events";
import type { DealStage } from "@/types";

type SearchResult = {
  id: number;
  nombre: string;
  cif: string;
  provincia: string | null;
  ccaa: string | null;
  sector: string | null;
  crmEstado: { dealStage: DealStage | null } | null;
};

type Props = {
  open: boolean;
  leadId: number;
  leadNombre: string;
  onClose: () => void;
  onLinked: (targetEmpresaId: number) => void;
};

export default function LinkLeadModal({ open, leadId, leadNombre, onClose, onLinked }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset cuando se abre/cierra
  useEffect(() => {
    if (!open) {
      setQuery(""); setResults([]); setSelected(null); setError(null);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (selected) return; // no seguir buscando tras seleccionar
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/empresas/search?q=${encodeURIComponent(q)}&excludeId=${leadId}`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setResults(data); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 200);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, open, leadId, selected]);

  if (!open) return null;

  const handleLink = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetEmpresaId: selected.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.issues
          ? json.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ")
          : json.error || `Error ${res.status}`;
        setError(msg);
        return;
      }
      // Linkear un lead a una empresa real cambia el lead (que pasa a apuntar
      // a la real) Y la empresa real (que ahora tiene metadata del lead).
      // Notifica ambas para que listas y mapa reflejen el cambio.
      dispatchDataChanged({
        resource: "empresa",
        resourceId: leadId,
        action: "delete", // lead anónimo desaparece del listado
        source: "LinkLeadModal/link",
      });
      dispatchDataChanged({
        resource: "empresa",
        resourceId: selected.id,
        action: "update",
        source: "LinkLeadModal/link",
      });
      onLinked(selected.id);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[96vw] max-h-[92vh] overflow-auto bg-wr-surface border border-wr-border rounded-lg shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-wr-border">
          <div>
            <h2 className="text-sm font-semibold text-wr-text">Vincular lead a empresa real</h2>
            <p className="text-[10px] text-wr-hint mt-0.5">
              «{leadNombre}» → empresa de la BD
            </p>
          </div>
          <button onClick={onClose} className="text-wr-muted hover:text-wr-text text-lg leading-none">×</button>
        </div>

        <div className="p-3 sm:p-5 space-y-3 text-xs">
          {!selected ? (
            <>
              <label className="flex flex-col">
                <span className="block text-[10px] font-semibold text-wr-muted uppercase tracking-wider mb-1">
                  Buscar empresa por nombre o CIF
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder="Ej. Eivar, B60401353…"
                  className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1.5 text-wr-text focus:outline-none focus:border-wr-blue"
                />
              </label>

              {searching && <p className="text-[10px] text-wr-hint">Buscando…</p>}

              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-[10px] text-wr-hint italic">Sin resultados.</p>
              )}

              {results.length > 0 && (
                <div className="border border-wr-border rounded divide-y divide-wr-border max-h-[320px] overflow-y-auto">
                  {results.map((r) => {
                    const stage = r.crmEstado?.dealStage;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className="w-full text-left px-3 py-2 hover:bg-wr-surface2 transition-colors flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-wr-text truncate">{r.nombre}</p>
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
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded border border-wr-border bg-wr-surface2/40 p-3">
                <p className="text-[10px] text-wr-hint uppercase tracking-wider mb-1">Target seleccionado</p>
                <p className="text-wr-text font-medium">{selected.nombre}</p>
                <p className="text-[10px] text-wr-muted">{selected.cif}</p>
                <button
                  onClick={() => setSelected(null)}
                  className="mt-2 text-[10px] text-wr-blue hover:underline"
                >
                  Cambiar
                </button>
              </div>

              <div className="rounded border border-wr-amber/30 bg-wr-amber/5 p-3 text-[11px] text-wr-text leading-relaxed">
                <p className="font-semibold text-wr-amber mb-1">Confirma la vinculación</p>
                <ul className="list-disc list-inside space-y-0.5 text-wr-muted">
                  <li>Todas las notas, tareas, actividades y CrmLog del lead pasan a <span className="text-wr-text">{selected.nombre}</span>.</li>
                  <li>El stage, fecha de entrada y owner del lead <span className="text-wr-text">sobrescriben</span> los del target.</li>
                  <li>Si el lead tiene finder y el target no, se hereda.</li>
                  <li>Financieros: se mueven los años que no existan ya en el target.</li>
                  <li>El lead <span className="text-wr-red">«{leadNombre}» se eliminará</span>.</li>
                </ul>
                <p className="mt-2 text-[10px] text-wr-hint">Esta acción no se puede deshacer.</p>
              </div>
            </div>
          )}

          {error && <p className="text-wr-red text-[11px]">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-wr-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-xs px-3 py-2 sm:py-1.5 bg-wr-surface2 border border-wr-border rounded text-wr-muted hover:text-wr-text"
            >
              Cancelar
            </button>
            {selected && (
              <button
                type="button"
                onClick={handleLink}
                disabled={submitting}
                className="text-xs px-3 py-2 sm:py-1.5 bg-wr-blue text-white rounded hover:bg-wr-blue-light disabled:opacity-40"
              >
                {submitting ? "Vinculando…" : "Vincular y eliminar lead"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
