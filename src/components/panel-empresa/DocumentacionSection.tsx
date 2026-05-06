"use client";

import { useEffect, useState } from "react";
import { SectionLabel } from "./primitives";
import { OneDriveLogo, NotionLogo, toNotionDesktopUrl } from "./logos";
import type { DocsState } from "./types";

// Links externos a OneDrive y Notion por target. Útil a partir de "1ª reunión"
// (cuando se crea carpeta de trabajo). Soporta:
//   - Edición manual de URLs y nombre comercial (alias usado en OneDrive/Notion
//     cuando difiere del nombre legal). El alias se usa internamente por el
//     matcher pero NO se muestra en la UI normal.
//   - Búsqueda automática (botón "🔍 Buscar") vía /api/empresas/[id]/links/sync.
export function DocumentacionSection({
  empresaId,
  initial,
  onSaved,
}: {
  empresaId: number;
  initial: DocsState;
  onSaved: (next: DocsState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [oneDriveUrl, setOneDriveUrl] = useState(initial.oneDriveUrl ?? "");
  const [notionUrl, setNotionUrl] = useState(initial.notionUrl ?? "");
  const [nombreComercial, setNombreComercial] = useState(initial.nombreComercial ?? "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset si cambia la empresa cargada (initial cambia)
  useEffect(() => {
    setOneDriveUrl(initial.oneDriveUrl ?? "");
    setNotionUrl(initial.notionUrl ?? "");
    setNombreComercial(initial.nombreComercial ?? "");
    setEditing(false);
    setError(null);
  }, [empresaId, initial.oneDriveUrl, initial.notionUrl, initial.nombreComercial]);

  const hasAny = !!initial.oneDriveUrl || !!initial.notionUrl;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/links`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oneDriveUrl: oneDriveUrl.trim(),
          notionUrl: notionUrl.trim(),
          nombreComercial: nombreComercial.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      const json = (await res.json()) as DocsState;
      onSaved(json);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  async function autoSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/links/sync`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 501) {
        setError(j.reason ?? "Búsqueda automática pendiente de configurar");
      } else if (!res.ok) {
        setError(j.error ?? `Error ${res.status}`);
      } else {
        // Cuando esté implementado, devolverá los nuevos campos
        onSaved(j as DocsState);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error en búsqueda automática");
    } finally {
      setSyncing(false);
    }
  }

  async function createDocs() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/links/create`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      // Endpoint devuelve { ok, folder, page, empresa: { oneDriveUrl, notionUrl } }
      onSaved({
        oneDriveUrl: j.empresa.oneDriveUrl,
        notionUrl: j.empresa.notionUrl,
        nombreComercial: initial.nombreComercial,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando docs");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>Documentación</SectionLabel>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] text-wr-hint hover:text-wr-text underline-offset-2 hover:underline"
          >
            {hasAny ? "Editar" : "Añadir links"}
          </button>
        )}
      </div>

      {!editing && (
        <div className="space-y-1.5">
          {initial.oneDriveUrl ? (
            <a
              href={initial.oneDriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-1.5 bg-wr-surface2 border border-wr-border rounded text-xs text-wr-text hover:border-wr-blue/50 hover:bg-wr-blue/5 transition-colors"
            >
              <OneDriveLogo />
              <span className="flex-1 truncate">OneDrive</span>
              <span className="text-wr-hint text-[10px]">↗</span>
            </a>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-wr-border rounded text-[10px] text-wr-hint italic">
              <OneDriveLogo className="w-4 h-4 opacity-50" /> OneDrive — sin link
            </div>
          )}
          {initial.notionUrl ? (
            <a
              href={toNotionDesktopUrl(initial.notionUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-1.5 bg-wr-surface2 border border-wr-border rounded text-xs text-wr-text hover:border-wr-blue/50 hover:bg-wr-blue/5 transition-colors"
              title="Abre en la app de Notion si está instalada"
            >
              <NotionLogo />
              <span className="flex-1 truncate">Notion</span>
              <span className="text-wr-hint text-[10px]">↗</span>
            </a>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-wr-border rounded text-[10px] text-wr-hint italic">
              <NotionLogo className="w-4 h-4 opacity-50" /> Notion — sin link
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-wr-hint mb-0.5 flex items-center gap-1.5">
              <OneDriveLogo className="w-3.5 h-3.5" /> OneDrive URL
            </label>
            <input
              type="url"
              value={oneDriveUrl}
              onChange={(e) => setOneDriveUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1 text-xs text-wr-text focus:outline-none focus:border-wr-blue"
            />
          </div>
          <div>
            <label className="text-[10px] text-wr-hint mb-0.5 flex items-center gap-1.5">
              <NotionLogo className="w-3.5 h-3.5" /> Notion URL
            </label>
            <input
              type="url"
              value={notionUrl}
              onChange={(e) => setNotionUrl(e.target.value)}
              placeholder="https://www.notion.so/..."
              className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1 text-xs text-wr-text focus:outline-none focus:border-wr-blue"
            />
          </div>
          <div>
            <label className="text-[10px] text-wr-hint block mb-0.5">
              Nombre comercial (alias)
            </label>
            <input
              type="text"
              value={nombreComercial}
              onChange={(e) => setNombreComercial(e.target.value)}
              placeholder="Solo si difiere del nombre legal (e.g. FireProtect)"
              className="w-full bg-wr-surface2 border border-wr-border rounded px-2 py-1 text-xs text-wr-text focus:outline-none focus:border-wr-blue"
            />
          </div>
          {error && (
            <div className="text-[10px] text-wr-amber bg-wr-amber/10 border border-wr-amber/20 rounded px-2 py-1">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              onClick={save}
              disabled={saving || creating}
              className="text-[11px] bg-wr-green/15 text-wr-green border border-wr-green/30 rounded px-2.5 py-1 hover:bg-wr-green/25 disabled:opacity-40 transition-colors"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={() => {
                setOneDriveUrl(initial.oneDriveUrl ?? "");
                setNotionUrl(initial.notionUrl ?? "");
                setNombreComercial(initial.nombreComercial ?? "");
                setEditing(false);
                setError(null);
              }}
              disabled={saving || creating}
              className="text-[11px] text-wr-hint hover:text-wr-text"
            >
              Cancelar
            </button>
            <div className="flex-1" />
            {!initial.oneDriveUrl && !initial.notionUrl && (
              <button
                onClick={createDocs}
                disabled={creating || saving || syncing}
                title="Crear carpeta OneDrive (con subcarpetas Analyses, NDA, IRL) y página Notion automáticamente"
                className="text-[11px] bg-wr-amber/15 text-wr-amber border border-wr-amber/30 rounded px-2.5 py-1 hover:bg-wr-amber/25 disabled:opacity-40 transition-colors"
              >
                {creating ? "Creando…" : "✨ Crear carpeta y página"}
              </button>
            )}
            <button
              onClick={autoSync}
              disabled={syncing || creating}
              title="Buscar carpeta y página automáticamente vía Microsoft Graph + Notion"
              className="text-[11px] bg-wr-blue/15 text-wr-blue border border-wr-blue/30 rounded px-2.5 py-1 hover:bg-wr-blue/25 disabled:opacity-40 transition-colors"
            >
              {syncing ? "Buscando…" : "🔍 Buscar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
