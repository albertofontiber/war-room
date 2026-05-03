"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";

type Proposal = {
  id: number;
  companyName: string;
  cif: string | null;
  website: string | null;
  contactName: string | null;
  contactRole: string | null;
  status: "PENDING" | "ACCEPTED" | "DUPLICATE" | "OUT_OF_SCOPE" | "REJECTED";
  createdAt: string;
  reviewedAt: string | null;
};

// Labels visibles al finder. Mantenemos DUPLICATE con apariencia de "cerrada"
// neutra (no "Ya existía") para no revelar que la empresa estaba registrada.
// Desde admin se sigue etiquetando como "Duplicada".
const STATUS_LABEL: Record<Proposal["status"], string> = {
  PENDING: "En revisión",
  ACCEPTED: "Aceptada",
  DUPLICATE: "Cerrada",
  OUT_OF_SCOPE: "Fuera de scope",
  REJECTED: "Rechazada",
};

const STATUS_PILL: Record<Proposal["status"], string> = {
  PENDING: "bg-wr-blue/15 text-wr-blue border-wr-blue/30",
  ACCEPTED: "bg-wr-green/15 text-wr-green border-wr-green/30",
  DUPLICATE: "bg-[#64748b]/20 text-[#94a3b8] border-[#64748b]/30",
  OUT_OF_SCOPE: "bg-[#64748b]/20 text-[#94a3b8] border-[#64748b]/30",
  REJECTED: "bg-wr-red/15 text-wr-red border-wr-red/30",
};

