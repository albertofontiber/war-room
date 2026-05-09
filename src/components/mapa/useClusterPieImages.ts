"use client";

// Hook que mantiene sincronizadas las imágenes (sprites) de los clusters
// del mapa con el conjunto actual de clusters visibles.
//
// Estrategia (dos canales, idempotentes):
//
// 1) Pre-registro en `useLayoutEffect` — cuando cambia `clusterMarkers`,
//    generamos cada icon con canvas y lo añadimos vía `addImage` ANTES de
//    que Mapbox paint el siguiente frame. Esto evita el flash de iconos
//    perdidos en el caso normal.
//
// 2) Listener `styleimagemissing` — Mapbox emite este evento cuando un
//    symbol layer referencia un `icon-image` desconocido. El handler
//    reconstruye la firma visual del cluster a partir del ID (que codifica
//    `count|stage_counts`) y registra la imagen on-demand. Mapbox repinta
//    automáticamente el tile afectado tras el `addImage`.
//
// El listener es la red de seguridad real — sin él, una race entre la
// actualización del Source (síncrona en commit) y el `useEffect` que
// hacía addImage (post-commit) provocaba que Mapbox descartara silenciosamente
// los símbolos cuyo icon aún no estaba registrado. PRs #31/#35/#36/#74 fueron
// iteraciones sobre ese mismo síntoma; este es el fix idiomático.

import { useEffect, useLayoutEffect, useRef } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import {
  clusterPieIconId,
  clusterPieKey,
  generateClusterPieImage,
} from "./clusterPieIcon";
import { PIE_STAGES, type ClusterMarker } from "./ClusterPie";

const ID_PREFIX = "cluster-pie:";

/** Reconstruye un `ClusterMarker` mínimo (count + stageCounts) desde el ID
 *  registrado. Usado por el handler de `styleimagemissing`, que solo recibe
 *  el ID. Devuelve `null` si el formato no coincide o los números no parsean. */
function markerFromIconId(id: string): ClusterMarker | null {
  if (!id.startsWith(ID_PREFIX)) return null;
  const key = id.slice(ID_PREFIX.length);
  const sep = key.indexOf("|");
  if (sep < 0) return null;
  const count = Number(key.slice(0, sep));
  if (!Number.isFinite(count) || count <= 0) return null;
  const counts = key.slice(sep + 1).split(",").map(Number);
  if (counts.length !== PIE_STAGES.length) return null;
  if (counts.some((n) => !Number.isFinite(n))) return null;
  const stageCounts: Record<string, number> = {};
  PIE_STAGES.forEach((s, i) => { stageCounts[s.key] = counts[i]; });
  return { id: 0, lng: 0, lat: 0, count, stageCounts };
}

export function useClusterPieImages(
  mapRef: React.RefObject<MapRef>,
  clusterMarkers: ClusterMarker[],
) {
  // IDs de icons que hemos registrado nosotros y siguen vivos.
  const registeredIdsRef = useRef<Set<string>>(new Set());

  // Pre-registro síncrono antes del paint del siguiente frame.
  // useLayoutEffect (no useEffect) garantiza que addImage corre tras la
  // actualización del Source pero antes del RAF de Mapbox que pinta — sin
  // esto, Mapbox dropea symbols con icon-image inexistente y no reintenta
  // hasta que algo invalide el tile.
  useLayoutEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (!map.isStyleLoaded()) return;

    const seen = new Set<string>();

    for (const m of clusterMarkers) {
      const key = clusterPieKey(m);
      const id = clusterPieIconId(key);
      seen.add(id);
      if (registeredIdsRef.current.has(id)) continue;
      // Mapbox puede tener la imagen registrada por nosotros mismos en
      // un mount anterior con `reuseMaps`. `hasImage` es la verdad.
      if (map.hasImage(id)) {
        registeredIdsRef.current.add(id);
        continue;
      }
      const img = generateClusterPieImage(m);
      if (!img) continue;
      map.addImage(id, img.imageData, { pixelRatio: 2 });
      registeredIdsRef.current.add(id);
    }

    // Eliminar los icons que ya no aparecen entre los clusters visibles.
    // Limita el crecimiento sin cota cuando el usuario hace pan/zoom.
    // `Array.from` evita iterar el Set directamente (TS la exige con
    // target ≥ es2015).
    for (const id of Array.from(registeredIdsRef.current)) {
      if (seen.has(id)) continue;
      if (map.hasImage(id)) map.removeImage(id);
      registeredIdsRef.current.delete(id);
    }
  }, [clusterMarkers, mapRef]);

  // Listener de seguridad: si Mapbox encuentra un icon-image referenciado
  // que no está registrado (race con el pre-registro, reuseMaps, style
  // recargada), lo generamos on-demand reconstruyendo la firma desde el ID.
  //
  // Importante: react-map-gl 8 carga `mapbox-gl` asíncronamente vía dynamic
  // `import()`, así que `mapRef.current?.getMap()` devuelve null durante los
  // primeros renders. Un `useEffect [mapRef]` corre UNA vez con map=null y
  // no se vuelve a ejecutar (mapRef es estable, su .current cambia sin
  // notificar). Por eso usamos retry-poll igual que hace MapaEspana.tsx con
  // los iconos shape-square/hexagon.
  useEffect(() => {
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let attachedMap: ReturnType<NonNullable<typeof mapRef.current>["getMap"]> | null = null;

    const onMissing = (e: { id: string }) => {
      if (!attachedMap || !e.id.startsWith(ID_PREFIX)) return;
      if (attachedMap.hasImage(e.id)) return;
      const marker = markerFromIconId(e.id);
      if (!marker) return;
      const img = generateClusterPieImage(marker);
      if (!img) return;
      attachedMap.addImage(e.id, img.imageData, { pixelRatio: 2 });
      registeredIdsRef.current.add(e.id);
    };

    const tryAttach = () => {
      if (cancelled || attachedMap) return;
      const m = mapRef.current?.getMap();
      if (!m) {
        retryTimeout = setTimeout(tryAttach, 50);
        return;
      }
      attachedMap = m;
      m.on("styleimagemissing", onMissing);
    };

    tryAttach();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (attachedMap) attachedMap.off("styleimagemissing", onMissing);
    };
  }, [mapRef]);

  // Cleanup al desmontar: limpiar TODOS los icons registrados por este
  // hook. Necesario porque con `reuseMaps` el Map sobrevive al unmount
  // del componente y de otro modo dejaríamos basura entre cambios de
  // vista.
  useEffect(() => {
    // Capturamos el Set y mapRef en el cierre del effect para satisfacer
    // a `react-hooks/exhaustive-deps` (el ref puede cambiar de identidad
    // entre montajes y queremos los valores capturados en este montaje).
    const ids = registeredIdsRef.current;
    const ref = mapRef;
    return () => {
      const map = ref.current?.getMap();
      if (!map) {
        ids.clear();
        return;
      }
      for (const id of Array.from(ids)) {
        try {
          if (map.hasImage(id)) map.removeImage(id);
        } catch {
          // Map en teardown — ignorar.
        }
      }
      ids.clear();
    };
  }, [mapRef]);
}
