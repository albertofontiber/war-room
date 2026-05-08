"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DEAL_STAGES, DEAL_STAGE_LABEL, DEAL_STAGE_PILL_CLASS } from "@/lib/crm";
import type { DealStage } from "@/types";

type Card = {
  id: number;
  nombre: string;
  provincia: string | null;
  ccaa: string | null;
  sector: string | null;
  dealStage: DealStage;
  diasEnStage: number | null;
  ultimaActividad: { fecha: string; tipo: string } | null;
  diasSinActividad: number | null;
  tareasPendientes: number;
};

type PipelineData = {
  stages: DealStage[];
  grouped: Record<DealStage, Card[]>;
  counts: Record<DealStage, number>;
  total: number;
  finder: { id: string; name: string };
};

const SECTOR_LABEL: Record<string, string> = {
  PCI: "PCI",
  seguridad_electronica: "Seg. electrónica",
  mixto: "Mixto",
};

export default function PortalPipelineClient({ finderName }: { finderName: string }) {
  const router = useRouter();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/portal/pipeline")
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const initials = finderName.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  return (
    <div className="min-h-screen flex flex-col bg-wr-bg">
      {/* Header — en mobile sm- omitimos "Fontiber · " del título y el
          nombre del finder (las iniciales del botón ya identifican al user).
          Sin esto, el contenido se desbordaba a la derecha del viewport. */}
      <header className="h-12 flex-shrink-0 flex items-center px-3 sm:px-5 gap-2 sm:gap-3 border-b border-wr-border bg-wr-surface">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-wr-blue flex-shrink-0">
            <path
              d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"
              fill="#3b82f6"
              opacity="0.15"
            />
            <path
              d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[11px] font-semibold tracking-[0.15em] text-wr-blue uppercase truncate">
            <span className="hidden sm:inline">Fontiber · </span>Portal Finders
          </span>
        </div>

        <div className="flex-1" />

        <span className="hidden sm:inline text-[11px] text-wr-hint truncate">{finderName}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/portal/login" })}
          title={`${finderName} — cerrar sesión`}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-xs font-semibold flex items-center justify-center hover:bg-wr-blue/30"
        >
          {initials}
        </button>
      </header>

      {/* Contenido */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="px-3 sm:px-5 py-3 flex items-center justify-between border-b border-wr-border gap-2">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-wr-text truncate">Mis targets</h1>
            <p className="text-[10px] text-wr-hint truncate">
              {data ? `${data.total} ${data.total === 1 ? "empresa" : "empresas"} asignadas` : "—"}
            </p>
          </div>
          <button
            onClick={() => router.push("/portal/proponer")}
            className="text-xs px-3 py-2 sm:py-1.5 bg-wr-blue text-white rounded hover:bg-blue-500 flex-shrink-0 whitespace-nowrap"
          >
            + Proponer target
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center text-wr-hint text-sm">Cargando…</div>
        )}
        {error && (
          <div className="flex-1 flex items-center justify-center text-wr-red text-sm">
            Error: {error}
          </div>
        )}
        {/* Kanban con scroll horizontal. En mobile cada columna se ancla
            al swipe (snap-x snap-mandatory) para que aterricen completas
            y no a medio camino. En sm+ desactivamos el snap porque el
            scroll natural con varias columnas visibles funciona mejor. */}
        {!loading && !error && data && (
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex gap-2 sm:gap-3 p-2 sm:p-4 snap-x snap-mandatory sm:snap-none">
            {DEAL_STAGES.map((stage) => {
              const cards = data.grouped[stage];
              return (
                <div
                  key={stage}
                  className="snap-start flex-shrink-0 w-[85vw] max-w-[18rem] sm:w-64 sm:max-w-none bg-wr-surface2/50 border border-wr-border rounded-lg flex flex-col"
                >
                  <div className="px-3 py-2 border-b border-wr-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${DEAL_STAGE_PILL_CLASS[stage]}`}>
                        {DEAL_STAGE_LABEL[stage]}
                      </span>
                    </div>
                    <span className="text-[10px] text-wr-hint">{cards.length}</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                    {cards.length === 0 ? (
                      <p className="text-[10px] text-wr-hint text-center py-4 italic">
                        Sin targets en esta columna.
                      </p>
                    ) : (
                      cards.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => router.push(`/portal/empresas/${c.id}`)}
                          className="w-full text-left bg-wr-surface border border-wr-border rounded p-2 hover:border-wr-blue/50 transition-colors"
                        >
                          <p className="text-xs font-medium text-wr-text line-clamp-2">{c.nombre}</p>
                          <p className="text-[10px] text-wr-hint mt-0.5">
                            {[c.sector ? (SECTOR_LABEL[c.sector] ?? c.sector) : null, c.provincia]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            {c.tareasPendientes > 0 && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-wr-amber/20 text-wr-amber border border-wr-amber/30">
                                {c.tareasPendientes}T
                              </span>
                            )}
                            {c.diasSinActividad != null && (
                              <span className="text-[9px] text-wr-hint">
                                {c.diasSinActividad === 0 ? "Hoy" : `${c.diasSinActividad}d sin actividad`}
                              </span>
                            )}
                            {c.diasSinActividad == null && (
                              <span className="text-[9px] text-wr-hint italic">Sin actividad</span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
