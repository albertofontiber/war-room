"use client";

// Overlay de leyenda (formas por sector + colores por stage CRM).
// En desktop (lg+) está siempre desplegada. En mobile/tablet se colapsa
// detrás de un botón "Leyenda" para no tapar el mapa.

import { useState } from "react";

export function Leyenda() {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute bottom-6 right-4 z-10">
      {/* Botón toggle: visible solo en <lg cuando está cerrada. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="lg:hidden bg-wr-surface/90 border border-wr-border rounded-lg px-2.5 py-1.5 text-[11px] text-wr-muted backdrop-blur-sm flex items-center gap-1.5 hover:text-wr-text"
          aria-label="Mostrar leyenda"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          Leyenda
        </button>
      )}

      {/* Panel de leyenda. lg+: siempre visible. <lg: condicionado por `open`. */}
      <div
        className={`${open ? "block" : "hidden"} lg:block bg-wr-surface/90 border border-wr-border rounded-lg px-3 py-2.5 text-[11px] space-y-1.5 backdrop-blur-sm max-h-[60vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between mb-1 lg:hidden">
          <p className="text-wr-hint uppercase tracking-wider">Leyenda</p>
          <button
            onClick={() => setOpen(false)}
            className="text-wr-hint hover:text-wr-text"
            aria-label="Cerrar leyenda"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-wr-hint uppercase tracking-wider mb-1 hidden lg:block">Sector</p>
        <p className="text-wr-hint uppercase tracking-wider mb-1 lg:hidden text-[9px]">Sector</p>
        <div className="flex items-center gap-2 text-wr-muted">
          <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#64748b" /></svg>
          PCI
        </div>
        <div className="flex items-center gap-2 text-wr-muted">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="2" fill="#64748b" /></svg>
          Seg. Electrónica
        </div>
        <div className="flex items-center gap-2 text-wr-muted">
          <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,0.5 9.5,3 9.5,7 5,9.5 0.5,7 0.5,3" fill="#64748b" /></svg>
          Mixto
        </div>
        <div className="border-t border-wr-border mt-1.5 pt-1.5 space-y-1">
          <p className="text-wr-hint uppercase tracking-wider mb-1">CRM</p>
          {[
            ["#6b7280", "Sin CRM"],
            ["#94a3b8", "Identificado"],
            ["#38bdf8", "Contactado"],
            ["#3b82f6", "1ª reunión realizada"],
            ["#8b5cf6", "Análisis"],
            ["#f59e0b", "LOI enviada"],
            ["#f97316", "Ejecución"],
            ["#22c55e", "Portfolio"],
            ["#a8a29e", "On hold"],
            ["#ef4444", "Muerto"],
          ].map(([color, label]) => (
            <div key={label} className="flex items-center gap-2 text-wr-muted">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
