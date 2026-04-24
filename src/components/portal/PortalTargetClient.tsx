"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";
import {
  FINDER_STATUS_MAP,
  FINDER_STATUS_PILL,
} from "@/lib/crm";
import type { FinderStatus } from "@/lib/crm";
import type { DealStage } from "@/types";

type Target = {
  id: number;
  nombre: string;
  sector: string | null;
  provincia: string | null;
  ccaa: string | null;
  localidad: string | null;
  web: string | null;
  linkedin: string | null;
  descripcion: string | null;
  logoUrl: string | null;
  crmEstado: { dealStage: DealStage | null; fechaEntradaStage: string | null } | null;
  notas: {
    id: number;
    contenido: string;
    createdAt: string;
    autor: { name: string } | null;
    autorFinder: { name: string } | null;
  }[];
  tareas: {
    id: number;
    tipo: string;
    titulo: string;
    descripcion: string | null;
    fechaLimite: string | null;
    completada: boolean;
    completadaAt: string | null;
    createdAt: string;
    autor: { name: string } | null;
    autorFinder: { name: string } | null;
  }[];
  actividades: {
    id: number;
    tipo: string;
    texto: string | null;
    fecha: string;
    autorFinder: { name: string } | null;
  }[];
};

const SECTOR_LABEL: Record<string, string> = {
  PCI: "PCI",
  seguridad_electronica: "Seg. electrónica",
  mixto: "Mixto",
};

export default function PortalTargetClient({
  empresaId,
  finderName,
}: {
  empresaId: number;
  finderName: string;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portal/empresas/${empresaId}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error("No tienes acceso a este target.");
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then(setTarget)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [empresaId]);

  const initials = finderName.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  const stage = target?.crmEstado?.dealStage ?? null;
  const status: FinderStatus | null = stage ? FINDER_STATUS_MAP[stage] : null;

  return (
    <div className="min-h-screen flex flex-col bg-wr-bg">
      <header className="h-12 flex-shrink-0 flex items-center px-5 gap-3 border-b border-wr-border bg-wr-surface">
        <button
          onClick={() => router.push("/portal")}
          className="text-[11px] text-wr-muted hover:text-wr-text flex items-center gap-1"
        >
          ← Pipeline
        </button>
        <div className="flex-1" />
        <span className="text-[11px] text-wr-hint">{finderName}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/portal/login" })}
          className="w-7 h-7 rounded-full bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-xs font-semibold flex items-center justify-center hover:bg-wr-blue/30"
        >
          {initials}
        </button>
      </header>

      <main className="flex-1 overflow-auto">
        {loading && <p className="p-8 text-center text-wr-hint text-sm">Cargando…</p>}
        {error && <p className="p-8 text-center text-wr-red text-sm">{error}</p>}
        {target && (
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {/* Header target */}
            <div className="flex items-start gap-4">
              {target.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={target.logoUrl} alt="" className="w-14 h-14 object-contain rounded-lg border border-wr-border bg-wr-surface2" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-xl font-bold flex items-center justify-center flex-shrink-0">
                  {target.nombre.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-wr-text">{target.nombre}</h1>
                <p className="text-xs text-wr-muted">
                  {[
                    target.sector ? SECTOR_LABEL[target.sector] ?? target.sector : null,
                    target.localidad,
                    target.provincia,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${FINDER_STATUS_PILL[status]}`}>
                      {status}
                    </span>
                  )}
                  {target.web && (
                    <a
                      href={target.web.startsWith("http") ? target.web : `https://${target.web}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-wr-blue hover:underline"
                    >
                      Web ↗
                    </a>
                  )}
                  {target.linkedin && (
                    <a
                      href={target.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-wr-blue hover:underline"
                    >
                      LinkedIn ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {target.descripcion && (
              <p className="text-xs text-wr-muted leading-relaxed border-l-2 border-wr-border pl-3">
                {target.descripcion}
              </p>
            )}

            {/* Tareas */}
            <section>
              <h2 className="text-[10px] font-semibold text-wr-muted uppercase tracking-widest mb-2">
                Tareas ({target.tareas.length})
              </h2>
              {target.tareas.length === 0 ? (
                <p className="text-xs text-wr-hint italic">Sin tareas. Podrás crear tareas en la siguiente versión.</p>
              ) : (
                <div className="space-y-2">
                  {target.tareas.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-lg border ${
                        t.completada
                          ? "border-wr-border bg-wr-surface2/30 opacity-60"
                          : "border-wr-border bg-wr-surface"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`w-3.5 h-3.5 mt-0.5 rounded border flex-shrink-0 ${
                            t.completada ? "bg-wr-green border-wr-green" : "border-wr-border"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs ${t.completada ? "line-through text-wr-muted" : "text-wr-text"}`}>
                            {t.titulo}
                          </p>
                          {t.descripcion && (
                            <p className="text-[11px] text-wr-muted mt-0.5">{t.descripcion}</p>
                          )}
                          <p className="text-[10px] text-wr-hint mt-1">
                            {t.fechaLimite && <>Vence {fmtDate(t.fechaLimite)} · </>}
                            {t.autorFinder?.name ?? t.autor?.name}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Historial: notas + actividades mezcladas por fecha */}
            <section>
              <h2 className="text-[10px] font-semibold text-wr-muted uppercase tracking-widest mb-2">
                Historial
              </h2>
              {target.notas.length === 0 && target.actividades.length === 0 ? (
                <p className="text-xs text-wr-hint italic">Aún no hay historial visible.</p>
              ) : (
                <ul className="space-y-3">
                  {[
                    ...target.notas.map((n) => ({
                      kind: "nota" as const,
                      fecha: n.createdAt,
                      contenido: n.contenido,
                      autor: n.autorFinder?.name ?? n.autor?.name ?? "—",
                      esFinder: !!n.autorFinder,
                    })),
                    ...target.actividades.map((a) => ({
                      kind: "actividad" as const,
                      fecha: a.fecha,
                      tipo: a.tipo,
                      contenido: a.texto ?? "",
                      autor: a.autorFinder?.name ?? "—",
                      esFinder: true,
                    })),
                  ]
                    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
                    .map((h, i) => (
                      <li key={i} className="flex gap-2 text-xs">
                        <div className="w-5 flex-shrink-0 text-center text-[10px] font-bold text-wr-muted">
                          {h.kind === "nota" ? "N" : h.kind === "actividad" ? "A" : "·"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-wr-text leading-snug whitespace-pre-wrap">{h.contenido}</p>
                          <p className="text-[10px] text-wr-hint mt-0.5">
                            {h.autor} · {fmtDate(h.fecha)}
                            {!h.esFinder && <span className="ml-2 text-wr-blue">· Fontiber</span>}
                          </p>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <div className="pt-4 border-t border-wr-border text-[10px] text-wr-hint text-center">
              La opción de añadir notas y tareas llegará en la siguiente versión del portal.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