export default function PortalProposeClient({ finderName }: { finderName: string }) {
  const router = useRouter();
  const [history, setHistory] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyName, setCompanyName] = useState("");
  const [cif, setCif] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [matches, setMatches] = useState<{ nombre: string; cif: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<
    | { kind: "created"; mensaje: string }
    | { kind: "error"; mensaje: string }
    | null
  >(null);

  const loadHistory = () => {
    setLoading(true);
    fetch("/api/portal/proposals")
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadHistory(); }, []);

  // Debounced search contra la BD. Función SOLO de ayuda al finder para
  // evitar escribir un nombre ligeramente distinto al que ya existe (typo,
  // espaciado, SA vs SL...). El dropdown NO revela si el target está o no
  // en seguimiento — simplemente muestra empresas del universo conocido.
  useEffect(() => {
    const qRaw = companyName.trim().length >= 2 ? companyName.trim() : (cif.trim().length >= 2 ? cif.trim() : "");
    if (qRaw.length < 2) { setMatches([]); return; }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/portal/empresas/search?q=${encodeURIComponent(qRaw)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setMatches(data); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [companyName, cif]);

  // Cerrar dropdown al clicar fuera
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const reset = () => {
    setCompanyName(""); setCif(""); setWebsite("");
    setContactName(""); setContactRole(""); setNotes("");
    setMatches([]); setShowDropdown(false);
  };

  const pickMatch = (m: { nombre: string; cif: string }) => {
    setCompanyName(m.nombre);
    setCif(m.cif);
    setShowDropdown(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setFeedback(null);
    try {
      const res = await fetch("/api/portal/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          cif: cif.trim() || null,
          website: website.trim() || null,
          contactName: contactName.trim() || null,
          contactRole: contactRole.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback({
          kind: "error",
          mensaje: json.issues?.map((i: { message: string }) => i.message).join("; ") || json.error || "Error",
        });
        return;
      }
      setFeedback({
        kind: "created",
        mensaje: "Propuesta enviada. Fontiber la revisará y te avisará.",
      });
      reset();
      loadHistory();
    } catch (err) {
      setFeedback({ kind: "error", mensaje: String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const initials = finderName.split(" ").slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  return (
    <div className="min-h-screen flex flex-col bg-wr-bg">
      <header className="h-12 flex-shrink-0 flex items-center px-3 sm:px-5 gap-3 border-b border-wr-border bg-wr-surface">
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
        <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-wr-text">Proponer target</h1>
            <p className="text-xs text-wr-muted mt-1">
              Comparte con Fontiber una empresa que consideres interesante para el fondo.
              Revisaremos si ya está en seguimiento y te avisaremos.
            </p>
          </div>

          <form onSubmit={submit} className="bg-wr-surface border border-wr-border rounded-lg p-4 space-y-3">
            <div ref={searchWrapperRef} className="relative">
              <Field label="Nombre de la empresa (obligatorio)">
                <input
                  value={companyName}
                  onChange={(e) => { setCompanyName(e.target.value); setShowDropdown(true); }}
                  onFocus={() => { if (matches.length > 0) setShowDropdown(true); }}
                  placeholder="Ej. Soluciones Fire SL"
                  className="input"
                  required
                  autoFocus
                  autoComplete="off"
                />
              </Field>
              {showDropdown && matches.length > 0 && (
                <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-wr-surface border border-wr-border rounded shadow-xl max-h-64 overflow-y-auto">
                  <p className="px-3 py-1.5 text-[10px] text-wr-hint uppercase tracking-wider border-b border-wr-border">
                    Sugerencias
                  </p>
                  {matches.map((m) => (
                    <button
                      key={m.cif}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pickMatch(m); }}
                      className="w-full text-left px-3 py-2 hover:bg-wr-surface2 transition-colors"
                    >
                      <p className="text-xs text-wr-text truncate">{m.nombre}</p>
                      <p className="text-[10px] text-wr-hint">{m.cif}</p>
                    </button>
                  ))}
                </div>
              )}
              {searching && (
                <p className="mt-1 text-[10px] text-wr-hint">Buscando en la BD…</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="CIF (si lo conoces)">
                <input
                  value={cif}
                  onChange={(e) => { setCif(e.target.value.toUpperCase()); setShowDropdown(true); }}
                  placeholder="B12345678"
                  className="input"
                  autoComplete="off"
                />
              </Field>
              <Field label="Web">
                <input
                  value={website} onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://…"
                  className="input"
                />
              </Field>
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Contacto (nombre)">
                <input
                  value={contactName} onChange={(e) => setContactName(e.target.value)}
                  placeholder="Juan Pérez"
                  className="input"
                />
              </Field>
              <Field label="Contacto (rol)">
                <input
                  value={contactRole} onChange={(e) => setContactRole(e.target.value)}
                  placeholder="CEO, fundador…"
                  className="input"
                />
              </Field>
            </div>

            <Field label="Por qué te parece interesante (opcional)">
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Contexto, tamaño estimado, qué sabes del fundador, etc."
                className="input resize-none"
              />
            </Field>

            {feedback && (
              <div
                className={`rounded border p-3 text-xs ${
                  feedback.kind === "created"
                    ? "border-wr-green/30 bg-wr-green/5 text-wr-green"
                    : "border-wr-red/30 bg-wr-red/5 text-wr-red"
                }`}
              >
                {feedback.mensaje}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-wr-border">
              <button
                type="submit"
                disabled={submitting || !companyName.trim()}
                className="text-xs px-4 py-2.5 sm:py-2 bg-wr-blue text-white rounded hover:bg-blue-500 disabled:opacity-40 w-full sm:w-auto"
              >
                {submitting ? "Enviando…" : "Enviar propuesta"}
              </button>
            </div>
          </form>

          {/* Historial */}
          <section>
            <h2 className="text-[10px] font-semibold text-wr-muted uppercase tracking-widest mb-2">
              Tus propuestas ({history.length})
            </h2>
            {loading ? (
              <p className="text-xs text-wr-hint">Cargando…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-wr-hint italic">Todavía no has propuesto ningún target.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((p) => (
                  <li key={p.id} className="bg-wr-surface border border-wr-border rounded-lg p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-wr-text font-medium truncate">{p.companyName}</p>
                      <p className="text-[10px] text-wr-hint mt-0.5">
                        Enviada {fmtDate(p.createdAt)}
                        {p.reviewedAt && <> · Revisada {fmtDate(p.reviewedAt)}</>}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${STATUS_PILL[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <style jsx>{`
        .input {
          width: 100%;
          background: rgb(30 41 59);
          border: 1px solid rgb(51 65 85);
          border-radius: 4px;
          padding: 8px 10px;
          color: rgb(226 232 240);
          /* 16px en mobile evita zoom-in iOS Safari; 11px en sm+ preserva
             la densidad informacional del portal. */
          font-size: 16px;
        }
        @media (min-width: 640px) {
          .input { font-size: 11px; padding: 6px 8px; }
        }
        .input:focus {
          outline: none;
          border-color: rgb(59 130 246);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold text-wr-muted uppercase tracking-wider mb-1">{label}</span>
      {children}
    </label>
  );
}
