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
  Marker,
  type MapRef,
  type MapMouseEvent,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import Supercluster from "supercluster";
import { useWarRoomStore, type EmpresaFeatureProperties } from "@/store/useWarRoomStore";
import { isInFilter } from "@/lib/filtros";
import { fmtM, fmtPct } from "@/lib/format";
import MapTooltip from "@/components/MapTooltip";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

// ─── Expresiones Mapbox ──────────────────────────────────────────────────

const CRM_COLOR = [
  "case",
  ["==", ["get", "dealStage"], "identificado"],    "#94a3b8",  // slate — primer stage del funnel
  ["==", ["get", "dealStage"], "contactado"],      "#38bdf8",  // sky
  ["==", ["get", "dealStage"], "primera_reunion"], "#3b82f6",  // blue
  ["==", ["get", "dealStage"], "analisis"],        "#8b5cf6",  // violet
  ["==", ["get", "dealStage"], "LOI enviada"],     "#f59e0b",  // amber
  ["==", ["get", "dealStage"], "execution"],       "#f97316",  // orange
  ["==", ["get", "dealStage"], "portfolio"],       "#22c55e",  // green
  ["==", ["get", "dealStage"], "on_hold"],         "#a8a29e",  // stone — en pausa
  ["==", ["get", "dealStage"], "muerto"],          "#ef4444",  // red
  "#6b7280",  // gris-500 — Sin CRM (dealStage null o sin CrmEstado)
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

type Props = EmpresaFeatureProperties;

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
  on_hold:         "On hold",
  muerto:          "Muerto",
};
const STAGE_CLR: Record<string, string> = {
  contactado:      "#38bdf8",
  primera_reunion: "#3b82f6",
  analisis:        "#8b5cf6",
  "LOI enviada":   "#f59e0b",
  execution:       "#f97316",
  portfolio:       "#22c55e",
  on_hold:         "#a8a29e",
  muerto:          "#ef4444",
};

// ─── Cluster pie chart ────────────────────────────────────────────────────────

// Stage order and colors for the pie chart (gray = sin CRM / identificado)
const PIE_STAGES: { key: string; color: string }[] = [
  { key: "identificado",    color: "#64748b" },
  { key: "contactado",      color: "#38bdf8" },
  { key: "primera_reunion", color: "#3b82f6" },
  { key: "analisis",        color: "#8b5cf6" },
  { key: "LOI enviada",     color: "#f59e0b" },
  { key: "execution",       color: "#f97316" },
  { key: "portfolio",       color: "#22c55e" },
  { key: "muerto",          color: "#ef4444" },
];

interface ClusterMarker {
  id: number;
  lng: number;
  lat: number;
  count: number;
  stageCounts: Record<string, number>;
}

