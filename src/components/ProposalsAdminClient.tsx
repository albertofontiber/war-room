"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import { dispatchDataChanged } from "@/lib/data-events";

type Proposal = {
  id: number;
  companyName: string;
  cif: string | null;
  website: string | null;
  contactName: string | null;
  contactRole: string | null;
  notes: string | null;
  status: "PENDING" | "ACCEPTED" | "DUPLICATE" | "OUT_OF_SCOPE" | "REJECTED";
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  finder: { id: string; name: string; email: string };
  empresa: { id: number; nombre: string } | null;
  dedupMatch: { id: number; nombre: string; cif: string } | null;
};

type Status = Proposal["status"] | "ALL";

const STATUS_LABEL: Record<Proposal["status"], string> = {
  PENDING: "En revisión",
  ACCEPTED: "Aceptada",
  DUPLICATE: "Ya existía",
  OUT_OF_SCOPE: "Fuera de scope",
  REJECTED: "Rechazada",
};

const STATUS_PILL: Record<Proposal["status"], string> = {
  PENDING: "bg-wr-blue/15 text-wr-blue border-wr-blue/30",
  ACCEPTED: "bg-wr-green/15 text-wr-green border-wr-green/30",
  DUPLICATE: "bg-wr-amber/15 text-wr-amber border-wr-amber/30",
  OUT_OF_SCOPE: "bg-[#64748b]/20 text-[#94a3b8] border-[#64748b]/30",
  REJECTED: "bg-wr-red/15 text-wr-red border-wr-red/30",
};

export default function ProposalsAdminClient() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status>("PENDING");
  const [acting, setActing] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/proposals?status=${filter}`)
      .then((r) => r.json())
      .then((d) => setProposals(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: number, status: Proposal["status"], rejectionReason?: string) => {
    setActing(id);
    try {
      await fetch(`/api/admin/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionReason: rejectionReason ?? null }),
      });
      dispatchDataChanged({
        resource: "propuesta",
        resourceId: id,
        action: "update",
        source: "ProposalsAdminClient/review",
      });
      // Si la propuesta se aceptó, además se ha podido crear una Empresa.
      // Notifica para que mapas / Kanban refresquen al volver al panel.
      if (status === "ACCEPTED") {
        dispatchDataChanged({
          resource: "empresa",
          action: "create",
          source: "ProposalsAdminClient/review-accept",
        });
      }
      load();
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-screen bg-wr-bg text-wr-text p-3 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Propuestas de finders</h1>
            <p className="text-wr-hint text-xs mt-0.5">
              Valida las propuestas de nuevos targets que nos envían los finders.
              Solo se muestran al finder el estado resultante (no la razón interna).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/finders" className="text-xs text-wr-blue hover:underline">← Finders</a>
            <a href="/" className="text-xs text-wr-blue hover:underline">War Room</a>
          </div>
        </header>

        <div className="flex gap-2 mb-3 flex-wrap">
          {(["PENDING", "ACCEPTED", "DUPLICATE", "OUT_OF_SCOPE", "REJECTED", "ALL"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${
                filter === s
                  ? "bg-wr-blue/20 text-wr-blue border-wr-blue/40"
                  : "bg-wr-surface2 text-wr-muted border-wr-border hover:text-wr-text"
              }`}
            >
              {s === "ALL" ? "Todas" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="bg-wr-surface border border-wr-border rounded-lg overflow-hidden">
          {loading ? (
            <p className="p-6 text-center text-wr-hint text-xs">Cargando…</p>
          ) : proposals.length === 0 ? (
            <p className="p-6 text-center text-wr-hint text-xs italic">
              Sin propuestas en este filtro.
            </p>
          ) : (
            <ul className="divide-y divide-wr-border">
              {proposals.map((p) => (
                <li key={p.id} className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-medium text-wr-text">{p.companyName}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${STATUS_PILL[p.status]}`}>
                          {STATUS_LABEL[p.status]}
                        </span>
                        {p.dedupMatch && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded border bg-wr-amber/15 text-wr-amber border-wr-amber/40 inline-flex items-center gap-1"
                            title={`Coincide con empresa #${p.dedupMatch.id}`}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M12 9v4M12 17h.01" />
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            </svg>
                            Posible duplicado: {p.dedupMatch.nombre} ({p.dedupMatch.cif})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-wr-muted">
                        Finder: {p.finder.name} · {fmtDate(p.createdAt)}
                        {p.reviewedAt && <> · Revisada {fmtDate(p.reviewedAt)}</>}
                      </p>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        {p.cif && <div><span className="text-wr-hint">CIF:</span> {p.cif}</div>}
                        {p.website && (
                          <div>
                            <span className="text-wr-hint">Web:</span>{" "}
                            <a
                              href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-wr-blue hover:underline"
                            >
                              {p.website}
                            </a>
                          </div>
                        )}
                        {(p.contactName || p.contactRole) && (
                          <div>
                            <span className="text-wr-hint">Contacto:</span>{" "}
                            {p.contactName}{p.contactRole && ` (${p.contactRole})`}
                          </div>
                        )}
                      </div>
                      {p.notes && (
                        <p className="mt-2 text-[11px] text-wr-muted whitespace-pre-wrap border-l-2 border-wr-border pl-2">
                          {p.notes}
                        </p>
                      )}
                      {p.rejectionReason && (
                        <p className="mt-2 text-[10px] text-wr-hint italic">
                          Nota interna: {p.rejectionReason}
                        </p>
                      )}
                    </div>

                    {p.status === "PENDING" && (
                      <div className="flex flex-row sm:flex-col gap-1 sm:flex-shrink-0 flex-wrap">
                        <button
                          disabled={acting === p.id}
                          onClick={() => review(p.id, "ACCEPTED")}
                          className="text-[10px] px-2 py-1 rounded bg-wr-green/10 border border-wr-green/30 text-wr-green hover:bg-wr-green/20 disabled:opacity-40"
                        >
                          Aceptar
                        </button>
                        <button
                          disabled={acting === p.id}
                          onClick={() => review(p.id, "DUPLICATE")}
                          className="text-[10px] px-2 py-1 rounded bg-wr-amber/10 border border-wr-amber/30 text-wr-amber hover:bg-wr-amber/20 disabled:opacity-40"
                        >
                          Duplicada
                        </button>
                        <button
                          disabled={acting === p.id}
                          onClick={() => review(p.id, "OUT_OF_SCOPE")}
                          className="text-[10px] px-2 py-1 rounded bg-wr-surface2 border border-wr-border text-wr-muted hover:text-wr-text disabled:opacity-40"
                        >
                          Fuera scope
                        </button>
                        <button
                          disabled={acting === p.id}
                          onClick={() => {
                            const reason = prompt("Motivo (interno, no visible al finder):") || "";
                            review(p.id, "REJECTED", reason || undefined);
                          }}
                          className="text-[10px] px-2 py-1 rounded bg-wr-red/10 border border-wr-red/30 text-wr-red hover:bg-wr-red/20 disabled:opacity-40"
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
