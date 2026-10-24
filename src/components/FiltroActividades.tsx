"use client";

import { ACTIVIDADES_EMPRESA, ACTIVIDAD_LABEL, type ActividadEmpresa, type ModoActividades } from "@/lib/actividades";

export function FiltroActividades({ seleccion, modo, onSeleccionChange, onModoChange }: {
  seleccion: ActividadEmpresa[];
  modo: ModoActividades;
  onSeleccionChange: (seleccion: ActividadEmpresa[]) => void;
  onModoChange: (modo: ModoActividades) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-[10px] font-semibold text-wr-muted uppercase tracking-widest mb-2">Actividades</legend>
      <div className="flex flex-wrap gap-1.5">
        {ACTIVIDADES_EMPRESA.map((actividad) => {
          const activa = seleccion.includes(actividad);
          return (
            <button key={actividad} type="button" aria-pressed={activa}
              onClick={() => onSeleccionChange(activa ? seleccion.filter((a) => a !== actividad) : [...seleccion, actividad])}
              className={`max-lg:tap-target-h px-2 py-1 rounded text-[11px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-blue ${activa ? "bg-wr-blue/20 text-wr-blue border-wr-blue/40" : "bg-wr-surface2 text-wr-muted border-wr-border hover:border-wr-muted"}`}>
              {ACTIVIDAD_LABEL[actividad]}
            </button>
          );
        })}
      </div>
      {seleccion.length > 1 && (
        <select aria-label="Coincidencia de actividades" value={modo}
          onChange={(e) => onModoChange(e.target.value as ModoActividades)}
          className="mt-2 max-w-full max-lg:tap-target-h rounded border border-wr-border bg-wr-surface2 px-2 py-1 text-[11px] text-wr-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-blue">
          <option value="todas">Todas las seleccionadas</option>
          <option value="cualquiera">Cualquiera de las seleccionadas</option>
        </select>
      )}
      {seleccion.length > 0 && (
        <button type="button" onClick={() => onSeleccionChange([])} aria-label="Limpiar actividades"
          className="mt-1 block max-lg:tap-target-h text-[10px] text-wr-muted hover:text-wr-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-blue">Limpiar</button>
      )}
    </fieldset>
  );
}
