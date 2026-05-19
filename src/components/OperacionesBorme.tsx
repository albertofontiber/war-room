"use client";

/**
 * OperacionesBorme — vista de señales operacionales BORME con 3 sub-vistas:
 *   - Señales M&A (fusiones, adquisiciones, posibles adquisiciones…)
 *   - Alertas personas (consolidadores no catalogados)
 *   - Actividad reciente (todos los actos BORME últimos 90 días)
 *
 * Este archivo es el orquestador: combina dos hooks (`useBormeData` para los
 * fetches, `useBormeFilters` para filtros + derivados) y compone los sub-
 * componentes extraídos en `./operaciones/*`. La lógica de presentación y
 * datos vive en cada módulo; aquí solo conectamos.
 *
 * Refactor PR #81 (split: 985 → ~150 líneas + 13 módulos en ./operaciones).
 */

import { useCallback, useState } from "react";
import { useNavegacion } from "@/lib/navegacion";
import { TopBar } from "./operaciones/TopBar";
import { DescriptionBanner } from "./operaciones/DescriptionBanner";
import { StatsBar } from "./operaciones/StatsBar";
import { SenalesTable } from "./operaciones/SenalesTable";
import { AlertasPersonasTable } from "./operaciones/AlertasPersonasTable";
import { ActividadRecienteTable } from "./operaciones/ActividadRecienteTable";
import { useBormeData } from "./operaciones/useBormeData";
import { useBormeFilters } from "./operaciones/useBormeFilters";

export default function OperacionesBorme() {
  // Sub-pestaña (senales / alertas_personas / actividad) vive en query param
  // `?op=...` para que el browser back/forward y los enlaces compartidos
  // preserven el estado. Same pattern que `vista` y `empresa`.
  const {
    seleccionarEmpresa,
    opTab: subVista,
    setOpTab: setSubVista,
  } = useNavegacion();

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const data = useBormeData(subVista);
  const f = useBormeFilters({
    items: data.items,
    personas: data.personas,
    recientes: data.recientes,
  });

  // Al hacer click en una empresa, abrimos el panel encima de la vista actual
  // (operaciones). Antes esto forzaba `setVista("mapa")` porque el panel solo
  // se renderizaba fuera de operaciones — desde que WarRoomLayout lo permite
  // en todas las vistas, basta con seleccionar la empresa.
  const handleVerPerfil = useCallback(
    (id: number) => {
      seleccionarEmpresa(id);
    },
    [seleccionarEmpresa]
  );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-wr-bg">
      <TopBar
        subVista={subVista}
        setSubVista={setSubVista}
        personasCount={data.personas.length}
        recientesCount={data.recientes.length}
        loading={data.loading}
        tiposActivos={f.tiposActivos}
        toggleTipo={f.toggleTipo}
        fechaDesde={f.fechaDesde}
        setFechaDesde={f.setFechaDesde}
        fechaHasta={f.fechaHasta}
        setFechaHasta={f.setFechaHasta}
        filtrosAplicados={f.filtrosAplicados}
        onRefresh={data.refresh}
      />

      <DescriptionBanner subVista={subVista} />

      <StatsBar
        subVista={subVista}
        filteredItems={f.filteredItems}
        loading={data.loading}
        error={data.error}
        stats={f.stats}
        filteredPersonas={f.filteredPersonas}
        loadingPersonas={data.loadingPersonas}
        errorPersonas={data.errorPersonas}
        totalApariciones={f.totalApariciones}
        filteredRecientes={f.filteredRecientes}
        loadingRecientes={data.loadingRecientes}
        errorRecientes={data.errorRecientes}
        filtrosAplicados={f.filtrosAplicados}
      />

      {/* Content — scroll vertical + horizontal en mobile (las tablas son
          densas; preferimos scroll antes que tres layouts de cards
          distintos para señales/personas/actividad). */}
      <div className="flex-1 min-h-0 overflow-auto">
        {subVista === "senales" && (
          <SenalesTable
            loading={data.loading}
            error={data.error}
            items={f.filteredItems}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            sortKey={f.sortKey}
            sortDir={f.sortDir}
            onSort={f.toggleSort}
            onVerPerfil={handleVerPerfil}
          />
        )}

        {subVista === "alertas_personas" && (
          <>
            {data.loadingPersonas && (
              <div className="flex items-center justify-center h-40">
                <p className="text-wr-muted text-sm animate-pulse">Analizando personas…</p>
              </div>
            )}
            {data.errorPersonas && (
              <div className="flex items-center justify-center h-40">
                <p className="text-red-400 text-sm">{data.errorPersonas}</p>
              </div>
            )}
            {!data.loadingPersonas && !data.errorPersonas && f.filteredPersonas.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <p className="text-wr-muted text-sm">
                  No se detectaron personas compartidas con los filtros actuales.
                </p>
              </div>
            )}
            {!data.loadingPersonas && !data.errorPersonas && f.filteredPersonas.length > 0 && (
              <AlertasPersonasTable
                personas={f.filteredPersonas}
                onVerPerfil={handleVerPerfil}
                sortKey={f.personaSortKey}
                sortDir={f.personaSortDir}
                onSort={f.togglePersonaSort}
              />
            )}
          </>
        )}

        {subVista === "actividad" && (
          <>
            {data.loadingRecientes && (
              <div className="flex items-center justify-center h-40">
                <p className="text-wr-muted text-sm animate-pulse">Cargando actividad…</p>
              </div>
            )}
            {data.errorRecientes && (
              <div className="flex items-center justify-center h-40">
                <p className="text-red-400 text-sm">Error: {data.errorRecientes}</p>
              </div>
            )}
            {!data.loadingRecientes && !data.errorRecientes && f.filteredRecientes.length === 0 && (
              <div className="flex items-center justify-center h-40">
                <p className="text-wr-muted text-sm">
                  Sin actividad para los filtros seleccionados.
                </p>
              </div>
            )}
            {!data.loadingRecientes && !data.errorRecientes && f.filteredRecientes.length > 0 && (
              <ActividadRecienteTable
                items={f.filteredRecientes}
                onVerPerfil={handleVerPerfil}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