function donutPath(cx: number, cy: number, R: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
  const x2 = cx + R * Math.cos(endAngle),   y2 = cy + R * Math.sin(endAngle);
  const ix1 = cx + r * Math.cos(endAngle),  iy1 = cy + r * Math.sin(endAngle);
  const ix2 = cx + r * Math.cos(startAngle), iy2 = cy + r * Math.sin(startAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r} ${r} 0 ${large} 0 ${ix2} ${iy2} Z`;
}

function ClusterPie({ marker, onClick }: { marker: ClusterMarker; onClick: () => void }) {
  const R = marker.count > 100 ? 24 : marker.count > 20 ? 20 : 16;
  const r = R * 0.55;
  const cx = R + 2, cy = R + 2;
  const size = (R + 2) * 2;

  const segments = PIE_STAGES.map((s) => ({ color: s.color, n: marker.stageCounts[s.key] ?? 0 }))
    .filter((s) => s.n > 0);
  const total = segments.reduce((a, s) => a + s.n, 0) || 1;

  // If all are "sin CRM" (gray), just draw a full circle
  const paths: React.ReactElement[] = [];
  if (segments.length === 1) {
    paths.push(
      <circle key="full" cx={cx} cy={cy} r={R} fill={segments[0].color} />,
      <circle key="hole" cx={cx} cy={cy} r={r} fill="#0f1117" />
    );
  } else {
    let angle = -Math.PI / 2;
    for (const seg of segments) {
      const sweep = (seg.n / total) * 2 * Math.PI;
      paths.push(
        <path key={seg.color} d={donutPath(cx, cy, R, r, angle, angle + sweep)} fill={seg.color} />
      );
      angle += sweep;
    }
  }

  const fontSize = R < 18 ? 8 : R < 22 ? 9 : 10;

  return (
    <div onClick={onClick} style={{ cursor: "pointer", transform: "translate(-50%, -50%)" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} overflow="visible">
        {/* Shadow ring */}
        <circle cx={cx} cy={cy} r={R + 1.5} fill="rgba(0,0,0,0.4)" />
        {paths}
        <text
          x={cx} y={cy}
          textAnchor="middle" dominantBaseline="central"
          fontSize={fontSize} fontWeight="bold" fill="#ffffff"
          style={{ pointerEvents: "none", fontFamily: "system-ui" }}
        >
          {marker.count > 999 ? `${(marker.count / 1000).toFixed(1)}k` : marker.count}
        </text>
      </svg>
    </div>
  );
}

const fmtMLocal = (n: unknown) => fmtM(n as number | null);
const fmtPctLocal = (n: unknown) => fmtPct(n as number | null, "—");

function SeleccionAreaPanel({
  empresas,
  onClose,
  height,
  onResizeStart,
}: {
  empresas: Props[];
  onClose: () => void;
  height: number;
  onResizeStart: (e: React.PointerEvent) => void;
}) {
  const { seleccionarEmpresa, modoPresentacion } = useWarRoomStore();
  type NumericSortKey = "ingresos" | "margenBrutoPct" | "ebitdaPct" | "ebitda";
  const [sortKey, setSortKey] = useState<NumericSortKey>("ingresos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = useCallback(
    (key: NumericSortKey) => {
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
        const av = a[sortKey] ?? -Infinity;
        const bv = b[sortKey] ?? -Infinity;
        return sortDir === "asc" ? av - bv : bv - av;
      }),
    [empresas, sortKey, sortDir]
  );

  const SortTh = ({ col, children }: { col: NumericSortKey; children: React.ReactNode }) => (
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
      <div className="bg-wr-surface/95 backdrop-blur-md border-t border-wr-border shadow-2xl relative"
        style={{ height }}
      >
        {/* Resize handle */}
        <div
          onPointerDown={onResizeStart}
          title="Arrastra para redimensionar"
          className="absolute top-0 left-0 right-0 h-2 -translate-y-1/2 cursor-ns-resize z-30 group flex items-center justify-center"
        >
          <div className="w-12 h-1 rounded-full bg-wr-border group-hover:bg-wr-blue transition-colors" />
        </div>
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
        <div className="overflow-auto" style={{ height: `calc(100% - 44px)` }}>
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
                      <SortTh col="margenBrutoPct">GM%</SortTh>
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

const INTERACTIVE = ["markers-pci", "markers-segelec", "markers-mixto", "markers-bg"];

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
  //   - clusters (>=2) → renderizamos como <Marker> React (pies)
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

  // Click sobre un Layer Mapbox individual = seleccionar empresa.
  // Los clicks sobre pies de cluster los maneja el <ClusterPie onClick> abajo
  // (los pies son <Marker> React, no Layers Mapbox).
  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      if (drawMode) {
        if (closingRef.current) return;
        setDrawPoints((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }
      const feature = e.features?.[0];
      if (!feature) return;
      const id = feature.properties?.id as number;
      if (id) seleccionarEmpresa(id);
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
                propiedad. Los clusters se renderizan como <Marker> arriba en
                el JSX. Una sola fuente de verdad: clusterIndex (Supercluster). */}

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

        {/* ── Cluster pie chart markers ── */}
        {clusterMarkers.map((marker) => (
          <Marker
            key={marker.id}
            longitude={marker.lng}
            latitude={marker.lat}
            anchor="center"
          >
            <ClusterPie
              marker={marker}
              onClick={() => {
                // Zoom exacto necesario para expandir este cluster, calculado
                // por Supercluster JS. Mejor UX que un zoom genérico +2.
                const expansionZoom = clusterIndex
                  ? clusterIndex.getClusterExpansionZoom(marker.id)
                  : null;
                const targetZoom = expansionZoom != null
                  ? expansionZoom + 0.5
                  : (mapRef.current?.getMap().getZoom() ?? 8) + 2;
                mapRef.current?.getMap().easeTo({
                  center: [marker.lng, marker.lat],
                  zoom: targetZoom,
                  duration: 400,
                });
              }}
            />
          </Marker>
        ))}

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
