import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  type FiltrosActivos,
  type Vista,
  type SizeMetric,
  FILTROS_DEFAULT,
} from "@/types";
import { isInFilter } from "@/lib/filtros";

export interface RawFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

interface WarRoomState {
  // ── Navegación ──────────────────────────────────────────────────────────
  vistaActual: Vista;
  modoPresentacion: boolean;

  // ── Empresa seleccionada / panel ─────────────────────────────────────────
  empresaSeleccionadaId: number | null;
  panelAbierto: boolean;

  // ── Mapa ─────────────────────────────────────────────────────────────────
  sizeMetric: SizeMetric;
  flyToEmpresaId: number | null;
  mapViewState: { longitude: number; latitude: number; zoom: number };
  mapBounds: { west: number; south: number; east: number; north: number } | null;

  // ── GeoJSON compartido (cargado por MapaEspana, consumido por Sidebar) ────
  empresasGeoJSON: RawFeature[] | null;

  // ── Búsqueda ─────────────────────────────────────────────────────────────
  searchQuery: string;

  // ── Filtros ──────────────────────────────────────────────────────────────
  filtros: FiltrosActivos;

  // ── Actions ──────────────────────────────────────────────────────────────
  setVista: (vista: Vista) => void;
  toggleModoPresentacion: () => void;

  seleccionarEmpresa: (id: number) => void;
  cerrarPanel: () => void;

  setSizeMetric: (metric: SizeMetric) => void;
  setFlyToEmpresaId: (id: number | null) => void;
  setMapViewState: (vs: { longitude: number; latitude: number; zoom: number }) => void;
  setMapBounds: (bounds: { west: number; south: number; east: number; north: number } | null) => void;

  setEmpresasGeoJSON: (features: RawFeature[]) => void;

  setSearchQuery: (query: string) => void;

  setFiltro: <K extends keyof FiltrosActivos>(key: K, value: FiltrosActivos[K]) => void;
  toggleFiltroArray: <T extends string | number>(
    key: keyof Pick<FiltrosActivos, "ccaa" | "provincia" | "sector" | "grupoId" | "crmStage" | "servicios">,
    value: T
  ) => void;
  resetFiltros: () => void;
  removeFiltro: (key: keyof FiltrosActivos) => void;

  // ── Derivados ─────────────────────────────────────────────────────────────
  getFiltrosActivos: () => { key: keyof FiltrosActivos; label: string }[];
  getVisiblesCount: () => number;
  getAvailableCCAA: () => string[];
  getAvailableProvincias: () => string[];
  getAvailableGrupos: () => { id: number; nombre: string }[];
}

