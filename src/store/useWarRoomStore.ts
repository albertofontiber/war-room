import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  type FiltrosActivos,
  type SizeMetric,
  type Sector,
  type DealStage,
  type Tendencia,
  FILTROS_DEFAULT,
} from "@/types";
import { isInFilter } from "@/lib/filtros";

/**
 * Shape real de `properties` en los features GeoJSON.
 *
 * El store usa una sola interfaz para lite y full porque los componentes
 * leen el mismo objeto; los campos exclusivos de full son opcionales y
 * arrancan `undefined` mientras solo está cargado el lite.
 *
 *   - Lite (`/api/empresas/lite`): los campos requeridos abajo. Suficiente
 *     para mapa, sidebar, filtros, búsqueda Navbar.
 *   - Full (`/api/empresas`): añade los opcionales. Lo carga la tabla.
 */
export interface EmpresaFeatureProperties {
  // ── Núcleo (presente en lite y full) ──────────────────────────────────
  id: number;
  cif: string;
  nombre: string;
  provincia: string | null;
  ccaa: string | null;
  sector: Sector | null;
  dealStage: DealStage | null;
  // Financieros que usan filtros + sizeMetric del mapa
  ingresos: number | null;
  ebitda: number | null;
  margenBrutoPct: number | null;
  ebitdaPct: number | null;
  // Booleanos / categorías filtrables
  enPerimetro: boolean;
  cepreven: string | null;
  aerme: boolean;
  hasBormeReciente: boolean;
  grupoId: number | null;
  grupoNombre: string | null;
  tendencia: Tendencia;

  // ── Solo en full (`/api/empresas`) ────────────────────────────────────
  // Mientras solo está cargado lite, estos son `undefined`. La tabla
  // dispara `hydrateEmpresasFull()` antes de leerlos.
  localidad?: string | null;
  margenBruto?: number | null;
  empleados?: number | null;
  logoUrl?: string | null;
  web?: string | null;
  score?: number | null;
  variacionPct?: number | null;
  tareasPendientesCount?: number;
  bormeAlertasCount?: number;
}

export interface RawFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: EmpresaFeatureProperties;
}

interface WarRoomState {
  // ── Navegación ──────────────────────────────────────────────────────────
  // `vista` y `empresa` viven en URL search params (ver `useNavegacion`):
  // best practice Next 14 para state navegable. Aquí solo lo ephemeral.
  modoPresentacion: boolean;

  // Drawer mobile (Navbar abre, Sidebar/Nav lo cierran al elegir).
  // Solo aplica en viewport < lg; en desktop el Sidebar siempre está fijo.
  sidebarMobileOpen: boolean;
  filtersMobileOpen: boolean;

  // ── Mapa ─────────────────────────────────────────────────────────────────
  sizeMetric: SizeMetric;
  flyToEmpresaId: number | null;
  mapViewState: { longitude: number; latitude: number; zoom: number };
  mapBounds: { west: number; south: number; east: number; north: number } | null;

  // ── GeoJSON compartido (Navbar dispara el fetch lite; Tabla dispara el
  //    full). `empresasLoading*` son flags de idempotencia para evitar la
  //    triple-fetch que había antes (audit perf 2026-05-01).
  //
  //    Tras el split lite/full (PR endpoint-per-view, BFF):
  //      - lite carga primero, ~17 campos, suficiente para mapa+sidebar+filtros.
  //      - full la dispara TablaEmpresas onMount; reemplaza el GeoJSON con
  //        el payload completo (incluye logoUrl, web, empleados, etc.).
  //      - `empresasFullLoaded` es la única fuente de verdad sobre si los
  //        campos opcionales están disponibles para leer.
  empresasGeoJSON: RawFeature[] | null;
  empresasLoading: boolean;
  empresasFullLoading: boolean;
  empresasFullLoaded: boolean;

  // ── Búsqueda ─────────────────────────────────────────────────────────────
  searchQuery: string;

  // ── Filtros ──────────────────────────────────────────────────────────────
  filtros: FiltrosActivos;

  // ── Actions ──────────────────────────────────────────────────────────────
  toggleModoPresentacion: () => void;

  setSidebarMobileOpen: (open: boolean) => void;
  toggleSidebarMobile: () => void;
  setFiltersMobileOpen: (open: boolean) => void;

  setSizeMetric: (metric: SizeMetric) => void;
  setFlyToEmpresaId: (id: number | null) => void;
  setMapViewState: (vs: { longitude: number; latitude: number; zoom: number }) => void;
  setMapBounds: (bounds: { west: number; south: number; east: number; north: number } | null) => void;

  setEmpresasGeoJSON: (features: RawFeature[]) => void;
  /** Carga `/api/empresas/lite` solo si aún no se ha cargado y no hay un
   * fetch en vuelo. Llamar desde el primer componente que monte (Navbar).
   * Idempotente: si ya está el full, no recarga. */
  hydrateEmpresas: () => Promise<void>;
  /** Carga `/api/empresas` (full) y reemplaza el GeoJSON. La dispara
   * TablaEmpresas onMount. Idempotente. */
  hydrateEmpresasFull: () => Promise<void>;

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
      modoPresentacion: false,
      sidebarMobileOpen: false,
      filtersMobileOpen: false,
      sizeMetric: "ingresos",
      flyToEmpresaId: null,
      mapViewState: { longitude: -3.7, latitude: 40.4, zoom: 5.0 },
      mapBounds: null,
      empresasGeoJSON: null,
      empresasLoading: false,
      empresasFullLoading: false,
      empresasFullLoaded: false,
      searchQuery: "",
      filtros: { ...FILTROS_DEFAULT },

      // ── Navegación ──────────────────────────────────────────────────────
      toggleModoPresentacion: () =>
        set((s) => ({ modoPresentacion: !s.modoPresentacion })),

      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),
      toggleSidebarMobile: () =>
        set((s) => ({ sidebarMobileOpen: !s.sidebarMobileOpen })),
      setFiltersMobileOpen: (open) => set({ filtersMobileOpen: open }),

      // ── Mapa / métrica ───────────────────────────────────────────────────
      setSizeMetric: (metric) => set({ sizeMetric: metric }),
      setFlyToEmpresaId: (id) => set({ flyToEmpresaId: id }),
      setMapViewState: (vs) => set({ mapViewState: vs }),
      setMapBounds: (bounds) => set({ mapBounds: bounds }),

      // ── GeoJSON compartido ───────────────────────────────────────────────
      setEmpresasGeoJSON: (features) => set({ empresasGeoJSON: features }),

      hydrateEmpresas: async () => {
        const state = get();
        // Idempotente: si ya hay datos (lite o full) o un fetch en vuelo,
        // no relanza. Si full ya está cargado, lite no aporta nada.
        if (
          state.empresasGeoJSON !== null ||
          state.empresasLoading ||
          state.empresasFullLoaded
        ) {
          return;
        }
        set({ empresasLoading: true });
        try {
          const r = await fetch("/api/empresas/lite");
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

      hydrateEmpresasFull: async () => {
        const state = get();
        if (state.empresasFullLoaded || state.empresasFullLoading) return;
        set({ empresasFullLoading: true });
        try {
          const r = await fetch("/api/empresas");
          if (!r.ok) throw new Error(`API ${r.status}`);
          const data = await r.json();
          if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
            set({ empresasGeoJSON: data.features, empresasFullLoaded: true });
          }
        } catch (err) {
          console.error("[hydrateEmpresasFull]", err);
        } finally {
          set({ empresasFullLoading: false });
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
