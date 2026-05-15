"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import KanbanBoard, { type KanbanCard, type SortOption, SORT_LABEL } from "@/components/KanbanBoard";
import PanelEmpresa from "@/components/PanelEmpresa";
// ChatIA y AddLeadModal son lazy: no se necesitan en el primer paint del
// Kanban y el ChatIA carga `react-markdown` + ai-sdk hooks (~80 KB gzip).
// `xlsx` (~25 KB gzip) se importa dinámicamente dentro del callback de
// export para no engordar el chunk inicial.
const ChatIA = dynamic(() => import("@/components/ChatIA"), { ssr: false });
const AddLeadModal = dynamic(() => import("@/components/AddLeadModal"), { ssr: false });
import PipelineFiltros, {
  EMPTY_FILTERS,
  type PipelineFilters,
} from "@/components/PipelineFiltros";
import WarRoomMobileMenu from "@/components/WarRoomMobileMenu";
import { ResponsiveModal } from "@/components/ui/responsive";
import { useIsDesktop } from "@/lib/breakpoints";
import { useNavegacion } from "@/lib/navegacion";
import { dispatchDataChanged, subscribeDataChanged } from "@/lib/data-events";
import type { DealStage } from "@/types";
import { DEAL_STAGES, DEAL_STAGE_LABEL } from "@/lib/crm";

type PipelineData = {
  stages: DealStage[];
  grouped: Record<DealStage, KanbanCard[]>;
  counts: Record<DealStage, number>;
  total: number;
};

type PipelineMeta = {
  ccaa: string[];
  provincia: string[];
  owners: { value: string; label: string }[];
  finders: { value: string; label: string }[];
};

const EMPTY_DATA: PipelineData = {
  stages: DEAL_STAGES,
  grouped: {
    identificado: [],
    contactado: [],
    primera_reunion: [],
    analisis: [],
    "LOI enviada": [],
    execution: [],
    portfolio: [],
    on_hold: [],
    muerto: [],
  },
  counts: {
    identificado: 0,
    contactado: 0,
    primera_reunion: 0,
    analisis: 0,
    "LOI enviada": 0,
    execution: 0,
    portfolio: 0,
    on_hold: 0,
    muerto: 0,
  },
  total: 0,
};

const EMPTY_META: PipelineMeta = { ccaa: [], provincia: [], owners: [], finders: [] };

function buildQuery(f: PipelineFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.ccaa.length) p.set("ccaa", f.ccaa.join(","));
  if (f.provincia.length) p.set("provincia", f.provincia.join(","));
  if (f.sector.length) p.set("sector", f.sector.join(","));
  if (f.owner) p.set("owner", f.owner);
  if (f.finder) p.set("finder", f.finder);
  if (f.conTarea) p.set("conTarea", "true");
  if (f.diasSinActividadMin != null)
    p.set("diasSinActividadMin", String(f.diasSinActividadMin));
  return p;
}

