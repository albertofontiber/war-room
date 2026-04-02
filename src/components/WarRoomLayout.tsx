"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import TablaEmpresas from "@/components/TablaEmpresas";
import PanelEmpresa from "@/components/PanelEmpresa";
import OperacionesBorme from "@/components/OperacionesBorme";
import GruposView from "@/components/GruposView";

const MapaEspana = dynamic(() => import("@/components/MapaEspana"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-wr-bg">
      <p className="text-wr-muted text-sm">Cargando mapa…</p>
    </div>
  ),
});

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

        {/* Contenido principal: mapa, tabla, operaciones o grupos */}
        <main className="flex-1 overflow-hidden">
          {vistaActual === "mapa" && <MapaEspana />}
          {vistaActual === "tabla" && <TablaEmpresas />}
          {vistaActual === "operaciones" && <OperacionesBorme />}
          {vistaActual === "grupos" && <GruposView />}
        </main>
      </div>

      {/* ── Panel lateral derecho 340px — solo en mapa/tabla/grupos ── */}
      {panelAbierto && vistaActual !== "operaciones" && <PanelEmpresa />}
    </div>
  );
}
