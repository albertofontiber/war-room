"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { MobileDrawer } from "@/components/ui/responsive";
import { SidebarContent } from "@/components/Sidebar";
import type { Vista } from "@/types";

/**
 * Drawer del War Room en mobile/tablet (<lg). Combina dos secciones:
 *  1. Navegación: vistas (Mapa/Tabla/Operaciones/Grupos/Pipeline) + acceso
 *     a Finders + toggle métrica + toggle modo presentación.
 *  2. Filtros: el SidebarContent completo, igual que en desktop.
 *
 * En desktop estos dos bloques viven en sitios distintos (Navbar vs Sidebar
 * fijo). Mobile los unifica para evitar dos drawers separados.
 *
 * El estado `sidebarMobileOpen` vive en el store; Navbar lo abre con el
 * hamburger, este componente y los items de navegación lo cierran al elegir.
 */
export default function WarRoomMobileMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const onPipelinePage = pathname === "/pipeline";

  const {
    sidebarMobileOpen,
    setSidebarMobileOpen,
    vistaActual,
    setVista,
    sizeMetric,
    setSizeMetric,
    modoPresentacion,
    toggleModoPresentacion,
  } = useWarRoomStore();

  const close = useCallback(() => setSidebarMobileOpen(false), [setSidebarMobileOpen]);

  // Cerrar el drawer cuando cambia la vista o la ruta. El base-ui Sheet no
  // siempre cierra de forma fiable si se llama setSidebarMobileOpen(false)
  // dentro del mismo handler que hace setVista() — el re-render del cambio
  // de vista absorbe la actualización del open. Reaccionar al cambio de
  // vista/pathname con effect es robusto y desacopla el cierre.
  const prevVista = useRef(vistaActual);
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevVista.current !== vistaActual || prevPath.current !== pathname) {
      prevVista.current = vistaActual;
      prevPath.current = pathname;
      setSidebarMobileOpen(false);
    }
  }, [vistaActual, pathname, setSidebarMobileOpen]);

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

  return (
    <MobileDrawer open={sidebarMobileOpen} onOpenChange={setSidebarMobileOpen} side="left">
      <div className="flex flex-col h-full">
        {/* Header del drawer */}
        <div className="px-4 py-3 border-b border-wr-border flex-shrink-0">
          <span className="text-xs font-semibold tracking-[0.15em] text-wr-blue uppercase">
            Fontiber War Room
          </span>
        </div>

        {/* Sección navegación */}
        <nav className="px-3 py-3 border-b border-wr-border space-y-1 flex-shrink-0">
          <NavSectionLabel>Vistas</NavSectionLabel>
          <NavButton active={!onPipelinePage && vistaActual === "mapa"} onClick={() => goToVista("mapa")}>
            Mapa
          </NavButton>
          <NavButton active={!onPipelinePage && vistaActual === "tabla"} onClick={() => goToVista("tabla")}>
            Tabla
          </NavButton>
          <NavButton
            active={!onPipelinePage && vistaActual === "operaciones"}
            onClick={() => goToVista("operaciones")}
          >
            Operaciones
          </NavButton>
          <NavButton active={!onPipelinePage && vistaActual === "grupos"} onClick={() => goToVista("grupos")}>
            Grupos
          </NavButton>
          <NavButton active={onPipelinePage} onClick={goToPipeline}>
            Pipeline
          </NavButton>

          <div className="pt-2 mt-2 border-t border-wr-border">
            <NavButton onClick={goToFinders}>Gestión de finders</NavButton>
          </div>

          <div className="pt-2 mt-2 border-t border-wr-border space-y-2">
            <NavSectionLabel>Tamaño en mapa</NavSectionLabel>
            <div className="flex bg-wr-surface2 border border-wr-border rounded-md p-0.5">
              <button
                onClick={() => setSizeMetric("ingresos")}
                className={`flex-1 px-2.5 py-1.5 text-xs rounded transition-colors ${
                  sizeMetric === "ingresos" ? "bg-wr-surface text-wr-text" : "text-wr-muted"
                }`}
              >
                Ingresos
              </button>
              <button
                onClick={() => setSizeMetric("ebitda")}
                className={`flex-1 px-2.5 py-1.5 text-xs rounded transition-colors ${
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
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border ${
                modoPresentacion
                  ? "border-wr-amber/40 text-wr-amber bg-wr-amber/10"
                  : "border-wr-border text-wr-muted hover:text-wr-text"
              }`}
            >
              {modoPresentacion ? "✓ Modo presentación" : "Modo presentación"}
            </button>
          </div>
        </nav>

        {/* Sección filtros (reutiliza SidebarContent) */}
        <div className="flex-1 min-h-0 flex flex-col">
          <SidebarContent />
        </div>
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
