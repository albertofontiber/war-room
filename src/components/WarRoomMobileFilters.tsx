"use client";

import { SidebarContent } from "@/components/Sidebar";
import { BottomSheet } from "@/components/ui/responsive";
import { useWarRoomStore } from "@/store/useWarRoomStore";

/** Filtros móviles en una hoja inferior dedicada. */
export default function WarRoomMobileFilters() {
  const {
    filtersMobileOpen,
    setFiltersMobileOpen,
    resetFiltros,
    getFiltrosActivos,
    getVisiblesCount,
  } = useWarRoomStore();

  const activeFilterCount = getFiltrosActivos().length;
  const visiblesCount = getVisiblesCount();

  return (
    <BottomSheet
      open={filtersMobileOpen}
      onOpenChange={setFiltersMobileOpen}
      title={activeFilterCount ? `Filtros · ${activeFilterCount} activos` : "Filtros"}
      maxHeightVh={0.92}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetFiltros}
            disabled={activeFilterCount === 0}
            className="tap-target-h flex-1 rounded-lg border border-wr-border px-3 text-sm text-wr-muted transition-colors hover:border-wr-muted hover:text-wr-text disabled:cursor-not-allowed disabled:opacity-45"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => setFiltersMobileOpen(false)}
            className="tap-target-h flex-[1.4] rounded-lg bg-wr-blue px-3 text-sm font-medium text-white transition-colors hover:bg-wr-blue-light"
          >
            Ver {visiblesCount} resultados
          </button>
        </div>
      }
    >
      <SidebarContent scroll={false} showHeader={false} />
    </BottomSheet>
  );
}
