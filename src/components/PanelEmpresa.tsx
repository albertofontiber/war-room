"use client";

import { useWarRoomStore } from "@/store/useWarRoomStore";
import { useNavegacion } from "@/lib/navegacion";
import { Separator } from "@/components/ui/separator";
import { BadgesRow } from "./panel-empresa/BadgesRow";
import { ContactosSection } from "./panel-empresa/ContactosSection";
import { CrmBlock } from "./panel-empresa/CrmBlock";
import { CrmKpiSection } from "./panel-empresa/CrmKpiSection";
import { DatosGenerales } from "./panel-empresa/DatosGenerales";
import { DocumentacionSection } from "./panel-empresa/DocumentacionSection";
import { GestionBlock } from "./panel-empresa/GestionBlock";
import { KpisFinancieros } from "./panel-empresa/KpisFinancieros";
import { PanelHeader } from "./panel-empresa/PanelHeader";
import { PanelSkeleton } from "./panel-empresa/PanelSkeleton";
import { useEmpresaDetalle } from "./panel-empresa/useEmpresaDetalle";
import { TimelineSection } from "./TimelineSection";
import type { PanelEmpresaProps } from "./panel-empresa/types";

// Tarjeta unificada — antes había una versión compacta (mapa/tabla, con botón
// "Ver detalle en Pipeline") y otra detallada (/pipeline, con CrmSections).
// Ahora una sola estructura para todas las pestañas: Funnel + Finder + Tareas
// + Historial + Notas + Gestión + Financieros + Histórico. Las sub-secciones
// CRM son collapsibles default-cerradas (PR #46) para que la financiera sea
// lo primero visible al abrir un target.
export default function PanelEmpresa({ onEmpresaChanged }: PanelEmpresaProps = {}) {
  const { modoPresentacion } = useWarRoomStore();
  const { cerrarPanel } = useNavegacion();
  const { empresa, setEmpresa, loading, toggling, handleStageChange, togglePerimetro } =
    useEmpresaDetalle(onEmpresaChanged);

  if (loading || !empresa) return <PanelSkeleton onClose={cerrarPanel} />;

  return (
    <aside className="w-full h-full min-h-0 bg-wr-surface border-l border-wr-border flex flex-col animate-slide-in-right">
      <PanelHeader
        empresa={empresa}
        modoPresentacion={modoPresentacion}
        onClose={cerrarPanel}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/*
          Orden aprobado (2026-05-12):
          1. Header
          2. CRM (Funnel + Tareas + Notas)
          3. KPIs financieros
          4. Datos generales
          5. Timeline (feed unificado — absorbe el antiguo Historial y BormeSenales)
          6. Documentación

          Bloques accesorios (BadgesRow, GestionBlock, descripción,
          CrmKpiSection, ContactosSection) mantenidos en su contexto natural.
        */}
        <div className="p-3 sm:p-4 space-y-4">
          <BadgesRow empresa={empresa} />

          {/* 2. CRM */}
          <CrmBlock
            empresa={empresa}
            setEmpresa={setEmpresa}
            onStageChange={handleStageChange}
            onEmpresaChanged={onEmpresaChanged}
          />

          <GestionBlock
            empresa={empresa}
            setEmpresa={setEmpresa}
            toggling={toggling}
            togglePerimetro={togglePerimetro}
            onEmpresaChanged={onEmpresaChanged}
          />

          {empresa.descripcion && (
            <p className="text-xs text-wr-muted leading-relaxed">
              {empresa.descripcion}
            </p>
          )}

          <Separator className="bg-wr-border" />

          {/* 3. KPIs financieros */}
          {!modoPresentacion && <KpisFinancieros empresa={empresa} />}

          {/* 4. Datos generales */}
          <DatosGenerales empresa={empresa} modoPresentacion={modoPresentacion} />

          {empresa.crmEstado && (
            <>
              <Separator className="bg-wr-border" />
              <CrmKpiSection empresa={empresa} />
            </>
          )}

          {/* 5. Timeline — feed cronológico unificado (incluye BORME). */}
          <Separator className="bg-wr-border" />
          <TimelineSection empresaId={empresa.id} />

          {/* 6. Documentación + Contactos */}
          <Separator className="bg-wr-border" />
          <DocumentacionSection
            empresaId={empresa.id}
            initial={{
              oneDriveUrl: empresa.oneDriveUrl,
              notionUrl: empresa.notionUrl,
              nombreComercial: empresa.nombreComercial,
            }}
            onSaved={(next) => {
              setEmpresa({
                ...empresa,
                oneDriveUrl: next.oneDriveUrl,
                notionUrl: next.notionUrl,
                nombreComercial: next.nombreComercial,
              });
            }}
          />

          <ContactosSection empresaId={empresa.id} />

          <div className="h-4" />
        </div>
      </div>
    </aside>
  );
}
