"use client";

import { useCallback, useEffect, useState } from "react";

type Contacto = {
  id: number;
  empresaId: number;
  nombre: string;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
};

type DraftContacto = {
  nombre: string;
  cargo: string;
  email: string;
  telefono: string;
  notas: string;
};

const EMPTY_DRAFT: DraftContacto = {
  nombre: "",
  cargo: "",
  email: "",
  telefono: "",
  notas: "",
};

async function extractError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.issues?.length) {
      return j.issues
        .map((i: { path?: string; message: string }) =>
          i.path ? `${i.path}: ${i.message}` : i.message
        )
        .join("; ");
    }
    if (j?.error) return String(j.error);
  } catch {
    /* not JSON */
  }
  return `Error ${res.status}`;
}

/**
 * Sección de contactos M&A de la empresa. Diferente a `PersonaCargo` (que es
 * BORME — administradores legales). Aquí guardamos el director general,
 * responsable de compras, etc., con su email para que el matcher del shared
 * inbox `warroom@fontiber.com` pueda crear tareas automáticamente al mandar
 * email a alguno de ellos.
 *
 * Patrón colapsable como CrmSections (default cerrado).
 */
export function ContactosSection({ empresaId }: { empresaId: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Contacto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DraftContacto>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<DraftContacto>(EMPTY_DRAFT);
  const [savingId, setSavingId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/contactos`);
      if (!res.ok) throw new Error(await extractError(res));
      setItems((await res.json()) as Contacto[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando contactos");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  // Carga lazy: solo fetcha cuando el usuario despliega la sección. Mantiene
  // el panel ligero al abrir un target nuevo (la ficha ya hace fetch del
  // detalle; esto evita un fetch extra silencioso).
  useEffect(() => {
    if (open && items === null && !loading) {
      void reload();
    }
  }, [open, items, loading, reload]);

  // Reset cuando cambia la empresa: limpia items y formularios para evitar
  // mezclar contactos de otra ficha.
  useEffect(() => {
    setItems(null);
    setCreating(false);
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setError(null);
  }, [empresaId]);

  async function crear() {
    if (!draft.nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/contactos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: draft.nombre.trim(),
          cargo: draft.cargo.trim() || null,
          email: draft.email.trim() || null,
          telefono: draft.telefono.trim() || null,
          notas: draft.notas.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      const nuevo = (await res.json()) as Contacto;
      setItems((prev) =>
        prev ? [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)) : [nuevo]
      );
      setDraft(EMPTY_DRAFT);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando contacto");
    }
  }

  function startEdit(c: Contacto) {
    setEditingId(c.id);
    setEditDraft({
      nombre: c.nombre,
      cargo: c.cargo ?? "",
      email: c.email ?? "",
      telefono: c.telefono ?? "",
      notas: c.notas ?? "",
    });
  }

  async function guardarEdit(id: number) {
    setError(null);
    setSavingId(id);
    try {
      const res = await fetch(`/api/contactos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: editDraft.nombre.trim(),
          cargo: editDraft.cargo.trim() || null,
          email: editDraft.email.trim() || null,
          telefono: editDraft.telefono.trim() || null,
          notas: editDraft.notas.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      const next = (await res.json()) as Contacto;
      setItems((prev) =>
        prev
          ? prev.map((c) => (c.id === id ? next : c)).sort((a, b) => a.nombre.localeCompare(b.nombre))
          : [next]
      );
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSavingId(null);
    }
  }

  async function borrar(id: number) {
    if (!confirm("¿Eliminar este contacto?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/contactos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await extractError(res));
      setItems((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error borrando");
    }
  }

  const count = items?.length ?? 0;

  return (
    <div className="rounded-lg border border-wr-border bg-wr-surface2/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <p className="text-[9px] font-semibold text-wr-muted uppercase tracking-widest">
          Contactos {count > 0 && <span className="text-wr-text">({count})</span>}
        </p>
        <span className="text-base text-wr-muted leading-none">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {loading && (
            <p className="text-[10px] text-wr-hint italic">Cargando…</p>
          )}

          {error && (
            <div className="text-[10px] text-wr-amber bg-wr-amber/10 border border-wr-amber/20 rounded px-2 py-1">
              {error}
            </div>
          )}

          {items && items.length === 0 && !creating && (
            <p className="text-[10px] text-wr-hint italic">
              Sin contactos. Añade uno cuando hables con alguien de la empresa.
            </p>
          )}

          {items?.map((c) =>
            editingId === c.id ? (
              <ContactoEditor
                key={c.id}
                draft={editDraft}
                setDraft={setEditDraft}
                onSave={() => guardarEdit(c.id)}
                onCancel={() => setEditingId(null)}
                saving={savingId === c.id}
              />
            ) : (
              <ContactoCard
                key={c.id}
                contacto={c}
                onEdit={() => startEdit(c)}
                onDelete={() => borrar(c.id)}
              />
            )
          )}

          {creating ? (
            <ContactoEditor
              draft={draft}
              setDraft={setDraft}
              onSave={crear}
              onCancel={() => {
                setCreating(false);
                setDraft(EMPTY_DRAFT);
                setError(null);
              }}
              saving={false}
            />
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full text-[11px] bg-wr-blue/10 text-wr-blue border border-wr-blue/30 rounded px-2.5 py-1.5 hover:bg-wr-blue/20 transition-colors"
            >
              + Añadir contacto
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ContactoCard({
  contacto: c,
  onEdit,
  onDelete,
}: {
  contacto: Contacto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded border border-wr-border bg-wr-surface px-2.5 py-2 group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-wr-text truncate">
            {c.nombre}
            {c.cargo && (
              <span className="text-wr-hint font-normal"> · {c.cargo}</span>
            )}
          </p>
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className="text-[10px] text-wr-blue hover:underline block truncate"
              title={c.email}
            >
              {c.email}
            </a>
          )}
          {c.telefono && (
            <a
              href={`tel:${c.telefono}`}
              className="text-[10px] text-wr-muted hover:text-wr-text block"
            >
              {c.telefono}
            </a>
          )}
          {c.notas && (
            <p className="text-[10px] text-wr-hint mt-1 leading-snug whitespace-pre-wrap">
              {c.notas}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            title="Editar"
            className="text-[10px] text-wr-hint hover:text-wr-text px-1"
          >
            ✎
          </button>
          <button
            onClick={onDelete}
            title="Eliminar"
            className="text-[10px] text-wr-hint hover:text-wr-red px-1"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactoEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  draft: DraftContacto;
  setDraft: React.Dispatch<React.SetStateAction<DraftContacto>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const inputClass =
    "w-full bg-wr-surface border border-wr-border rounded px-2 py-1 text-xs text-wr-text focus:outline-none focus:border-wr-blue";
  return (
    <div className="rounded border border-wr-blue/30 bg-wr-blue/5 p-2 space-y-1.5">
      <input
        type="text"
        value={draft.nombre}
        onChange={(e) => setDraft((d) => ({ ...d, nombre: e.target.value }))}
        placeholder="Nombre completo *"
        className={inputClass}
        autoFocus
      />
      <input
        type="text"
        value={draft.cargo}
        onChange={(e) => setDraft((d) => ({ ...d, cargo: e.target.value }))}
        placeholder="Cargo (e.g. Director General)"
        className={inputClass}
      />
      <input
        type="email"
        value={draft.email}
        onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
        placeholder="email@empresa.com"
        className={inputClass}
      />
      <input
        type="tel"
        value={draft.telefono}
        onChange={(e) => setDraft((d) => ({ ...d, telefono: e.target.value }))}
        placeholder="Teléfono"
        className={inputClass}
      />
      <textarea
        value={draft.notas}
        onChange={(e) => setDraft((d) => ({ ...d, notas: e.target.value }))}
        placeholder="Notas (opcional)"
        rows={2}
        className={`${inputClass} resize-y`}
      />
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving || !draft.nombre.trim()}
          className="text-[11px] bg-wr-green/15 text-wr-green border border-wr-green/30 rounded px-2.5 py-1 hover:bg-wr-green/25 disabled:opacity-40 transition-colors"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-[11px] text-wr-hint hover:text-wr-text"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
