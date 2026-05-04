"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import Map, {
  Source,
  Layer,
  type MapRef,
  type MapMouseEvent,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import Supercluster from "supercluster";
import { useWarRoomStore, type EmpresaFeatureProperties } from "@/store/useWarRoomStore";
import { isInFilter } from "@/lib/filtros";
import MapTooltip from "@/components/MapTooltip";
import { CRM_COLOR, makeSizeExpr, makeIconSizeExpr } from "@/components/mapa/expresiones";
import { createShapeIcon } from "@/components/mapa/icons";
import { pointInPolygon } from "@/components/mapa/geometry";
import { type ClusterMarker } from "@/components/mapa/ClusterPie";
import { clusterPieIconId, clusterPieKey } from "@/components/mapa/clusterPieIcon";
import { useClusterPieImages } from "@/components/mapa/useClusterPieImages";
import { SeleccionAreaPanel } from "@/components/mapa/SeleccionAreaPanel";
import { Leyenda } from "@/components/mapa/Leyenda";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

// Alias usado por tipos locales del componente principal (las copias que
// viven en SeleccionAreaPanel y otros sub-componentes son independientes).
type Props = EmpresaFeatureProperties;

// ─── Componente ──────────────────────────────────────────────────────────

interface TooltipState {
  x: number;
  y: number;
  props: TooltipProps["props"];
}

type TooltipProps = React.ComponentProps<typeof MapTooltip>;

type GeoJSONFC = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: Props }>;
};

// `cluster-pies` se incluye al final para que un click sobre un cluster gane
// al click sobre un marker individual (Mapbox respeta el orden de la lista).
const INTERACTIVE = ["cluster-pies", "markers-pci", "markers-segelec", "markers-mixto", "markers-bg"];

