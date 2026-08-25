"use client";

import { useCallback, useEffect, useState } from "react";
import { dispatchDataChanged } from "@/lib/data-events";
import { useMobileViewportRecovery } from "@/lib/use-mobile-viewport-recovery";
import { EmpresaPicker, type EmpresaSearchResult } from "@/components/EmpresaPicker";

type Props = {
  open: boolean;
  leadId: number;
  leadNombre: string;
  onClose: () => void;
  onLinked: (targetEmpresaId: number) => void;
};

export default function LinkLeadModal({ open, leadId, leadNombre, onClose, onLinked }: Props) {
  const [selected, setSelected] = useState<EmpresaSearchResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recoverMobileViewport = useMobileViewportRecovery();

  const closeModal = useCallback(() => {
    recoverMobileViewport();
    onClose();
  }, [onClose, recoverMobileViewport]);

  // Reset al cerrar. La búsqueda vive dentro de EmpresaPicker, que se
  // desmonta al elegir y al cerrar, así que se limpia sola.
  useEffect(() => {
    if (!open) {
      setSelected(null); setError(null);
    }
  }, [open]);

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
      closeModal();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
      onClick={closeModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] max-h-full overflow-y-auto overscroll-contain bg-wr-surface border border-wr-border rounded-lg shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-wr-border">
          <div>
            <h2 className="text-sm font-semibold text-wr-text">Vincular lead a empresa real</h2>
            <p className="text-[10px] text-wr-hint mt-0.5">
              «{leadNombre}» → empresa de la BD
            </p>
          </div>
          <button onClick={closeModal} className="text-wr-muted hover:text-wr-text text-lg leading-none">×</button>
        </div>

        <div className="p-3 sm:p-5 space-y-3 text-xs">
          {!selected ? (
            <label className="flex flex-col">
              <span className="block text-[10px] font-semibold text-wr-muted uppercase tracking-wider mb-1">
                Buscar empresa por nombre o CIF
              </span>
              <EmpresaPicker onSelect={setSelected} excludeId={leadId} autoFocus />
            </label>
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
              onClick={closeModal}
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