export const useWarRoomStore = create<WarRoomState>()(
  devtools(
    (set, get) => ({
      vistaActual: "mapa",
      modoPresentacion: false,
      empresaSeleccionadaId: null,
      panelAbierto: false,
      sizeMetric: "ingresos",
      flyToEmpresaId: null,
      mapViewState: { longitude: -3.7, latitude: 40.4, zoom: 5.5 },
      mapBounds: null,
      empresasGeoJSON: null,
      searchQuery: "",
      filtros: { ...FILTROS_DEFAULT },

      // ── Navegación ──────────────────────────────────────────────────────
      setVista: (vista) => set({ vistaActual: vista }),

      toggleModoPresentacion: () =>
        set((s) => ({ modoPresentacion: !s.modoPresentacion })),

      // ── Panel empresa ────────────────────────────────────────────────────
      seleccionarEmpresa: (id) =>
        set({ empresaSeleccionadaId: id, panelAbierto: true }),

      cerrarPanel: () =>
        set({ panelAbierto: false, empresaSeleccionadaId: null }),

      // ── Mapa / métrica ───────────────────────────────────────────────────
      setSizeMetric: (metric) => set({ sizeMetric: metric }),
      setFlyToEmpresaId: (id) => set({ flyToEmpresaId: id }),
      setMapViewState: (vs) => set({ mapViewState: vs }),
      setMapBounds: (bounds) => set({ mapBounds: bounds }),

      // ── GeoJSON compartido ───────────────────────────────────────────────
      setEmpresasGeoJSON: (features) => set({ empresasGeoJSON: features }),

      // ── Búsqueda ─────────────────────────────────────────────────────────
      setSearchQuery: (query) => set({ searchQuery: query }),

      // ── Filtros genéricos ─────────────────────────────────────────────────
      setFiltro: (key, value) =>
        set((s) => ({ filtros: { ...s.filtros, [key]: value } })),

      toggleFiltroArray: (key, value) =>
        set((s) => {
          const arr = s.filtros[key] as (string | number)[];
          const exists = arr.includes(value as never);
          return {
            filtros: {
              ...s.filtros,
              [key]: exists
                ? arr.filter((v) => v !== value)
                : [...arr, value],
            },
          };
        }),

      resetFiltros: () => set({ filtros: { ...FILTROS_DEFAULT } }),

      removeFiltro: (key) => {
        const defaults = FILTROS_DEFAULT;
        set((s) => ({ filtros: { ...s.filtros, [key]: defaults[key] } }));
      },

      // ── Chips activos (para sidebar) ──────────────────────────────────────
      getFiltrosActivos: () => {
        const { filtros } = get();
        const chips: { key: keyof FiltrosActivos; label: string }[] = [];

        if (filtros.enPerimetro !== null) {
          chips.push({
            key: "enPerimetro",
            label: filtros.enPerimetro ? "En perímetro: sí" : "En perímetro: no",
          });
        }
        filtros.ccaa.forEach((v) =>
          chips.push({ key: "ccaa", label: `CCAA: ${v}` })
        );
        filtros.provincia.forEach((v) =>
          chips.push({ key: "provincia", label: `Prov: ${v}` })
        );
        filtros.sector.forEach((v) =>
          chips.push({ key: "sector", label: `Sector: ${v}` })
        );
        filtros.crmStage.forEach((v) =>
          chips.push({ key: "crmStage", label: `CRM: ${v}` })
        );
        filtros.grupoId.forEach((v) =>
          chips.push({ key: "grupoId", label: `Grupo ID: ${v}` })
        );
        if (filtros.cepreven !== null) {
          chips.push({
            key: "cepreven",
            label: filtros.cepreven ? "Cepreven: sí" : "Cepreven: no",
          });
        }
        if (filtros.aerme !== null) {
          chips.push({
            key: "aerme",
            label: filtros.aerme ? "Aerme: sí" : "Aerme: no",
          });
        }
        if (
          filtros.ingresosMin > FILTROS_DEFAULT.ingresosMin ||
          filtros.ingresosMax < FILTROS_DEFAULT.ingresosMax
        ) {
          const maxLbl = filtros.ingresosMax === Infinity ? "∞" : `${(filtros.ingresosMax / 1e6).toFixed(0)}M€`;
          chips.push({
            key: "ingresosMin",
            label: `Ingresos: ${(filtros.ingresosMin / 1e6).toFixed(0)}M€–${maxLbl}`,
          });
        }
        if (
          filtros.margenBrutoMin > FILTROS_DEFAULT.margenBrutoMin ||
          filtros.margenBrutoMax < FILTROS_DEFAULT.margenBrutoMax
        ) {
          chips.push({
            key: "margenBrutoMin",
            label: `MB: ${filtros.margenBrutoMin}–${filtros.margenBrutoMax}%`,
          });
        }
        if (
          filtros.ebitdaMin > FILTROS_DEFAULT.ebitdaMin ||
          filtros.ebitdaMax < FILTROS_DEFAULT.ebitdaMax
        ) {
          const eMax = filtros.ebitdaMax === Infinity ? "∞" : `${filtros.ebitdaMax}%`;
          chips.push({
            key: "ebitdaMin",
            label: `EBITDA: ${filtros.ebitdaMin}%–${eMax}`,
          });
        }
        return chips;
      },

      // ── Stats derivados del GeoJSON ───────────────────────────────────────
      getVisiblesCount: () => {
        const { empresasGeoJSON, filtros, searchQuery } = get();
        if (!empresasGeoJSON) return 0;
        return empresasGeoJSON.filter((f) =>
          isInFilter(f.properties, filtros, searchQuery)
        ).length;
      },

      getAvailableCCAA: () => {
        const { empresasGeoJSON } = get();
        if (!empresasGeoJSON) return [];
        const ccaaSet = new Set<string>();
        empresasGeoJSON.forEach((f) => {
          if (f.properties.ccaa) ccaaSet.add(f.properties.ccaa as string);
        });
        return Array.from(ccaaSet).sort();
      },

      getAvailableProvincias: () => {
        const { empresasGeoJSON, filtros } = get();
        if (!empresasGeoJSON) return [];
        const set = new Set<string>();
        empresasGeoJSON.forEach((f) => {
          // Si hay CCAAAs activas, solo muestra provincias de esas CCAAAs
          if (filtros.ccaa.length && !filtros.ccaa.includes(f.properties.ccaa as string)) return;
          if (f.properties.provincia) set.add(f.properties.provincia as string);
        });
        return Array.from(set).sort();
      },

      getAvailableGrupos: () => {
        const { empresasGeoJSON } = get();
        if (!empresasGeoJSON) return [];
        const grupoMap = new Map<number, string>();
        empresasGeoJSON.forEach((f) => {
          const id = f.properties.grupoId as number | null;
          const nombre = f.properties.grupoNombre as string | null;
          if (id && nombre) grupoMap.set(id, nombre);
        });
        return Array.from(grupoMap.entries())
          .map(([id, nombre]) => ({ id, nombre }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
      },
    }),
    { name: "WarRoomStore" }
  )
);
