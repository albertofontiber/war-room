"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { useNavegacion } from "@/lib/navegacion";
import { MobileDrawer } from "@/components/ui/responsive";
import type { Vista } from "@/types";

/**
 * Drawer de navegación para mobile/tablet (<lg). Los filtros viven en una
 * hoja inferior independiente, accesible desde Navbar, para que no queden
 * escondidos al final de una navegación larga.
 */
export default function WarRoomMobileMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const onPipelinePage = pathname === "/pipeline";

  const {
    sidebarMobileOpen,
    setSidebarMobileOpen,
    sizeMetric,
    setSizeMetric,
    modoPresentacion,
    toggleModoPresentacion,
    setFiltersMobileOpen,
    getFiltrosActivos,
  } = useWarRoomStore();
  const { vista, setVista } = useNavegacion();

  const close = useCallback(() => setSidebarMobileOpen(false), [setSidebarMobileOpen]);
  const activeFilterCount = getFiltrosActivos().length;

  const openFilters = useCallback(() => {
    close();
    setFiltersMobileOpen(true);
  }, [close, setFiltersMobileOpen]);

  // Cerrar el drawer cuando cambia la vista o la ruta. El base-ui Sheet no
  // siempre cierra de forma fiable si se llama setSidebarMobileOpen(false)
  // dentro del mismo handler que hace setVista() — el re-render del cambio
  // de vista absorbe la actualización del open. Reaccionar al cambio de
  // vista/pathname con effect es robusto y desacopla el cierre.
  const prevVista = useRef(vista);
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevVista.current !== vista || prevPath.current !== pathname) {
      prevVista.current = vista;
      prevPath.current = pathname;
      setSidebarMobileOpen(false);
    }
  }, [vista, pathname, setSidebarMobileOpen]);

  const goToVista = useCallback(
    (v: Vista) => {
      if (onPipelinePage) {
        setVista(v);
        router.push("/");
      } else {
        setVista(v);
      }
    },
    [onPipelinePage, router, setVista],
  );

  const goToPipeline = useCallback(() => {
    router.push("/pipeline");
  }, [router]);

  const goToFinders = useCallback(() => {
    router.push("/finders");
  }, [router]);

  const goToMonitoring = useCallback(() => {
    router.push("/monitoring");
  }, [router]);

  return (
    <MobileDrawer open={sidebarMobileOpen} onOpenChange={setSidebarMobileOpen} side="left">
      <div className="flex flex-col min-h-full">
        {/* Header del drawer — clic vuelve al inicio. */}
        <Link
          href="/"
          onClick={close}
          className="px-4 py-3 border-b border-wr-border flex-shrink-0 block"
        >
          <span className="text-xs font-semibold tracking-[0.15em] text-wr-blue uppercase">
            Fontiber War Room
          </span>
        </Link>

        {/* Sección navegación */}
        <nav className="px-3 py-3 border-b border-wr-border space-y-1 flex-shrink-0">
          <NavSectionLabel>Vistas</NavSectionLabel>
          <NavButton active={!onPipelinePage && vista === "mapa"} onClick={() => goToVista("mapa")}>
            Mapa
          </NavButton>
          <NavButton active={!onPipelinePage && vista === "tabla"} onClick={() => goToVista("tabla")}>
            Tabla
          </NavButton>
          <NavButton
            active={!onPipelinePage && vista === "operaciones"}
            onClick={() => goToVista("operaciones")}
          >
            Operaciones
          </NavButton>
          <NavButton active={!onPipelinePage && vista === "grupos"} onClick={() => goToVista("grupos")}>
            Grupos
          </NavButton>
          <NavButton active={onPipelinePage} onClick={goToPipeline}>
            Pipeline
          </NavButton>
          <NavButton onClick={openFilters}>
            {activeFilterCount ? `Filtros (${activeFilterCount})` : "Filtros"}
          </NavButton>

          <div className="pt-2 mt-2 border-t border-wr-border">
            <NavButton onClick={goToFinders}>Gestión de finders</NavButton>
          </div>

          <NavButton onClick={goToMonitoring}>Operación</NavButton>

          <div className="pt-2 mt-2 border-t border-wr-border space-y-2">
            <NavSectionLabel>Tamaño en mapa</NavSectionLabel>
            <div className="flex bg-wr-surface2 border border-wr-border rounded-md p-0.5">
              <button
                onClick={() => setSizeMetric("ingresos")}
                className={`tap-target-h flex-1 px-2.5 py-1.5 text-xs rounded transition-colors ${
                  sizeMetric === "ingresos" ? "bg-wr-surface text-wr-text" : "text-wr-muted"
                }`}
              >
                Ingresos
              </button>
              <button
                onClick={() => setSizeMetric("ebitda")}
                className={`tap-target-h flex-1 px-2.5 py-1.5 text-xs rounded transition-colors ${
                  sizeMetric === "ebitda" ? "bg-wr-surface text-wr-text" : "text-wr-muted"
                }`}
              >
                EBITDA
              </button>
            </div>

            <button
              onClick={() => {
                toggleModoPresentacion();
                close();
              }}
              className={`tap-target-h w-full text-left px-3 py-2 rounded text-xs transition-colors border ${
                modoPresentacion
                  ? "border-wr-amber/40 text-wr-amber bg-wr-amber/10"
                  : "border-wr-border text-wr-muted hover:text-wr-text"
              }`}
            >
              {modoPresentacion ? "✓ Modo presentación" : "Modo presentación"}
            </button>
          </div>
        </nav>

      </div>
    </MobileDrawer>
  );
}

function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-wr-hint uppercase tracking-widest mb-1.5 px-1">
      {children}
    </p>
  );
}

function NavButton({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors tap-target-h ${
        active
          ? "bg-wr-blue text-white font-medium"
          : "text-wr-muted hover:bg-wr-surface2 hover:text-wr-text"
      }`}
    >
      {children}
    </button>
  );
}
