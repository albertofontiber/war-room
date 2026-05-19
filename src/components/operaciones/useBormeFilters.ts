/**
 * Hook que aplica filtros del store global + filtros locales (tipo, fechas, sort)
 * a las 3 listas de OperacionesBorme. Centraliza también las stats derivadas.
 *
 * Encapsula la complejidad que antes vivía dispersa en useMemos del componente
 * monolítico. La función `applyStoreFilters` se define dentro del hook para
 * cerrar sobre `filtros` sin que React deduzca dependencias erróneas.
 */

import { useMemo, useState } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { FILTER_TIPOS } from "./types";
import type { OperacionItem, PersonaCompartida, SortDir } from "./types";

interface UseBormeFiltersInput {
  items: OperacionItem[];
  personas: PersonaCompartida[];
}

export function useBormeFilters({ items, personas }: UseBormeFiltersInput) {
  const filtros = useWarRoomStore((s) => s.filtros);

  const [tiposActivos, setTiposActivos] = useState<Set<string>>(new Set(FILTER_TIPOS));
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [sortKey, setSortKey] = useState<string>("fecha");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [personaSortKey, setPersonaSortKey] = useState<string>("ultimaAparicion");
  const [personaSortDir, setPersonaSortDir] = useState<SortDir>("desc");

  const toggleTipo = (t: string) => {
    setTiposActivos((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size > 1) next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const togglePersonaSort = (key: string) => {
    if (personaSortKey === key) {
      setPersonaSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setPersonaSortKey(key);
      setPersonaSortDir("desc");
    }
  };

  /** Aplica los filtros del store (sidebar) a una lista de items que tengan,
   *  o bien `empresa` con los campos relevantes, o los campos en raíz. */
  function applyStoreFilters<
    T extends {
      empresa?: {
        enPerimetro?: boolean;
        ccaa?: string | null;
        provincia?: string | null;
        sector?: string | null;
        grupoId?: number | null;
        ingresos?: number | null;
      };
      enPerimetro?: boolean;
      ccaa?: string | null;
      provincia?: string | null;
      sector?: string | null;
      grupoId?: number | null;
      ingresos?: number | null;
    },
  >(list: T[]): T[] {
    return list.filter((item) => {
      const e = "empresa" in item && item.empresa ? item.empresa : item;
      if (filtros.enPerimetro !== null && e.enPerimetro !== filtros.enPerimetro) return false;
      if (filtros.ccaa.length && (!e.ccaa || !filtros.ccaa.includes(e.ccaa))) return false;
      if (filtros.provincia.length && (!e.provincia || !filtros.provincia.includes(e.provincia))) return false;
      if (filtros.sector.length && (!e.sector || !(filtros.sector as string[]).includes(e.sector))) return false;
      if (filtros.grupoId.length && (e.grupoId === null || !filtros.grupoId.includes(e.grupoId!))) return false;
      if (filtros.ingresosMin > 0 && (e.ingresos == null || e.ingresos < filtros.ingresosMin)) return false;
      if (filtros.ingresosMax < Infinity && (e.ingresos == null || e.ingresos > filtros.ingresosMax)) return false;
      return true;
    });
  }

  // ── Filtered señales ──────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let result = items.filter((item) => tiposActivos.has(item.efectiveTipo));
    result = applyStoreFilters(result);
    if (fechaDesde) result = result.filter((i) => i.fecha >= fechaDesde);
    if (fechaHasta) result = result.filter((i) => i.fecha <= fechaHasta + "T23:59:59");
    return [...result].sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "fecha") {
        av = new Date(a.fecha).getTime();
        bv = new Date(b.fecha).getTime();
      } else if (sortKey === "ingresos") {
        av = a.empresa.ingresos ?? -Infinity;
        bv = b.empresa.ingresos ?? -Infinity;
      } else if (sortKey === "ebitda") {
        av = a.empresa.ebitdaPct ?? -Infinity;
        bv = b.empresa.ebitdaPct ?? -Infinity;
      } else return 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, tiposActivos, filtros, fechaDesde, fechaHasta, sortKey, sortDir]);

  // ── Filtered personas ────────────────────────────────────────────────────
  const filteredPersonas = useMemo((): PersonaCompartida[] => {
    // Mantener personas con AL MENOS UNA empresa que pase los filtros del sidebar.
    // Se muestran TODAS las empresas de esa persona para conservar el contexto cruzado.
    let filtered = personas.filter((p) => applyStoreFilters(p.empresas).length >= 1);

    if (fechaDesde) filtered = filtered.filter((p) => p.ultimaAparicion >= fechaDesde);
    if (fechaHasta) filtered = filtered.filter((p) => p.ultimaAparicion <= fechaHasta + "T23:59:59");

    return [...filtered].sort((a, b) => {
      if (personaSortKey === "nombre") {
        const cmp = a.nombreNorm.localeCompare(b.nombreNorm);
        return personaSortDir === "asc" ? cmp : -cmp;
      }
      let av: number, bv: number;
      if (personaSortKey === "ultimaAparicion") {
        av = new Date(a.ultimaAparicion).getTime();
        bv = new Date(b.ultimaAparicion).getTime();
      } else if (personaSortKey === "numEmpresas") {
        av = a.numEmpresas;
        bv = b.numEmpresas;
      } else if (personaSortKey === "ingresos") {
        av = a.empresas.reduce((s, e) => s + (e.ingresos ?? 0), 0);
        bv = b.empresas.reduce((s, e) => s + (e.ingresos ?? 0), 0);
      } else if (personaSortKey === "enPerimetro") {
        av = a.empresas.filter((e) => e.enPerimetro).length;
        bv = b.empresas.filter((e) => e.enPerimetro).length;
      } else return 0;
      return personaSortDir === "asc" ? av - bv : bv - av;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, filtros, fechaDesde, fechaHasta, personaSortKey, personaSortDir]);

  const totalApariciones = useMemo(
    () => filteredPersonas.reduce((sum, p) => sum + p.numEmpresas, 0),
    [filteredPersonas]
  );

  // Stats señales
  const stats = useMemo(() => {
    const porTipo: Record<string, number> = {};
    for (const i of filteredItems) porTipo[i.efectiveTipo] = (porTipo[i.efectiveTipo] ?? 0) + 1;
    const gruposActivos = new Set(
      filteredItems
        .filter((i) => i.adquirente.tipo === "grupo_conocido")
        .map((i) => i.adquirente.grupoNombre)
    ).size;
    return { porTipo, gruposActivos };
  }, [filteredItems]);

  // Active sidebar filter chips
  const filtrosAplicados = useMemo(() => {
    const chips: string[] = [];
    if (filtros.enPerimetro !== null) chips.push(filtros.enPerimetro ? "En perímetro" : "Fuera perímetro");
    if (filtros.ccaa.length) chips.push(`CCAA: ${filtros.ccaa.join(", ")}`);
    if (filtros.provincia.length) chips.push(`Prov: ${filtros.provincia.join(", ")}`);
    if (filtros.sector.length) chips.push(`Sector: ${filtros.sector.join(", ")}`);
    if (filtros.grupoId.length) chips.push(`${filtros.grupoId.length} grupo(s)`);
    if (filtros.ingresosMin > 0 || filtros.ingresosMax < Infinity) chips.push("Ingresos");
    return chips;
  }, [filtros]);

  return {
    // state
    tiposActivos,
    fechaDesde,
    setFechaDesde,
    fechaHasta,
    setFechaHasta,
    sortKey,
    sortDir,
    personaSortKey,
    personaSortDir,
    // actions
    toggleTipo,
    toggleSort,
    togglePersonaSort,
    // derived
    filteredItems,
    filteredPersonas,
    totalApariciones,
    stats,
    filtrosAplicados,
  };
}