export default function MapaEspana() {
  const mapRef = useRef<MapRef>(null);
  const {
    filtros,
    sizeMetric,
    seleccionarEmpresa,
    searchQuery,
    empresasGeoJSON,
    flyToEmpresaId,
    setFlyToEmpresaId,
    mapViewState,
    setMapViewState,
    mapBounds,
    setMapBounds,
    panelAbierto,
  } = useWarRoomStore();

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [iconsReady, setIconsReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ── Draw-polygon state ─────────────────────────────────────────────────
  const closingRef = useRef(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [drawMouse, setDrawMouse] = useState<[number, number] | null>(null);
  const [selectedPolygon, setSelectedPolygon] = useState<[number, number][] | null>(null);
  const [panelHeight, setPanelHeight] = useState(360); // px — altura del panel selección
  const resizingRef = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  // Resize map when panel opens/closes so it fills the available width
  useEffect(() => {
    const t = setTimeout(() => { mapRef.current?.getMap().resize(); }, 50);
    return () => clearTimeout(t);
  }, [panelAbierto]);

  // El fetch de /api/empresas vive en Navbar (hydrateEmpresas, race-safe).
  // Antes había un fallback aquí + en Sidebar — los 3 efectos arrancaban en el
  // mismo tick y la guarda `if (geoJSON)` no detenía las réplicas porque
  // setState aún no había propagado. Ahora MapaEspana consume del store sin
  // fetch propio (audit perf 2026-05-01).

  const rawGeoJSON = useMemo<GeoJSONFC | null>(
    () => empresasGeoJSON
      ? { type: "FeatureCollection" as const, features: empresasGeoJSON as GeoJSONFC["features"] }
      : null,
    [empresasGeoJSON]
  );

  // FlyTo when triggered from Sidebar
  useEffect(() => {
    if (!flyToEmpresaId || !rawGeoJSON) return;
    const feature = rawGeoJSON.features.find(
      (f) => (f.properties.id as number) === flyToEmpresaId
    );
    if (feature) {
      const [lng, lat] = feature.geometry.coordinates;
      mapRef.current?.getMap().easeTo({ center: [lng, lat], zoom: 12, duration: 800 });
    }
    setFlyToEmpresaId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToEmpresaId]);

  // Client-side filter computation — dos sources:
  // 1. geojson: solo empresas que pasan el filtro (clusterizado, opacidad total)
  // 2. geojsonBg: empresas que NO pasan el filtro (sin cluster, opacidad baja)
  const { geojson, geojsonBg } = useMemo(() => {
    if (!rawGeoJSON) return { geojson: null, geojsonBg: null };
    const inFilter: typeof rawGeoJSON.features = [];
    const outFilter: typeof rawGeoJSON.features = [];
    for (const f of rawGeoJSON.features) {
      if (isInFilter(f.properties, filtros, searchQuery)) inFilter.push(f);
      else outFilter.push(f);
    }
    return {
      geojson: { ...rawGeoJSON, features: inFilter },
      geojsonBg: { ...rawGeoJSON, features: outFilter },
    };
  }, [rawGeoJSON, filtros, searchQuery]);

  // Empresas dentro del polígono — reactivo a cambios de filtros/search
  const seleccionArea = useMemo<Props[] | null>(() => {
    if (!selectedPolygon || !geojson) return null;
    return geojson.features
      .filter((f) =>
        pointInPolygon(
          [f.geometry.coordinates[0], f.geometry.coordinates[1]],
          selectedPolygon
        )
      )
      .map((f) => f.properties);
  }, [selectedPolygon, geojson]);

  // Helper: extrae y persiste los bounds actuales del mapa
  const saveBounds = useCallback(() => {
    const b = mapRef.current?.getMap().getBounds();
    if (b) setMapBounds({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
  }, [setMapBounds]);

  // ── Cluster pies + features individuales — Supercluster JS único ────────
  //
  // Antes (PRs #31/#35/#36/#37): los pies se calculaban via `querySourceFeatures`
  // contra el cluster interno de Mapbox. Eso introducía dependencias de timing
  // que generaron 4 bugs sucesivos.
  //
  // Iteración previa de este Nivel 2: Supercluster JS para los pies + cluster
  // Mapbox para los individuales. Resultado: AMBOS sistemas pueden divergir
  // sutilmente en qué consideran cluster vs individual aunque tengan los
  // mismos params → faltan features en el render.
  //
  // Iteración definitiva (esta): Supercluster JS es la **única** fuente de
  // verdad. Particionamos el output de getClusters() en:
  //   - clusters (>=2) → layer Mapbox `cluster-pies` con icon-image
  //                      generado por canvas (ver `useClusterPieImages`)
  //   - individuales  → los pasamos al Source Mapbox SIN clustering;
  //                     los Layers `markers-pci/segelec/mixto` los dibujan.
  // Imposible que diverjan: solo hay un cálculo de clustering en toda la app.

  type ClusterAggregateProps = {
    s_id: number;
    s_ct: number;
    s_pr: number;
    s_an: number;
    s_lo: number;
    s_ex: number;
    s_po: number;
    s_mu: number;
  };

  // Index de Supercluster — se reconstruye atomicamente cuando cambia el
  // conjunto filtrado. Lo hacemos en useMemo (no useEffect) para evitar el
  // race condition "useMemo de getClusters corre antes que useEffect de load".
  // Coste: ~10-30ms para reconstruir 5k features. Se ejecuta solo cuando
  // cambian los filtros (geojson nueva referencia), no en cada pan/zoom.
  const clusterIndex = useMemo(() => {
    if (!geojson || geojson.features.length === 0) return null;
    const sc = new Supercluster<EmpresaFeatureProperties, ClusterAggregateProps>({
      radius: 50,        // mismo clusterRadius que el Source Mapbox
      maxZoom: 10,       // mismo clusterMaxZoom
      map: (props) => ({
        s_id: props.dealStage === "identificado"    ? 1 : 0,
        s_ct: props.dealStage === "contactado"      ? 1 : 0,
        s_pr: props.dealStage === "primera_reunion" ? 1 : 0,
        s_an: props.dealStage === "analisis"        ? 1 : 0,
        s_lo: props.dealStage === "LOI enviada"     ? 1 : 0,
        s_ex: props.dealStage === "execution"       ? 1 : 0,
        s_po: props.dealStage === "portfolio"       ? 1 : 0,
        s_mu: props.dealStage === "muerto"          ? 1 : 0,
      }),
      reduce: (acc, props) => {
        acc.s_id += props.s_id;
        acc.s_ct += props.s_ct;
        acc.s_pr += props.s_pr;
        acc.s_an += props.s_an;
        acc.s_lo += props.s_lo;
        acc.s_ex += props.s_ex;
        acc.s_po += props.s_po;
        acc.s_mu += props.s_mu;
      },
    });
    sc.load(
      geojson.features as Array<GeoJSON.Feature<GeoJSON.Point, EmpresaFeatureProperties>>
    );
    return sc;
  }, [geojson]);

  // Particionar el output de getClusters en clusters (>=2) e individuales.
  // Determinista: deps explícitas, sin listeners ni timeouts. Cambia cuando
  // cambian filtros (vía clusterIndex), bounds o zoom.
  //
  // Importante: el Source Mapbox YA NO clusteriza (cluster: false en el
  // <Source>). Mapbox sólo dibuja las individuales que pasamos en
  // `individualFeatures`. Así Supercluster JS es la ÚNICA fuente de verdad
  // sobre qué se considera cluster vs individual — imposible que diverjan.
  const { clusterMarkers, individualFeatures } = useMemo<{
    clusterMarkers: ClusterMarker[];
    individualFeatures: GeoJSONFC["features"];
  }>(() => {
    if (!clusterIndex) return { clusterMarkers: [], individualFeatures: [] };
    // Si aún no hay bounds (primer render antes de onLoad/onMoveEnd), usar
    // bbox del mundo para devolver TODOS los items. Mapbox sólo pintará los
    // que estén en el viewport visible.
    const bbox: [number, number, number, number] = mapBounds
      ? [mapBounds.west, mapBounds.south, mapBounds.east, mapBounds.north]
      : [-180, -85, 180, 85];
    const zoom = Math.floor(mapViewState.zoom);
    const items = clusterIndex.getClusters(bbox, zoom);

    const clusters: ClusterMarker[] = [];
    const individuals: GeoJSONFC["features"] = [];

    for (const item of items) {
      const props = item.properties;
      if (props && "cluster" in props && props.cluster === true) {
        const cp = props as ClusterAggregateProps & {
          cluster: true; cluster_id: number; point_count: number;
        };
        const [lng, lat] = (item.geometry as GeoJSON.Point).coordinates;
        const stageCounts: Record<string, number> = {
          identificado:    cp.s_id,
          contactado:      cp.s_ct,
          primera_reunion: cp.s_pr,
          analisis:        cp.s_an,
          "LOI enviada":   cp.s_lo,
          execution:       cp.s_ex,
          portfolio:       cp.s_po,
          muerto:          cp.s_mu,
        };
        const knownSum = Object.values(stageCounts).reduce((a, v) => a + v, 0);
        // Sin CRM (dealStage null) = total - todos los stages conocidos.
        // Lo agregamos a "identificado" para mantener el comportamiento
        // histórico del pie chart (gris). Si en el futuro queremos un sector
        // "Sin CRM" aparte en el pie, separar aquí.
        stageCounts["identificado"] += Math.max(0, cp.point_count - knownSum);
        clusters.push({
          id: cp.cluster_id,
          lng,
          lat,
          count: cp.point_count,
          stageCounts,
        });
      } else {
        // Feature individual — Supercluster preserva las propiedades originales.
        individuals.push(
          item as unknown as GeoJSONFC["features"][number]
        );
      }
    }
    return { clusterMarkers: clusters, individualFeatures: individuals };
  }, [clusterIndex, mapBounds, mapViewState.zoom]);

  // GeoJSON de los clusters consumido por el layer Mapbox `cluster-pies`.
  // Cada feature lleva un `iconImageId` derivado de la firma visual del
  // donut (count + proporción) — el hook `useClusterPieImages` se encarga
  // de registrar esa imagen en el mapa antes de que el layer la pinte.
  const clusterPiesGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: "FeatureCollection",
    features: clusterMarkers.map((m) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [m.lng, m.lat] },
      properties: {
        cluster_id: m.id,
        count: m.count,
        iconImageId: clusterPieIconId(clusterPieKey(m)),
      },
    })),
  }), [clusterMarkers]);

  // Sincroniza los icons (sprites) del map con los clusters visibles —
  // genera el ImageData de cada donut con `addImage` y limpia con
  // `removeImage` los que ya no aparecen.
  useClusterPieImages(mapRef, clusterMarkers);

  // ── Asegurar custom icons al montar (independiente de eventos Mapbox) ───
  //
  // Con reuseMaps, onLoad NO se dispara al remount (e.g. al volver de tabla
  // → mapa). Si dependemos solo de onLoad/onIdle para cargar los íconos,
  // los Layers condicionales `{iconsReady && <Layer markers-segelec/mixto/>}`
  // pueden quedar sin montar mientras tanto. Resultado: features
  // Mixto/Seg.Electrónica aisladas no se renderizan.
  //
  // Fix: poll-retry hasta tener mapRef.current y cargar los íconos
  // directamente. No depende de eventos del Map. Idempotente vía hasImage.
  useEffect(() => {
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const ensureIcons = () => {
      if (cancelled) return;
      const map = mapRef.current?.getMap();
      if (!map) {
        retryTimeout = setTimeout(ensureIcons, 50);
        return;
      }
      if (!map.hasImage("shape-square")) {
        const sq = createShapeIcon("square");
        if (sq) map.addImage("shape-square", sq, { sdf: true });
      }
      if (!map.hasImage("shape-hexagon")) {
        const hex = createShapeIcon("hexagon");
        if (hex) map.addImage("shape-hexagon", hex, { sdf: true });
      }
      if (map.hasImage("shape-square") && map.hasImage("shape-hexagon")) {
        setIconsReady(true);
      }
    };

    ensureIcons();
    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [mounted]);

  // Desactivar terrain ANTES de que se destruya el árbol JSX al cambiar
  // de vista. Si esperamos al cleanup de un useEffect en MapaEspana, los
  // <Source>/<Layer> hijos ya se han desmontado y disparan la cascada
  // removeSource → _updateTerrain → terrain.update con style.terrain
  // todavía referenciando el source eliminado (mapbox-gl 3.x bug).
  //
  // Suscribiéndonos al store de Zustand interceptamos el cambio de vista
  // SÍNCRONAMENTE, antes de que React entre al commit phase y desmonte
  // los <Source>. setTerrain(null) limpia la referencia y el siguiente
  // _updateTerrain es no-op.
  useEffect(() => {
    return useWarRoomStore.subscribe((state, prev) => {
      if (prev.vistaActual === "mapa" && state.vistaActual !== "mapa") {
        const map = mapRef.current?.getMap();
        if (map?.isStyleLoaded?.() && map.getTerrain?.() != null) {
          map.setTerrain(null);
        }
      }
    });
  }, []);

  // No-op handler: dejado por compatibilidad con la prop onIdle del Map.
  // Antes refrescaba clusterMarkers; ahora los pies se calculan
  // deterministicamente vía useMemo, sin depender de eventos Mapbox.
  const handleIdle = useCallback(() => {}, []);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Guardar bounds iniciales en el store
    saveBounds();

    const sq = createShapeIcon("square");
    if (sq && !map.hasImage("shape-square"))
      map.addImage("shape-square", sq, { sdf: true });

    const hex = createShapeIcon("hexagon");
    if (hex && !map.hasImage("shape-hexagon"))
      map.addImage("shape-hexagon", hex, { sdf: true });

    setIconsReady(true);

    // BORME pulsing animation
    let frame: number;
    const tick = () => {
      const t = ((Date.now() % 1800) / 1800);
      const radius = 8 + 18 * t;
      const opacity = 0.7 * (1 - t);
      if (map.getLayer("borme-ring")) {
        map.setPaintProperty("borme-ring", "circle-radius", radius);
        map.setPaintProperty("borme-ring", "circle-opacity", opacity);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [saveBounds]);

  // Mouse move — tooltip OR draw preview
  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    if (drawMode) {
      setDrawMouse([e.lngLat.lng, e.lngLat.lat]);
      setTooltip(null);
      return;
    }
    const feature = e.features?.[0];
    if (!feature || feature.properties?.cluster) {
      setTooltip(null);
      return;
    }
    setTooltip({
      x: e.point.x,
      y: e.point.y,
      props: feature.properties as TooltipState["props"],
    });
  }, [drawMode]);

  // Mouse leave — hide tooltip / draw preview
  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setDrawMouse(null);
  }, []);

  // Click sobre un Layer Mapbox interactivo. Si es el layer `cluster-pies`,
  // hacemos zoom al cluster (mismo behaviour que tenía el `<ClusterPie onClick>`
  // antes de migrar a capa nativa). Cualquier otro layer interactivo es un
  // marker individual y selecciona la empresa.
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      if (drawMode) {
        if (closingRef.current) return;
        setDrawPoints((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      const feature = e.features?.[0];
      if (!feature) return;
      if (feature.layer?.id === "cluster-pies") {
        const clusterId = feature.properties?.cluster_id as number | undefined;
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        const expansionZoom = clusterId != null && clusterIndex
          ? clusterIndex.getClusterExpansionZoom(clusterId)
          : null;
        const targetZoom = expansionZoom != null
          ? expansionZoom + 0.5
          : (mapRef.current?.getMap().getZoom() ?? 8) + 2;
        mapRef.current?.getMap().easeTo({
          center: [lng, lat],
          zoom: targetZoom,
          duration: 400,
        });
        return;
      }
      const id = feature.properties?.id as number;
      if (id) seleccionarEmpresa(id);
    },
    [drawMode, seleccionarEmpresa, clusterIndex]
  );

  // Double-click — close polygon and compute results
  const handleDblClick = useCallback(
    (e: MapMouseEvent) => {
      if (!drawMode) return;
      e.preventDefault(); // prevent map zoom
      closingRef.current = true;
      setDrawPoints((prev) => {
        // dblclick fires two clicks first → remove last erroneous point
        const pts = prev.length > 1 ? prev.slice(0, -1) : prev;
        if (pts.length >= 3) {
          setSelectedPolygon(pts);
        }
        return pts;
      });
      setDrawMode(false);
      setDrawMouse(null);
      setTimeout(() => { closingRef.current = false; }, 300);
    },
    [drawMode]
  );

  // Helpers para activar/cancelar el modo dibujo
  const startDraw = useCallback(() => {
    setDrawMode(true);
    setDrawPoints([]);
    setDrawMouse(null);
    setSelectedPolygon(null);
    setTooltip(null);
  }, []);

  const cancelDraw = useCallback(() => {
    setDrawMode(false);
    setDrawPoints([]);
    setDrawMouse(null);
    setSelectedPolygon(null);
  }, []);

  const sizeExpr = useMemo(() => makeSizeExpr(sizeMetric), [sizeMetric]);
  const iconSizeExpr = useMemo(() => makeIconSizeExpr(sizeMetric), [sizeMetric]);

  // ── Draw GeoJSON data ──────────────────────────────────────────────────
  const drawLineData = useMemo<GeoJSON.Feature>(() => {
    const coords: [number, number][] =
      drawMouse && drawPoints.length > 0
        ? [...drawPoints, drawMouse]
        : drawPoints;
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    };
  }, [drawPoints, drawMouse]);

  const drawFillData = useMemo<GeoJSON.Feature | null>(() => {
    if (drawPoints.length < 3) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[...drawPoints, drawPoints[0]]],
      },
    };
  }, [drawPoints]);

  if (!mounted) return null;

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        initialViewState={mapViewState}
        onMoveEnd={(e) => {
          // Actualizar viewState dispara automáticamente el useMemo de
          // clusterMarkers (depende de mapBounds + zoom). No hace falta
          // llamar a una función imperativa.
          setMapViewState({
            longitude: e.viewState.longitude,
            latitude: e.viewState.latitude,
            zoom: e.viewState.zoom,
          });
          saveBounds();
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        interactiveLayerIds={drawMode ? [] : INTERACTIVE}
        onLoad={handleMapLoad}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDblClick={handleDblClick}
        cursor={drawMode ? "crosshair" : tooltip ? "pointer" : "default"}
        onIdle={handleIdle}
        reuseMaps
      >
        {/* ── Empresas fuera del filtro (fondo, sin cluster, opacidad baja) ── */}
        {/* Declarado ANTES del source principal para que quede por debajo en z-order ── */}
        <Source
          id="empresas-bg"
          type="geojson"
          data={(geojsonBg ?? { type: "FeatureCollection", features: [] }) as unknown as GeoJSON.FeatureCollection}
        >
          <Layer
            id="markers-bg"
            type="circle"
            paint={{
              "circle-color": "#2d2d2d",
              "circle-radius": sizeExpr as unknown as number,
              "circle-opacity": 0.7,
              "circle-stroke-width": 0,
              "circle-stroke-opacity": 0,
            }}
          />
        </Source>

        <Source
            id="empresas"
            type="geojson"
            data={{
              type: "FeatureCollection",
              features: individualFeatures,
            } as unknown as GeoJSON.FeatureCollection}
          >
            {/* Mapbox YA NO clusteriza este source. Las features que aquí
                llegan son SOLO las que Supercluster JS considera individuales
                (cluster=false). Los Layers `markers-*` ya no necesitan filtro
                ["!", ["has", "point_count"]] — ninguna feature tendrá esa
                propiedad. Los clusters se renderizan en el layer `cluster-pies`
                de más abajo. Una sola fuente de verdad: clusterIndex (Supercluster). */}

            {/* ── BORME pulsing ring (amber) ── */}
            <Layer
              id="borme-ring"
              type="circle"
              filter={["boolean", ["get", "hasBormeReciente"], false]}
              paint={{
                "circle-radius": 8,
                "circle-color": "rgba(0,0,0,0)",
                "circle-stroke-color": "#f59e0b",
                "circle-stroke-width": 2,
                "circle-opacity": 0.6,
              }}
            />

            {/* ── PCI — círculo ── */}
            <Layer
              id="markers-pci"
              type="circle"
              filter={["==", ["get", "sector"], "PCI"]}
              layout={{
                "circle-sort-key": ["case", ["boolean", ["get", "enPerimetro"], false], 1, 0] as unknown as number,
              }}
            paint={{
                "circle-color": CRM_COLOR as unknown as string,
                "circle-radius": sizeExpr as unknown as number,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#1e293b",
                "circle-opacity": 1,
                "circle-stroke-opacity": 1,
              }}
            />

            {/* ── Seguridad electrónica — cuadrado redondeado ── */}
            {iconsReady && (
              <Layer
                id="markers-segelec"
                type="symbol"
                filter={["==", ["get", "sector"], "seguridad_electronica"]}
                layout={{
                  "icon-image": "shape-square",
                  "icon-size": iconSizeExpr as unknown as number,
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                  "symbol-sort-key": ["case", ["boolean", ["get", "enPerimetro"], false], 1, 0],
                }}
                paint={{
                  "icon-color": CRM_COLOR as unknown as string,
                  "icon-opacity": 1,
                }}
              />
            )}

            {/* ── Mixto — hexágono ── */}
            {iconsReady && (
              <Layer
                id="markers-mixto"
                type="symbol"
                filter={["==", ["get", "sector"], "mixto"]}
                layout={{
                  "icon-image": "shape-hexagon",
                  "icon-size": iconSizeExpr as unknown as number,
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                  "symbol-sort-key": ["case", ["boolean", ["get", "enPerimetro"], false], 1, 0],
                }}
                paint={{
                  "icon-color": CRM_COLOR as unknown as string,
                  "icon-opacity": 1,
                }}
              />
            )}
          </Source>

        {/* ── Cluster pie chart markers (capa Mapbox nativa) ──
            Antes usábamos <Marker><ClusterPie> (SVG en HTML). Migrado a
            symbol layer + iconos generados por canvas (ver
            `useClusterPieImages` y `clusterPieIcon.ts`): Mapbox renderiza
            N clusters al mismo coste constante en lugar de N nodos React.
            El click es manejado por `handleClick` general del Map (layer
            ID dado de alta en `INTERACTIVE`). */}
        <Source
          id="cluster-pies-src"
          type="geojson"
          data={clusterPiesGeoJSON as unknown as GeoJSON.FeatureCollection}
        >
          <Layer
            id="cluster-pies"
            type="symbol"
            layout={{
              "icon-image": ["get", "iconImageId"] as unknown as string,
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-anchor": "center",
            }}
          />
        </Source>

        {/* ── Draw polygon layers ── */}
        {drawFillData && (
          <Source
            id="draw-fill"
            type="geojson"
            data={drawFillData as unknown as GeoJSON.Feature}
          >
            <Layer
              id="draw-fill-layer"
              type="fill"
              paint={{ "fill-color": "#3b82f6", "fill-opacity": 0.12 }}
            />
          </Source>
        )}
        <Source
          id="draw-line"
          type="geojson"
          data={drawLineData as unknown as GeoJSON.Feature}
        >
          <Layer
            id="draw-line-layer"
            type="line"
            paint={{
              "line-color": "#3b82f6",
              "line-width": 2,
              "line-dasharray": [4, 3],
            }}
          />
        </Source>
        {/* Vértices */}
        <Source
          id="draw-vertices"
          type="geojson"
          data={{
            type: "FeatureCollection",
            features: drawPoints.map((p) => ({
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: p },
            })),
          } as unknown as GeoJSON.FeatureCollection}
        >
          <Layer
            id="draw-vertices-layer"
            type="circle"
            paint={{
              "circle-radius": 4,
              "circle-color": "#3b82f6",
              "circle-stroke-width": 2,
              "circle-stroke-color": "#0f1117",
            }}
          />
        </Source>
      </Map>

      {/* ── Tooltip flotante custom ── */}
      {tooltip && !drawMode && <MapTooltip x={tooltip.x} y={tooltip.y} props={tooltip.props} />}

      {/* ── Botón seleccionar área ── */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        {!drawMode && !seleccionArea && (
          <button
            onClick={startDraw}
            title="Seleccionar área (dibujar polígono)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-wr-surface/90 border border-wr-border text-wr-muted hover:text-wr-text hover:border-wr-muted backdrop-blur-sm transition-colors shadow-lg"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l7 2 4-2 7 3v10l-7-3-4 2-7-2V3z" />
            </svg>
            Seleccionar área
          </button>
        )}
        {drawMode && (
          <div className="flex flex-col gap-1">
            <div className="px-3 py-2 text-xs font-medium rounded-lg bg-wr-blue/20 border border-wr-blue/40 text-wr-blue backdrop-blur-sm shadow-lg">
              <p className="font-semibold">Dibujando polígono</p>
              <p className="text-wr-blue/70 mt-0.5">
                {drawPoints.length === 0
                  ? "Haz clic para empezar"
                  : drawPoints.length < 3
                  ? `${drawPoints.length} punto${drawPoints.length > 1 ? "s" : ""} — sigue haciendo clic`
                  : "Doble clic para cerrar"}
              </p>
            </div>
            <button
              onClick={cancelDraw}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-wr-surface/90 border border-wr-border text-wr-muted hover:text-wr-red hover:border-wr-red backdrop-blur-sm transition-colors shadow-lg"
            >
              Cancelar
            </button>
          </div>
        )}
        {seleccionArea && !drawMode && (
          <button
            onClick={cancelDraw}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-wr-surface/90 border border-wr-border text-wr-muted hover:text-wr-red hover:border-wr-red backdrop-blur-sm transition-colors shadow-lg"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Limpiar selección
          </button>
        )}
      </div>

      {/* ── Panel resultados selección área ── */}
      {seleccionArea && !drawMode && (
        <SeleccionAreaPanel
          empresas={seleccionArea}
          onClose={cancelDraw}
          height={panelHeight}
          onResizeStart={(e) => {
            e.preventDefault();
            resizingRef.current = true;
            const startY = e.clientY;
            const startH = panelHeight;
            const onMove = (ev: PointerEvent) => {
              if (!resizingRef.current) return;
              const delta = startY - ev.clientY;
              const next = Math.max(120, Math.min(window.innerHeight - 80, startH + delta));
              setPanelHeight(next);
            };
            const onUp = () => {
              resizingRef.current = false;
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        />
      )}

      {/* ── Leyenda de formas — colapsable en <lg, abierta por defecto en lg+ ── */}
      <Leyenda />
    </div>
  );
}
