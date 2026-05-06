/**
 * Hook que centraliza los 3 fetches de datos de la vista OperacionesBorme:
 *
 *   - `/api/borme/operaciones` (señales M&A) — eager, se carga al montar.
 *   - `/api/borme/personas-compartidas` — lazy, solo cuando subVista lo pide.
 *   - `/api/borme/recientes` — lazy, idem.
 *
 * Expone `refresh()` que invalida señales y vacía los caches lazy. Las
 * sub-vistas que pidan los datos volverán a fetchearlos al cambiar a esa pestaña.
 */

import { useEffect, useState } from "react";
import type { OperacionItem, PersonaCompartida, RecienteItem, SubVista } from "./types";

export function useBormeData(subVista: SubVista) {
  const [items, setItems] = useState<OperacionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [personas, setPersonas] = useState<PersonaCompartida[]>([]);
  const [loadingPersonas, setLoadingPersonas] = useState(false);
  const [errorPersonas, setErrorPersonas] = useState<string | null>(null);

  const [recientes, setRecientes] = useState<RecienteItem[]>([]);
  const [loadingRecientes, setLoadingRecientes] = useState(false);
  const [errorRecientes, setErrorRecientes] = useState<string | null>(null);

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

  // Fetch actividad reciente — lazy.
  useEffect(() => {
    if (subVista !== "actividad" || recientes.length > 0 || loadingRecientes) return;
    setLoadingRecientes(true);
    fetch("/api/borme/recientes")
      .then((r) => r.json())
      .then((d) => {
        setRecientes(d.items ?? []);
        setLoadingRecientes(false);
      })
      .catch((e) => {
        setErrorRecientes(String(e));
        setLoadingRecientes(false);
      });
  }, [subVista, recientes.length, loadingRecientes]);

  /** Vacía caches lazy y dispara refetch de señales. Las sub-vistas relevantes
   *  re-fetchearán cuando se vuelvan a abrir. */
  const refresh = () => {
    setRefreshKey((k) => k + 1);
    setPersonas([]);
    setRecientes([]);
  };

  return {
    items,
    loading,
    error,
    personas,
    loadingPersonas,
    errorPersonas,
    recientes,
    loadingRecientes,
    errorRecientes,
    refresh,
  };
}
