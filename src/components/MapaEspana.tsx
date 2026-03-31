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
import type mapboxgl from "mapbox-gl";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { isInFilter } from "@/lib/filtros";
import MapTooltip from "@/components/MapTooltip";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

// ─── Expresiones Mapbox ──────────────────────────────────────────────────

const CRM_COLOR = [
  "case",
  ["==", ["get", "dealStage"], "contactado"],      "#38bdf8",  // sky
  ["==", ["get", "dealStage"], "primera_reunion"], "#3b82f6",  // blue
  ["==", ["get", "dealStage"], "analisis"],        "#8b5cf6",  // violet
  ["==", ["get", "dealStage"], "LOI enviada"],     "#f59e0b",  // amber
  ["==", ["get", "dealStage"], "execution"],       "#f97316",  // orange
  ["==", ["get", "dealStage"], "portfolio"],       "#22c55e",  // green
  ["==", ["get", "dealStage"], "muerto"],          "#ef4444",  // red
  "#94a3b8",  // slate — sin CRM / identificado
] as const;

// Cluster color based on aggregated maxPriority (1=identificado … 7=portfolio)
const CLUSTER_COLOR = [
  "case",
  [">=", ["get", "maxPriority"], 7], "#22c55e",
  [">=", ["get", "maxPriority"], 6], "#f97316",
  [">=", ["get", "maxPriority"], 5], "#f59e0b",
  [">=", ["get", "maxPriority"], 4], "#8b5cf6",
  [">=", ["get", "maxPriority"], 3], "#3b82f6",
  [">=", ["get", "maxPriority"], 2], "#38bdf8",
  "#94a3b8",
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _OPACITY_EXPR = [
  "case", ["boolean", ["get", "enFiltro"], true], 1, 0.15,
] as const;

function makeSizeExpr(metric: "ingresos" | "ebitda") {
  // Mínimo 10px para que cualquier empresa sea visible en el mapa
  const breaks =
    metric === "ingresos"
      ? [0, 10, 5_000_000, 13, 20_000_000, 18, 60_000_000, 26] as const
      : [0, 10, 800_000, 13, 3_500_000, 18, 10_000_000, 26] as const;
  return [
    "interpolate", ["linear"],
    ["coalesce", ["get", metric], 0],
    breaks[0], breaks[1],
    breaks[2], breaks[3],
    breaks[4], breaks[5],
    breaks[6], breaks[7],
  ] as const;
}

// icon-size (símbolo 64px) equivalente a circle-radius en px
function makeIconSizeExpr(metric: "ingresos" | "ebitda") {
  // icon-size = radius / 32 (el icono tiene 64px, su "radio" visual es 32px)
  return ["interpolate", ["linear"],
    ["coalesce", ["get", metric], 0],
    metric === "ingresos" ? 0 : 0,               0.3125,  // 10px
    metric === "ingresos" ? 5_000_000 : 800_000,   0.40,   // 13px
    metric === "ingresos" ? 20_000_000 : 3_500_000, 0.5625, // 18px
    metric === "ingresos" ? 60_000_000 : 10_000_000, 0.8125, // 26px
  ] as const;
}

// ─── Generador de iconos SDF ─────────────────────────────────────────────

function createShapeIcon(shape: "square" | "hexagon", size = 64): ImageData | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";

  const m = size * 0.12; // margin
  const s = size - 2 * m; // inner size

  if (shape === "square") {
    // Rounded square (rx ≈ 22% del lado)
    const r = s * 0.22;
    ctx.beginPath();
    ctx.moveTo(m + r, m);
    ctx.lineTo(m + s - r, m);
    ctx.quadraticCurveTo(m + s, m, m + s, m + r);
    ctx.lineTo(m + s, m + s - r);
    ctx.quadraticCurveTo(m + s, m + s, m + s - r, m + s);
    ctx.lineTo(m + r, m + s);
    ctx.quadraticCurveTo(m, m + s, m, m + s - r);
    ctx.lineTo(m, m + r);
    ctx.quadraticCurveTo(m, m, m + r, m);
    ctx.closePath();
    ctx.fill();
  } else {
    // Hexágono plano
    const cx = size / 2;
    const cy = size / 2;
    const r = s / 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    }
    ctx.closePath();
    ctx.fill();
  }

  return ctx.getImageData(0, 0, size, size);
}

// ─── Tipos locales ────────────────────────────────────────────────────────

type Props = Record<string, unknown>;

