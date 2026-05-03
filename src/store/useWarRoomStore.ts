import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  type FiltrosActivos,
  type Vista,
  type SizeMetric,
  type Sector,
  type DealStage,
  type Tendencia,
  FILTROS_DEFAULT,
} from "@/types";
import { isInFilter } from "@/lib/filtros";

/**
 * Shape real de `properties` en los features GeoJSON que devuelve
 * `/api/empresas`. Si cambias ese endpoint, sincroniza este tipo.
 */
export interface EmpresaFeatureProperties {
  id: number;
  cif: string;
  nombre: string;
  localidad: string | null;
  provincia: string | null;
  ccaa: string | null;
  sector: Sector | null;
  dealStage: DealStage | null;
  ingresos: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  empleados: number | null;
  enPerimetro: boolean;
  bormeAlertasCount: number;
  hasBormeReciente: boolean;
  tareasPendientesCount: number;
  logoUrl: string | null;
  web: string | null;
  grupoId: number | null;
  grupoNombre: string | null;
  cepreven: string | null;
  aerme: boolean;
  score: number | null;
  tendencia: Tendencia;
  variacionPct: number | null;
}

export interface RawFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: EmpresaFeatureProperties;
}

interface WarRoomState {
  // ── Navegación ──────────────────────────────────────────────────────────
  vistaActual: Vista;
  modoPresentacion: boolean;

  // Drawer mobile (Navbar abre, Sidebar/Nav lo cierran al elegir).
  // Solo aplica en viewport < lg; en desktop el Sidebar siempre está fijo.
  sidebarMobileOpen: boolean;

  // ── Empresa seleccionada / panel ─────────────────────────────────────────
  empresaSeleccionadaId: number | null;
  panelAbierto: boolean;

  // ── Mapa ─────────────────────────────────────────────────────────────────
  sizeMetric: SizeMetric;
  flyToEmpresaId: number | null;
  mapViewState: { longitude: number; latitude: number; zoom: number };
  mapBounds: { west: number; south: number; east: number; north: number } | null;

  // ── GeoJSON compartido (un único fetch desde Navbar; consumido por
  //    Sidebar, MapaEspana, etc.). `empresasLoading` es flag de idempotencia
  //    para evitar la triple-fetch que había antes (audit perf 2026-05-01):
  //    los 3 useEffect montaban en el mismo tick y la guarda `if (geoJSON)`
  //    no detenía las réplicas porque setState aún no había propagado.
  empresasGeoJSON: RawFeature[] | null;
  empresasLoading: boolean;

  // ── Búsqueda ─────────────────────────────────────────────────────────────
  searchQuery: string;

  // ── Filtros ──────────────────────────────────────────────────────────────
  filtros: FiltrosActivos;

  // ── Actions ──────────────────────────────────────────────────────────────
  setVista: (vista: Vista) => void;
  toggleModoPresentacion: () => void;

  setSidebarMobileOpen: (open: boolean) => void;
  toggleSidebarMobile: () => void;

  seleccionarEmpresa: (id: number) => void;
  cerrarPanel: () => void;

  setSizeMetric: (metric: SizeMetric) => void;
  setFlyToEmpresaId: (id: number | null) => void;
  setMapViewState: (vs: { longitude: number; latitude: number; zoom: number }) => void;
  setMapBounds: (bounds: { west: number; south: number; east: number; north: number } | null) => void;

  setEmpresasGeoJSON: (features: RawFeature[]) => void;
  /** Carga `/api/empresas` solo si aún no se ha cargado y no hay un fetch en
   * vuelo. Llamar desde el primer componente que monte (Navbar). Resto de
   * componentes consumen `empresasGeoJSON` del store sin hacer fetch propio. */
  hydrateEmpresas: () => Promise<void>;

  /** Actualiza in-place algunas properties de un feature concreto del GeoJSON.
   * Útil para que mapa y tabla reflejen al instante un cambio que el panel
   * acaba de persistir en la BD (stage, grupo, perímetro…), sin tener que
   * recargar todo el GeoJSON. */
  updateEmpresaInGeoJSON: (
    id: number,
    patch: Partial<EmpresaFeatureProperties>
  ) => void;

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
      sidebarMobileOpen: false,
      empresaSeleccionadaId: null,
      panelAbierto: false,
      sizeMetric: "ingresos",
      flyToEmpresaId: null,
      mapViewState: { longitude: -3.7, latitude: 40.4, zoom: 5.5 },
      mapBounds: null,
      empresasGeoJSON: null,
      empresasLoading: false,
      searchQuery: "",
      filtros: { ...FILTROS_DEFAULT },

      // ── Navegación ──────────────────────────────────────────────────────
      setVista: (vista) => set({ vistaActual: vista }),

      toggleModoPresentacion: () =>
        set((s) => ({ modoPresentacion: !s.modoPresentacion })),

      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),
      toggleSidebarMobile: () =>
        set((s) => ({ sidebarMobileOpen: !s.sidebarMobileOpen })),

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

      hydrateEmpresas: async () => {
        const state = get();
        // Idempotente: si ya hay datos o un fetch en vuelo, no relanza.
        if (state.empresasGeoJSON !== null || state.empresasLoading) return;
        set({ empresasLoading: true });
        try {
          const r = await fetch("/api/empresas");
          if (!r.ok) throw new Error(`API ${r.status}`);
          const data = await r.json();
          if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
            set({ empresasGeoJSON: data.features });
          }
        } catch (err) {
          console.error("[hydrateEmpresas]", err);
        } finally {
          set({ empresasLoading: false });
        }
      },

      updateEmpresaInGeoJSON: (id, patch) => {
        const current = get().empresasGeoJSON;
        if (!current) return;
        const next = current.map((f) =>
          f.properties.id === id
            ? { ...f, properties: { ...f.properties, ...patch } }
            : f
        );
        set({ empresasGeoJSON: next });
      },

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
          chips.push({
            key: "crmStage",
            label: v === "sin_crm" ? "CRM: Sin CRM" : `CRM: ${v}`,
          })
        );
        filtros.grupoId.forEach((v) =>
          chips.push({ key: "grupoId", label: v === 0 ? "Sin grupo" : `Grupo ID: ${v}` })
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
            label: `GM: ${filtros.margenBrutoMin}–${filtros.margenBrutoMax}%`,
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
          if (f.properties.ccaa) ccaaSet.add(f.properties.ccaa);
        });
        return Array.from(ccaaSet).sort();
      },

      getAvailableProvincias: () => {
        const { empresasGeoJSON, filtros } = get();
        if (!empresasGeoJSON) return [];
        const set = new Set<string>();
        empresasGeoJSON.forEach((f) => {
          // Si hay CCAAs activas, solo muestra provincias de esas CCAAs
          if (filtros.ccaa.length && (f.properties.ccaa === null || !filtros.ccaa.includes(f.properties.ccaa))) return;
          if (f.properties.provincia) set.add(f.properties.provincia);
        });
        return Array.from(set).sort();
      },

      getAvailableGrupos: () => {
        const { empresasGeoJSON } = get();
        if (!empresasGeoJSON) return [];
        const grupoMap = new Map<number, string>();
        empresasGeoJSON.forEach((f) => {
          const id = f.properties.grupoId;
          const nombre = f.properties.grupoNombre;
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
