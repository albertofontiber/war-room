"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

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
  const { vistaActual, panelAbierto, seleccionarEmpresa } = useWarRoomStore();

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
      {/* ── Sidebar izquierdo 260px ── */}
      <Sidebar />

      {/* ── Área central (flex-1) ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Navbar 44px fijo */}
        <Navbar />

        {/* Contenedor relative para que el panel pueda flotar como overlay
            sobre el mapa/tabla sin empujarlo. El panel arranca bajo el Navbar
            (porque está dentro del flex-col después de él). */}
        <div className="flex-1 relative overflow-hidden">
          <main className="absolute inset-0">
            {vistaActual === "mapa" && <MapaEspana />}
            {vistaActual === "tabla" && <TablaEmpresas />}
            {vistaActual === "operaciones" && <OperacionesBorme />}
            {vistaActual === "grupos" && <GruposView />}
          </main>

          {/* Panel lateral derecho 560px — overlay sobre el contenido,
              solo en mapa/tabla/grupos. */}
          {panelAbierto && vistaActual !== "operaciones" && (
            <div className="absolute top-0 right-0 bottom-0 w-[560px] z-20 shadow-2xl shadow-black/40 flex">
              <PanelEmpresa />
            </div>
          )}
        </div>
      </div>

      {/* ── Chat IA flotante ── */}
      <ChatIA />
    </div>
  );
}
