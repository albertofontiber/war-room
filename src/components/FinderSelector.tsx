"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dispatchDataChanged, subscribeDataChanged } from "@/lib/data-events";

type Finder = {
  id: string;
  name: string;
  email: string;
  commissionPct?: number | null;
};

type Props = {
  empresaId: number;
  finderActual: { id: string; name: string } | null;
  onChange?: (next: Finder | null) => void;
};

/**
 * Selector de finder para la ficha de empresa. Dropdown con finders activos.
 * Permite asignar, cambiar, o desasignar (eliminar finder source).
 */
export default function FinderSelector({ empresaId, finderActual, onChange }: Props) {
  const [finders, setFinders] = useState<Finder[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadFinders = useCallback(() => {
    fetch("/api/finders", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setFinders(data))
      .catch(() => setFinders([]));
  }, []);

  useEffect(() => { loadFinders(); }, [loadFinders]);

  // Refresca cuando alguien crea/edita/desactiva finders en /finders. Sin
  // este listener, abrir el dropdown tras editar muestra el nombre viejo.
  useEffect(
    () => subscribeDataChanged({ resource: "finder" }, () => loadFinders()),
    [loadFinders]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const asignar = useCallback(
    async (finderId: string | null) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/empresas/${empresaId}/finder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finderId }),
        });
        if (res.ok) {
          const next = finderId ? finders.find((f) => f.id === finderId) ?? null : null;
          onChange?.(next);
          // El cambio de finder source de una empresa es un cambio de la
          // empresa, no del finder en sí — el listado de finders no varía.
          dispatchDataChanged({
            resource: "empresa",
            resourceId: empresaId,
            action: "update",
            source: "FinderSelector/asignar",
          });
        }
      } finally {
        setLoading(false);
        setOpen(false);
      }
    },
    [empresaId, finders, onChange]
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="w-full flex items-center justify-between text-[11px] text-wr-text border border-wr-border rounded px-2 py-1.5 bg-wr-surface2 hover:bg-wr-surface transition-colors disabled:opacity-50"
      >
        <span className="flex items-center gap-2 truncate">
          {finderActual ? (
            <>
              <span className="text-[9px] bg-wr-blue/20 text-wr-blue border border-wr-blue/30 rounded px-1 py-0.5 font-medium flex-shrink-0">
                F
              </span>
              <span className="truncate">{finderActual.name}</span>
            </>
          ) : (
            <span className="text-wr-muted">Sin finder asignado</span>
          )}
        </span>
        <span className="text-wr-hint flex-shrink-0 ml-1">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-wr-surface border border-wr-border rounded-lg shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
          {finders.length === 0 && (
            <p className="text-[10px] text-wr-hint italic text-center py-2">
              No hay finders activos. Créalos en /admin/finders.
            </p>
          )}
          {finders.map((f) => (
            <button
              key={f.id}
              onClick={() => asignar(f.id)}
              className={`w-full text-left text-xs px-3 py-1.5 flex items-center gap-2 hover:bg-wr-surface2 transition-colors ${
                f.id === finderActual?.id ? "text-wr-text font-medium bg-wr-surface2/50" : "text-wr-muted"
              }`}
            >
              <span className="text-[9px] bg-wr-blue/20 text-wr-blue border border-wr-blue/30 rounded px-1 py-0.5 font-medium flex-shrink-0">
                F
              </span>
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-[9px] text-wr-hint">{f.email}</span>
            </button>
          ))}
          {finderActual && (
            <>
              <div className="border-t border-wr-border" />
              <button
                onClick={() => asignar(null)}
                className="w-full text-left text-xs px-3 py-1.5 text-wr-red hover:bg-wr-red/10 transition-colors"
              >
                Desasignar finder
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
