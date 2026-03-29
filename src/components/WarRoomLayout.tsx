"use client";

import dynamic from "next/dynamic";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import TablaEmpresas from "@/components/TablaEmpresas";
import PanelEmpresa from "@/components/PanelEmpresa";

const MapaEspana = dynamic(() => import("@/components/MapaEspana"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-wr-bg">
      <p className="text-wr-muted text-sm">Cargando mapa…</p>
    </div>
  ),
});

export default function WarRoomLayout() {
  const { vistaActual, panelAbierto } = useWarRoomStore();

  return (
    // Pantalla completa sin scroll externo
    <div className="h-screen w-screen flex overflow-hidden bg-wr-bg">
      {/* ── Sidebar izquierdo 260px ── */}
      <Sidebar />

      {/* ── Área central (flex-1) ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Navbar 44px fijo */}
        <Navbar />

        {/* Contenido principal: mapa o tabla */}
        <main className="flex-1 overflow-hidden">
          {vistaActual === "mapa" ? <MapaEspana /> : <TablaEmpresas />}
        </main>
      </div>

      {/* ── Panel lateral derecho 340px — condicional ── */}
      {panelAbierto && <PanelEmpresa />}
    </div>
  );
}
