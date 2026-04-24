"use client";

import { useEffect, useState } from "react";
import { DEAL_STAGES, DEAL_STAGE_LABEL } from "@/lib/crm";
import type { DealStage } from "@/types";

type User = { id: string; name: string; email: string };
type Finder = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (empresaId: number) => void;
  ccaaOptions: string[];
  provinciaOptions: string[];
};

const SECTORES = [
  { value: "PCI", label: "PCI" },
  { value: "seguridad_electronica", label: "Seg. electrónica" },
  { value: "mixto", label: "Mixto" },
];

export default function AddLeadModal({ open, onClose, onCreated, ccaaOptions, provinciaOptions }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [finders, setFinders] = useState<Finder[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [nombre, setNombre] = useState("");
  const [sector, setSector] = useState<string>("");
  const [provincia, setProvincia] = useState("");
  const [ccaa, setCcaa] = useState("");
  const [dealStage, setDealStage] = useState<DealStage>("contactado");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [finderId, setFinderId] = useState("");
  const [anioFin, setAnioFin] = useState<string>(String(new Date().getFullYear() - 1));
  const [ingresos, setIngresos] = useState("");
  const [margenBruto, setMargenBruto] = useState("");
  const [ebitda, setEbitda] = useState("");
  const [empleados, setEmpleados] = useState("");
  const [descripcion, setDescripcion] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/users").then((r) => r.json()).then(setUsers).catch(console.error);
    fetch("/api/finders").then((r) => r.json()).then(setFinders).catch(console.error);
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (open) return;
    setNombre(""); setSector(""); setProvincia(""); setCcaa("");
    setDealStage("contactado"); setOwnerUserId(""); setFinderId("");
    setIngresos(""); setMargenBruto(""); setEbitda(""); setEmpleados("");
    setDescripcion(""); setError(null);
  }, [open]);

  if (!open) return null;

  const toNumber = (v: string): number | null =>
    v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", "."));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) { setError("El alias es obligatorio."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          sector: sector || null,
          provincia: provincia.trim() || null,
          ccaa: ccaa.trim() || null,
          dealStage,
          ownerUserId: ownerUserId || null,
          finderId: finderId || null,
          anioFinanciero: anioFin ? Number(anioFin) : null,
          ingresos: toNumber(ingresos),
          margenBruto: toNumber(margenBruto),
          ebitda: toNumber(ebitda),
          empleados: empleados ? Number(empleados) : null,
          descripcion: descripcion.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.issues
          ? json.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ")
          : json.error || "Error";
        setError(msg);
        return;
      }
      onCreated(json.empresaId);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[92vw] max-h-[90vh] overflow-auto bg-wr-surface border border-wr-border rounded-lg shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-wr-border">
          <div>
            <h2 className="text-sm font-semibold text-wr-text">Añadir lead sin identificar</h2>
            <p className="text-[10px] text-wr-hint mt-0.5">Para targets confidenciales cuya identidad aún no se ha desvelado.</p>
          </div>
          <button onClick={onClose} className="text-wr-muted hover:text-wr-text text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
          <Field label="Alias (obligatorio)">
            <input
              value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
              placeholder="Ej. Asher"
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sector">
              <select value={sector} onChange={(e) => setSector(e.target.value)} className="input">
                <option value="">—</option>
                {SECTORES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Stage inicial">
              <select
                value={dealStage}
                onChange={(e) => setDealStage(e.target.value as DealStage)}
                className="input"
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>{DEAL_STAGE_LABEL[s]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Provincia">
              <select value={provincia} onChange={(e) => setProvincia(e.target.value)} className="input">
                <option value="">—</option>
                {provinciaOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="CCAA">
              <select value={ccaa} onChange={(e) => setCcaa(e.target.value)} className="input">
                <option value="">—</option>
                {ccaaOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner">
              <select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} className="input">
                <option value="">Yo</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Finder">
              <select value={finderId} onChange={(e) => setFinderId(e.target.value)} className="input">
                <option value="">—</option>
                {finders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="border-t border-wr-border pt-3 space-y-3">
            <p className="text-[10px] font-semibold text-wr-muted uppercase tracking-wider">Financieros (opcional)</p>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Año">
                <input type="number" value={anioFin} onChange={(e) => setAnioFin(e.target.value)} className="input" />
              </Field>
              <Field label="Empleados">
                <input type="number" value={empleados} onChange={(e) => setEmpleados(e.target.value)} className="input" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Ingresos (€)">
                <input value={ingresos} onChange={(e) => setIngresos(e.target.value)} className="input" placeholder="1500000" />
              </Field>
              <Field label="Margen bruto (€)">
                <input value={margenBruto} onChange={(e) => setMargenBruto(e.target.value)} className="input" />
              </Field>
              <Field label="EBITDA (€)">
                <input value={ebitda} onChange={(e) => setEbitda(e.target.value)} className="input" />
              </Field>
            </div>
          </div>

          <Field label="Notas internas (opcional)">
            <textarea
              value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className="input resize-none"
              placeholder="Contexto del target, pista sobre la identidad, etc."
            />
          </Field>

          {error && <p className="text-wr-red text-[11px]">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-wr-border">
            <button
              type="button" onClick={onClose} disabled={submitting}
              className="text-xs px-3 py-1.5 bg-wr-surface2 border border-wr-border rounded text-wr-muted hover:text-wr-text"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={submitting || !nombre.trim()}
              className="text-xs px-3 py-1.5 bg-wr-blue text-white rounded hover:bg-wr-blue-light disabled:opacity-40"
            >
              {submitting ? "Creando…" : "Crear lead"}
            </button>
          </div>
        </form>

        <style jsx>{`
          .input {
            width: 100%;
            background: var(--wr-surface2, rgb(30 41 59));
            border: 1px solid var(--wr-border, rgb(51 65 85));
            border-radius: 4px;
            padding: 6px 8px;
            color: var(--wr-text, rgb(226 232 240));
            font-size: 11px;
          }
          .input:focus {
            outline: none;
            border-color: var(--wr-blue, rgb(59 130 246));
          }
        `}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // flex-col + justify-end alinea los inputs al fondo cuando los labels ocupan
  // distintas alturas (e.g. "MARGEN BRUTO (€)" wrapping en varias líneas).
  return (
    <label className="flex flex-col h-full justify-end">
      <span className="block text-[10px] font-semibold text-wr-muted uppercase tracking-wider mb-1">{label}</span>
      {children}
    </label>
  );
}
