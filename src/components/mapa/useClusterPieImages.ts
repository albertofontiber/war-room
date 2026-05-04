"use client";

// Hook que mantiene sincronizadas las imágenes (sprites) de los clusters
// del mapa con el conjunto actual de clusters visibles. Cada render se
// procesa el delta:
//   - Para cada cluster nuevo o cuyo aspecto haya cambiado, generar el
//     ImageData del donut y registrarlo con `map.addImage(id, …, { pixelRatio: 2 })`.
//   - Para cada icon registrado que ya no aparezca, hacer `map.removeImage(id)`.
//
// El layer Mapbox `cluster-pies` referencia el icon vía `icon-image`
// usando la propiedad `iconImageId` que dejamos en cada feature del
// GeoJSON. La función `clusterPieIconId(key)` deriva el id desde el hash
// visual (count + proporción), así clusters con misma forma comparten icon.

import { useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import {
  clusterPieIconId,
  clusterPieKey,
  generateClusterPieImage,
} from "./clusterPieIcon";
import type { ClusterMarker } from "./ClusterPie";

export function useClusterPieImages(
  mapRef: React.RefObject<MapRef>,
  clusterMarkers: ClusterMarker[],
) {
  // IDs de icons que hemos registrado nosotros y siguen vivos.
  const registeredIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
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
