"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useNavegacion } from "@/lib/navegacion";
import { useIsDesktop } from "@/lib/breakpoints";
import { ResponsiveModal } from "@/components/ui/responsive";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import WarRoomMobileMenu from "@/components/WarRoomMobileMenu";

// Lazy-load de componentes pesados (audit perf 2026-05-01). Antes todos
// estaban en el First Load JS aunque la vista activa solo monte uno:
//   - MapaEspana: Mapbox GL JS ~480KB gz
//   - PanelEmpresa: recharts ~95KB gz
//   - ChatIA: @ai-sdk + react-markdown ~80KB gz
//   - TablaEmpresas, OperacionesBorme, GruposView: 30KB gz combinados
// Todos `ssr: false` porque dependen de APIs del cliente (Mapbox, store…).
const MapaEspana = dynamic(() => import("@/components/MapaEspana"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-wr-bg">
      <p className="text-wr-muted text-sm">Cargando mapa…</p>
    </div>
  ),
});
const TablaEmpresas = dynamic(() => import("@/components/TablaEmpresas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-wr-bg">
      <p className="text-wr-muted text-sm">Cargando tabla…</p>
    </div>
  ),
});
const OperacionesBorme = dynamic(() => import("@/components/OperacionesBorme"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-wr-bg">
      <p className="text-wr-muted text-sm">Cargando operaciones…</p>
    </div>
  ),
});
const GruposView = dynamic(() => import("@/components/GruposView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-wr-bg">
      <p className="text-wr-muted text-sm">Cargando grupos…</p>
    </div>
  ),
});
const PanelEmpresa = dynamic(() => import("@/components/PanelEmpresa"), {
  ssr: false,
});
const ChatIA = dynamic(() => import("@/components/ChatIA"), { ssr: false });

export default function WarRoomLayout() {
  const { vista, panelAbierto, seleccionarEmpresa, cerrarPanel } = useNavegacion();
  const isDesktop = useIsDesktop();

  // Listen for empresa selection events from GruposView
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: number }>).detail?.id;
      if (id) seleccionarEmpresa(id);
    };
    window.addEventListener("selectEmpresa", handler);
    return () => window.removeEventListener("selectEmpresa", handler);
  }, [seleccionarEmpresa]);

  return (
    // Pantalla completa sin scroll externo
    <div className="h-screen w-screen flex overflow-hidden bg-wr-bg">
      {/* ── Sidebar izquierdo 260px (solo desktop ≥lg) ── */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* ── Drawer mobile (<lg): controlado por sidebarMobileOpen del store ── */}
      <WarRoomMobileMenu />

      {/* ── Área central (flex-1) ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Navbar 44px fijo */}
        <Navbar />

        {/* Contenedor relative para que el panel pueda flotar como overlay
            sobre el mapa/tabla sin empujarlo. El panel arranca bajo el Navbar
            (porque está dentro del flex-col después de él). */}
        <div className="flex-1 relative overflow-hidden">
          <main className="absolute inset-0">
            {vista === "mapa" && <MapaEspana />}
            {vista === "tabla" && <TablaEmpresas />}
            {vista === "operaciones" && <OperacionesBorme />}
            {vista === "grupos" && <GruposView />}
          </main>

          {/* PanelEmpresa:
              - Desktop (≥lg): overlay 560px sobre el contenido (preserva
                el comportamiento original — sin backdrop, navega libre).
              - Mobile/tablet (<lg): ResponsiveModal fullscreen vía Sheet
                (con backdrop sutil, cerrar tapping fuera o swipe).
              Funciona en TODAS las vistas (mapa, tabla, operaciones, grupos)
              para que un click en empresa abra el panel encima sin perder
              el contexto de navegación previo. */}
          {panelAbierto && (
            isDesktop ? (
              <div className="absolute top-0 right-0 bottom-0 w-[560px] z-20 shadow-2xl shadow-black/40 flex">
                <PanelEmpresa />
              </div>
            ) : (
              <ResponsiveModal
                open={panelAbierto}
                onOpenChange={(o) => !o && cerrarPanel()}
              >
                <PanelEmpresa />
              </ResponsiveModal>
            )
          )}
        </div>
      </div>

      {/* ── Chat IA flotante ── */}
      <ChatIA />
    </div>
  );
}