// ─── Point-in-polygon (ray casting) ─────────────────────────────────────

function pointInPolygon(
  point: [number, number],
  ring: [number, number][]
): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Panel resultados selección área ─────────────────────────────────────

const SECTOR_LBL: Record<string, string> = {
  PCI: "PCI",
  seguridad_electronica: "Seg. Electrónica",
  mixto: "Mixto",
};
const STAGE_LBL: Record<string, string> = {
  identificado:    "Identificado",
  contactado:      "Contactado",
  primera_reunion: "1ª reunión",
  analisis:        "Análisis",
  "LOI enviada":   "LOI enviada",
  execution:       "Ejecución",
  portfolio:       "Portfolio",
  muerto:          "Muerto",
};
const STAGE_CLR: Record<string, string> = {
  contactado:      "#38bdf8",
  primera_reunion: "#3b82f6",
  analisis:        "#8b5cf6",
  "LOI enviada":   "#f59e0b",
  execution:       "#f97316",
  portfolio:       "#22c55e",
  muerto:          "#ef4444",
};

function fmtMLocal(n: unknown): string {
  if (n === null || n === undefined) return "n.a.";
  const v = n as number;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K€`;
  return `${v.toLocaleString("es-ES")}€`;
}

function fmtPctLocal(n: unknown): string {
  if (n === null || n === undefined) return "—";
  return `${(n as number).toFixed(1)}%`;
}

function SeleccionAreaPanel({
  empresas,
  onClose,
}: {
  empresas: Props[];
  onClose: () => void;
}) {
  const { seleccionarEmpresa, modoPresentacion } = useWarRoomStore();
  const [sortKey, setSortKey] = useState<string>("ingresos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const sorted = useMemo(
    () =>
      [...empresas].sort((a, b) => {
        const av = (a[sortKey] as number | null) ?? -Infinity;
        const bv = (b[sortKey] as number | null) ?? -Infinity;
        return sortDir === "asc" ? av - bv : bv - av;
      }),
    [empresas, sortKey, sortDir]
  );

  const SortTh = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <th
      className="text-right px-3 py-2 cursor-pointer hover:text-wr-text select-none whitespace-nowrap"
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center justify-end gap-0.5">
        {children}
        <span className={sortKey === col ? "text-wr-blue ml-0.5" : "opacity-30 ml-0.5"}>
          {sortKey === col ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
        </span>
      </span>
    </th>
  );

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 animate-slide-up">
      <div className="bg-wr-surface/95 backdrop-blur-md border-t border-wr-border shadow-2xl"
        style={{ maxHeight: "38vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-wr-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
              <path d="M3 3l7 2 4-2 7 3v10l-7-3-4 2-7-2V3z" />
            </svg>
            <span className="text-xs font-semibold text-wr-text">
              Selección de área —{" "}
              <span className="text-wr-blue">{empresas.length}</span>{" "}
              empresa{empresas.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-wr-hint hover:text-wr-text transition-colors p-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabla */}
        <div className="overflow-auto" style={{ maxHeight: "calc(38vh - 44px)" }}>
          {empresas.length === 0 ? (
            <p className="text-center py-8 text-wr-hint text-xs">
              Ninguna empresa en el área seleccionada
            </p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-wr-surface">
                <tr className="text-[10px] font-semibold text-wr-hint uppercase tracking-widest border-b border-wr-border">
                  <th className="text-left px-4 py-2">Empresa</th>
                  <th className="text-left px-3 py-2">Provincia</th>
                  <th className="text-left px-3 py-2">Sector</th>
                  <th className="text-left px-3 py-2">CRM</th>
                  {!modoPresentacion && (
                    <>
                      <SortTh col="ingresos">Ingresos</SortTh>
                      <SortTh col="margenBrutoPct">MB%</SortTh>
                      <SortTh col="ebitdaPct">EBITDA%</SortTh>
                      <SortTh col="ebitda">EBITDA</SortTh>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.id as number}
                    onClick={() => seleccionarEmpresa(r.id as number)}
                    className="border-b border-wr-border/40 hover:bg-wr-surface2 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2 font-medium text-wr-text max-w-[180px]">
                      <span className="truncate block">
                        {r.nombre as string}
                        {r.web ? (
                          <span className="text-wr-blue ml-1 text-[10px]">↗</span>
                        ) : null}
                      </span>
                      {r.grupoNombre ? (
                        <span className="text-wr-hint text-[10px]">
                          {r.grupoNombre as string}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-wr-muted whitespace-nowrap">
                      {r.provincia as string}
                    </td>
                    <td className="px-3 py-2 text-wr-muted whitespace-nowrap">
                      {SECTOR_LBL[r.sector as string] ?? (r.sector as string)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.dealStage ? (
                        <span
                          style={{ color: STAGE_CLR[r.dealStage as string] ?? "#94a3b8" }}
                          className="font-medium"
                        >
                          {STAGE_LBL[r.dealStage as string] ?? (r.dealStage as string)}
                        </span>
                      ) : (
                        <span className="text-wr-hint">—</span>
                      )}
                    </td>
                    {!modoPresentacion && (
                      <>
                        <td className="px-3 py-2 text-right text-wr-text whitespace-nowrap">
                          {fmtMLocal(r.ingresos)}
                        </td>
                        <td className="px-3 py-2 text-right text-wr-muted whitespace-nowrap">
                          {fmtPctLocal(r.margenBrutoPct)}
                        </td>
                        <td className="px-3 py-2 text-right text-wr-muted whitespace-nowrap">
                          {fmtPctLocal(r.ebitdaPct)}
                        </td>
                        <td className="px-3 py-2 text-right text-wr-muted whitespace-nowrap">
                          {fmtMLocal(r.ebitda)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

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

const INTERACTIVE = ["clusters", "markers-pci", "markers-segelec", "markers-mixto", "markers-bg"];

export default function MapaEspana() {
  const mapRef = useRef<MapRef>(null);
  const {
    filtros,
    sizeMetric,
    seleccionarEmpresa,
    searchQuery,
    setEmpresasGeoJSON,
    flyToEmpresaId,
    setFlyToEmpresaId,
    mapViewState,
    setMapViewState,
    setMapBounds,
    panelAbierto,
  } = useWarRoomStore();

  const [rawGeoJSON, setRawGeoJSON] = useState<GeoJSONFC | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [iconsReady, setIconsReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ── Draw-polygon state ─────────────────────────────────────────────────
  const closingRef = useRef(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [drawMouse, setDrawMouse] = useState<[number, number] | null>(null);
  const [seleccionArea, setSeleccionArea] = useState<Props[] | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Resize map when panel opens/closes so it fills the available width
  useEffect(() => {
    const t = setTimeout(() => { mapRef.current?.getMap().resize(); }, 50);
    return () => clearTimeout(t);
  }, [panelAbierto]);

  // Fetch GeoJSON once on mount — share raw features with the store for Sidebar
  useEffect(() => {
    fetch("/api/empresas")
      .then((r) => r.json())
      .then((data: GeoJSONFC) => {
        setRawGeoJSON(data);
        setEmpresasGeoJSON(data.features ?? []);
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Helper: extrae y persiste los bounds actuales del mapa
  const saveBounds = useCallback(() => {
    const b = mapRef.current?.getMap().getBounds();
    if (b) setMapBounds({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
  }, [setMapBounds]);

  // Load custom shape icons when map loads
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, []);

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

  // Click — add draw point OR select empresa / zoom cluster
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      if (drawMode) {
        if (closingRef.current) return;
        setDrawPoints((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      const feature = e.features?.[0];
      if (!feature) return;

      if (feature.properties?.cluster) {
        const clusterId = feature.properties.cluster_id as number;
        const source = mapRef.current
          ?.getMap()
          .getSource("empresas") as mapboxgl.GeoJSONSource;
        source?.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return;
          const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
          mapRef.current?.getMap().easeTo({ center: coords, zoom: zoom + 0.5 });
        });
      } else {
        const id = feature.properties?.id as number;
        if (id) seleccionarEmpresa(id);
      }
    },
    [drawMode, seleccionarEmpresa]
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
        if (pts.length >= 3 && geojson) {
          const inside = geojson.features
            .filter((f) =>
              pointInPolygon(
                [f.geometry.coordinates[0], f.geometry.coordinates[1]],
                pts
              )
            )
            .map((f) => f.properties);
          setSeleccionArea(inside);
        }
        return pts;
      });
      setDrawMode(false);
      setDrawMouse(null);
      setTimeout(() => { closingRef.current = false; }, 300);
    },
    [drawMode, geojson]
  );

  // Helpers para activar/cancelar el modo dibujo
  const startDraw = useCallback(() => {
    setDrawMode(true);
    setDrawPoints([]);
    setDrawMouse(null);
    setSeleccionArea(null);
    setTooltip(null);
  }, []);

  const cancelDraw = useCallback(() => {
    setDrawMode(false);
    setDrawPoints([]);
    setDrawMouse(null);
    setSeleccionArea(null);
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
        reuseMaps
      >
        <Source
            id="empresas"
            type="geojson"
            data={(geojson ?? { type: "FeatureCollection", features: [] }) as unknown as GeoJSON.FeatureCollection}
            cluster
            clusterMaxZoom={10}
            clusterRadius={50}
            clusterProperties={{
              maxPriority: [
                "max",
                [
                  "case",
                  ["==", ["get", "dealStage"], "portfolio"],       7,
                  ["==", ["get", "dealStage"], "execution"],       6,
                  ["==", ["get", "dealStage"], "LOI enviada"],     5,
                  ["==", ["get", "dealStage"], "analisis"],        4,
                  ["==", ["get", "dealStage"], "primera_reunion"], 3,
                  ["==", ["get", "dealStage"], "contactado"],      2,
                  ["==", ["get", "dealStage"], "identificado"],    1,
                  0,
                ],
              ],
            }}
          >
            {/* ── Cluster circles ── */}
            <Layer
              id="clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": CLUSTER_COLOR as unknown as string,
                "circle-radius": [
                  "step", ["get", "point_count"],
                  16, 5, 22, 20, 28,
                ],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#0f1117",
                "circle-opacity": 0.9,
              }}
            />

            {/* ── Cluster count labels ── */}
            <Layer
              id="cluster-count"
              type="symbol"
              filter={["has", "point_count"]}
              layout={{
                "text-field": "{point_count_abbreviated}",
                "text-size": 11,
                "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
              }}
              paint={{ "text-color": "#ffffff" }}
            />

            {/* ── BORME pulsing ring (amber) ── */}
            <Layer
              id="borme-ring"
              type="circle"
              filter={[
                "all",
                ["!", ["has", "point_count"]],
                ["boolean", ["get", "hasBormeReciente"], false],
              ]}
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
              filter={[
                "all",
                ["!", ["has", "point_count"]],
                ["==", ["get", "sector"], "PCI"],
              ]}
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
                filter={[
                  "all",
                  ["!", ["has", "point_count"]],
                  ["==", ["get", "sector"], "seguridad_electronica"],
                ]}
                layout={{
                  "icon-image": "shape-square",
                  "icon-size": iconSizeExpr as unknown as number,
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
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
                filter={[
                  "all",
                  ["!", ["has", "point_count"]],
                  ["==", ["get", "sector"], "mixto"],
                ]}
                layout={{
                  "icon-image": "shape-hexagon",
                  "icon-size": iconSizeExpr as unknown as number,
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                }}
                paint={{
                  "icon-color": CRM_COLOR as unknown as string,
                  "icon-opacity": 1,
                }}
              />
            )}
          </Source>

        {/* ── Empresas fuera del filtro (fondo, sin cluster, opacidad baja) ── */}
        {/* Siempre montado para evitar errores de removeSource en Mapbox GL */}
        <Source
          id="empresas-bg"
          type="geojson"
          data={(geojsonBg ?? { type: "FeatureCollection", features: [] }) as unknown as GeoJSON.FeatureCollection}
        >
          <Layer
            id="markers-bg"
            type="circle"
            paint={{
              "circle-color": "#64748b",
              "circle-radius": 6,
              "circle-opacity": 0.4,
              "circle-stroke-width": 1,
              "circle-stroke-color": "#1e293b",
              "circle-stroke-opacity": 0.5,
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
        <SeleccionAreaPanel empresas={seleccionArea} onClose={cancelDraw} />
      )}

      {/* ── Leyenda de formas ── */}
      <div className="absolute bottom-6 right-4 bg-wr-surface/90 border border-wr-border rounded-lg px-3 py-2.5 text-[11px] space-y-1.5 backdrop-blur-sm">
        <p className="text-wr-hint uppercase tracking-wider mb-1">Sector</p>
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
            ["#94a3b8", "Sin CRM / Identificado"],
            ["#38bdf8", "Contactado"],
            ["#3b82f6", "1ª reunión realizada"],
            ["#8b5cf6", "Análisis"],
            ["#f59e0b", "LOI enviada"],
            ["#f97316", "Ejecución"],
            ["#22c55e", "Portfolio"],
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
