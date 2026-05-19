"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Vista } from "@/types";
import type { SubVista } from "@/components/operaciones/types";

const VISTAS_VALIDAS: Vista[] = ["mapa", "tabla", "operaciones", "grupos"];
const OP_TABS_VALIDAS: SubVista[] = ["senales", "alertas_personas"];

/**
 * Single source of truth para "qué vista" y "qué empresa abierta":
 * lectura de URL search params (`?vista=` y `?empresa=`).
 *
 * Best practice de Next 14 App Router para state que el usuario quiere
 * navegar (browser back/forward, refresh, share). Ephemeral UI (modales,
 * dropdowns, animaciones) sigue en estado local.
 *
 * Default vista = "mapa" (no se serializa para URLs limpias).
 *
 * Antes de cambiar de vista dispara `wr:beforeVistaChange` (ver MapaEspana
 * que necesita interceptar el cambio síncronamente para `setTerrain(null)`
 * antes del unmount; la suscripción al store ya no detecta este cambio).
 */
export function useNavegacion() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const vistaParam = searchParams.get("vista");
  const vista: Vista = VISTAS_VALIDAS.includes(vistaParam as Vista)
    ? (vistaParam as Vista)
    : "mapa";

  const empresaParam = searchParams.get("empresa");
  const empresaParsed = empresaParam ? parseInt(empresaParam, 10) : NaN;
  const empresaSeleccionadaId = Number.isFinite(empresaParsed) ? empresaParsed : null;
  const panelAbierto = empresaSeleccionadaId !== null;

  // Sub-pestaña dentro de /operaciones (?op=senales|alertas_personas|actividad).
  // Default "senales" — no se serializa para URLs limpias.
  const opTabParam = searchParams.get("op");
  const opTab: SubVista = OP_TABS_VALIDAS.includes(opTabParam as SubVista)
    ? (opTabParam as SubVista)
    : "senales";

  const updateParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, String(v));
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return useMemo(
    () => ({
      vista,
      empresaSeleccionadaId,
      panelAbierto,
      opTab,

      setVista: (v: Vista) => {
        if (v !== vista) {
          window.dispatchEvent(
            new CustomEvent("wr:beforeVistaChange", {
              detail: { from: vista, to: v },
            })
          );
        }
        // "mapa" es default: no serializar para URLs limpias `/`.
        updateParams({ vista: v === "mapa" ? null : v });
      },

      seleccionarEmpresa: (id: number) => updateParams({ empresa: id }),

      cerrarPanel: () => updateParams({ empresa: null }),

      // "senales" es default: no se serializa.
      setOpTab: (tab: SubVista) =>
        updateParams({ op: tab === "senales" ? null : tab }),
    }),
    [vista, empresaSeleccionadaId, panelAbierto, opTab, updateParams]
  );
}
