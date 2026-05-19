/**
 * Hook que centraliza los 2 fetches de datos de la vista OperacionesBorme:
 *
 *   - `/api/borme/operaciones` (señales M&A + disoluciones + otros actos) —
 *     eager, se carga al montar.
 *   - `/api/borme/personas-compartidas` — lazy, solo cuando subVista lo pide.
 *
 * Expone `refresh()` que invalida señales y vacía el cache lazy de personas.
 * La pestaña "Actividad reciente" se eliminó al fusionar sus tipos
 * (`disolucion`, `otros`) dentro de Señales M&A — el endpoint
 * `/api/borme/recientes` desapareció junto con esta limpieza.
 */

import { useEffect, useState } from "react";
import type { OperacionItem, PersonaCompartida, SubVista } from "./types";

export function useBormeData(subVista: SubVista) {
  const [items, setItems] = useState<OperacionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [personas, setPersonas] = useState<PersonaCompartida[]>([]);
  const [loadingPersonas, setLoadingPersonas] = useState(false);
  const [errorPersonas, setErrorPersonas] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch señales — eager (se invalida con refreshKey).
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/borme/operaciones")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [refreshKey]);

  // Fetch personas — lazy.
  useEffect(() => {
    if (subVista !== "alertas_personas" || personas.length > 0 || loadingPersonas) return;
    setLoadingPersonas(true);
    fetch("/api/borme/personas-compartidas")
      .then((r) => r.json())
      .then((d) => {
        setPersonas(d.personas ?? []);
        setLoadingPersonas(false);
      })
      .catch((e) => {
        setErrorPersonas(String(e));
        setLoadingPersonas(false);
      });
  }, [subVista, personas.length, loadingPersonas]);

  /** Vacía cache lazy de personas y dispara refetch de señales. La pestaña
   *  Alertas personas re-fetcheará cuando se vuelva a abrir. */
  const refresh = () => {
    setRefreshKey((k) => k + 1);
    setPersonas([]);
  };

  return {
    items,
    loading,
    error,
    personas,
    loadingPersonas,
    errorPersonas,
    refresh,
  };
}