export default function PipelinePageClient() {
  const [data, setData] = useState<PipelineData>(EMPTY_DATA);
  const [meta, setMeta] = useState<PipelineMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PipelineFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortOption>("nombre");
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const { seleccionarEmpresa, empresaSeleccionadaId, panelAbierto, cerrarPanel } = useNavegacion();
  const isDesktop = useIsDesktop();

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/pipeline-meta", { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      setMeta(await res.json());
    } catch (err) {
      console.error("[pipeline-meta]", err);
    }
  }, []);

  const loadPipeline = useCallback(
    async (f: PipelineFilters) => {
      try {
        setLoading(true);
        const url = new URL("/api/crm/pipeline", window.location.origin);
        const params = buildQuery(f);
        params.forEach((v, k) => url.searchParams.set(k, v));
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status}`);
        setData((await res.json()) as PipelineData);
      } catch (err) {
        console.error("[pipeline fetch]", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // Debounce para cambios de filtros (evita spam de fetch al escribir)
  useEffect(() => {
    const t = setTimeout(() => loadPipeline(filters), 250);
    return () => clearTimeout(t);
  }, [filters, loadPipeline]);

  const handleStageChange = useCallback(
    async (empresaId: number, nuevoStage: DealStage) => {
      setData((prev) => {
        const next: PipelineData = {
          ...prev,
          grouped: { ...prev.grouped },
          counts: { ...prev.counts },
        };
        let moved: KanbanCard | null = null;
        for (const s of DEAL_STAGES) {
          const idx = next.grouped[s].findIndex((c) => c.id === empresaId);
          if (idx >= 0) {
            moved = { ...next.grouped[s][idx], dealStage: nuevoStage };
            next.grouped[s] = next.grouped[s].filter((c) => c.id !== empresaId);
            next.counts[s] = next.grouped[s].length;
            break;
          }
        }
        if (moved) {
          next.grouped[nuevoStage] = [moved, ...next.grouped[nuevoStage]];
          next.counts[nuevoStage] = next.grouped[nuevoStage].length;
        }
        return next;
      });

      try {
        const res = await fetch(`/api/empresas/${empresaId}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealStage: nuevoStage }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        // Notifica: la ficha de empresa abierta y el mapa se actualizan al
        // recibir esto. El optimistic update local ya hizo el cambio en el
        // Kanban antes de la response.
        dispatchDataChanged({
          resource: "stage",
          resourceId: empresaId,
          action: "update",
          parent: { resource: "empresa", id: empresaId },
          source: "PipelinePageClient/stageChange",
        });
      } catch (err) {
        console.error("[stage change]", err);
        loadPipeline(filters);
      }
    },
    [loadPipeline, filters]
  );

  const allCards: KanbanCard[] = useMemo(
    () => DEAL_STAGES.flatMap((s) => data.grouped[s] ?? []),
    [data]
  );

  const handleExport = useCallback(async () => {
    const rows = allCards.map((c) => ({
      Empresa: c.nombre,
      CIF: c.cif,
      Stage: c.dealStage ? DEAL_STAGE_LABEL[c.dealStage] : "Sin CRM",
      Grupo: c.grupoNombre ?? "",
      CCAA: c.ccaa ?? "",
      Provincia: c.provincia ?? "",
      Sector: c.sector ?? "",
      Web: c.web ?? "",
      Owner: c.ownerName ?? "",
      Finder: c.finderName ?? "",
      "Ingresos (€)": c.ingresos ?? "",
      "GM (%)":
        c.margenBrutoPct != null ? Number(c.margenBrutoPct.toFixed(1)) : "",
      "EBITDA (€)": c.ebitda ?? "",
      "Días en stage": c.diasEnStage ?? "",
      "Días sin actividad": c.diasSinActividad ?? "",
      "Tareas pendientes": c.tareasPendientes,
      "Última actividad":
        c.ultimaActividad?.fecha?.split("T")[0] ?? "",
    }));
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pipeline");
    const stamp = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `pipeline_${stamp}.xlsx`);
  }, [allCards]);

  return (
    <div className="h-screen flex flex-col bg-wr-bg text-wr-text">
      <Navbar />
      {/* Drawer mobile (controlado por sidebarMobileOpen del store, abierto
          por el hamburger del Navbar). Sin esto, en /pipeline el hamburger
          del Navbar no haría nada visible. */}
      <WarRoomMobileMenu />
      {/* Toolbar Pipeline.
          Desktop (lg+): una fila flex-wrap con spacer que empuja acciones a la
          derecha — comportamiento original.
          Mobile (<lg): 3 filas separadas por line-breaks `basis-full h-0`
          (título+count → filtros → acciones). Evita el desorden visual de
          mezclar filtros y acciones en el mismo flex-wrap. */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-2.5 border-b border-wr-border bg-wr-surface flex items-center gap-2 sm:gap-3 flex-wrap">
        <h1 className="text-sm font-semibold uppercase tracking-wider text-wr-muted">
          Pipeline
        </h1>
        <span className="text-xs text-wr-hint">
          {data.total} {data.total === 1 ? "empresa" : "empresas"}
          {loading && " · cargando…"}
        </span>

        {/* Mobile-only: forzar wrap antes de filtros */}
        <div className="basis-full h-0 lg:hidden" aria-hidden />

        <PipelineFiltros
          filters={filters}
          onChange={setFilters}
          ccaaOptions={meta.ccaa}
          provinciaOptions={meta.provincia}
          ownerOptions={meta.owners}
          finderOptions={meta.finders}
        />

        {/* Desktop: spacer empuja acciones a la derecha.
            Mobile: line-break para que acciones caigan a su propia fila. */}
        <div className="hidden lg:block flex-1" />
        <div className="basis-full h-0 lg:hidden" aria-hidden />

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="bg-wr-surface2 border border-wr-border rounded-md px-2 py-1 text-[10px] text-wr-muted focus:outline-none focus:border-wr-blue cursor-pointer"
          title="Ordenar dentro de cada columna"
        >
          {(Object.keys(SORT_LABEL) as SortOption[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
        <button
          onClick={() => setLeadModalOpen(true)}
          className="text-[11px] bg-wr-amber/15 text-wr-amber border border-wr-amber/30 rounded px-2 py-1 lg:px-2.5 hover:bg-wr-amber/25 transition-colors"
          title="Añadir un target confidencial cuya identidad aún no se conoce"
        >
          <span className="lg:hidden">+ Lead</span>
          <span className="hidden lg:inline">+ Lead sin identificar</span>
        </button>
        <button
          onClick={handleExport}
          disabled={allCards.length === 0}
          className="text-[11px] bg-wr-green/15 text-wr-green border border-wr-green/30 rounded px-2 py-1 lg:px-2.5 hover:bg-wr-green/25 disabled:opacity-40 transition-colors"
        >
          <span className="lg:hidden">Excel ({allCards.length})</span>
          <span className="hidden lg:inline">Export Excel ({allCards.length})</span>
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <KanbanBoard
            grouped={data.grouped}
            onStageChange={handleStageChange}
            onCardClick={(id) => seleccionarEmpresa(id)}
            sort={sort}
          />
        </div>
        {panelAbierto && empresaSeleccionadaId != null && (
          isDesktop ? (
            <div className="absolute top-0 right-0 bottom-0 w-[50%] min-w-[520px] max-w-[720px] shadow-2xl shadow-black/50 z-20 flex">
              <PanelEmpresa onEmpresaChanged={() => loadPipeline(filters)} />
            </div>
          ) : (
            <ResponsiveModal
              open={panelAbierto}
              onOpenChange={(o) => !o && cerrarPanel()}
              desktopWidth={720}
            >
              <PanelEmpresa onEmpresaChanged={() => loadPipeline(filters)} />
            </ResponsiveModal>
          )
        )}
      </div>

      <AddLeadModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        ccaaOptions={meta.ccaa}
        provinciaOptions={meta.provincia}
        onCreated={(empresaId) => {
          loadPipeline(filters);
          loadMeta();
          seleccionarEmpresa(empresaId);
        }}
      />

      <ChatIA />
    </div>
  );
}
