"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import LinkLeadModal from "@/components/LinkLeadModal";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import type { EmpresaDetalle } from "@/types";

/**
 * Bloque GESTIÓN: toggle perímetro, grupo editable con autocomplete,
 * y vinculación de lead anónimo a empresa real.
 */
export function GestionBlock({
  empresa,
  setEmpresa,
  toggling,
  togglePerimetro,
  onEmpresaChanged,
}: {
  empresa: EmpresaDetalle;
  setEmpresa: React.Dispatch<React.SetStateAction<EmpresaDetalle | null>>;
  toggling: boolean;
  togglePerimetro: () => void | Promise<void>;
  onEmpresaChanged?: () => void;
}) {
  const { updateEmpresaInGeoJSON, seleccionarEmpresa } = useWarRoomStore();
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState(false);
  const [grupoInput, setGrupoInput] = useState("");
  const [savingGrupo, setSavingGrupo] = useState(false);
  const [grupoDropdownOpen, setGrupoDropdownOpen] = useState(false);
  const [allGrupos, setAllGrupos] = useState<{ id: number; nombre: string }[]>([]);
  const grupoInputRef = useRef<HTMLInputElement>(null);
  const grupoWrapperRef = useRef<HTMLDivElement>(null);

  // Fetch all grupos once on mount
  useEffect(() => {
    fetch("/api/grupos")
      .then((r) => r.json())
      .then(setAllGrupos)
      .catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    if (!grupoInput.trim()) return allGrupos.slice(0, 8);
    const q = grupoInput.toLowerCase();
    return allGrupos.filter((g) => g.nombre.toLowerCase().includes(q)).slice(0, 8);
  }, [grupoInput, allGrupos]);

  const hasExactMatch = useMemo(
    () => allGrupos.some((g) => g.nombre.toLowerCase() === grupoInput.trim().toLowerCase()),
    [grupoInput, allGrupos]
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!grupoDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (grupoWrapperRef.current && !grupoWrapperRef.current.contains(e.target as Node)) {
        setGrupoDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [grupoDropdownOpen]);

  const startEditGrupo = useCallback(() => {
    setGrupoInput(empresa.grupo?.nombre ?? "");
    setEditingGrupo(true);
    setGrupoDropdownOpen(true);
    setTimeout(() => { grupoInputRef.current?.select(); }, 50);
  }, [empresa]);

  const selectGrupo = useCallback((nombre: string) => {
    setGrupoInput(nombre);
    setGrupoDropdownOpen(false);
    setSavingGrupo(true);
    fetch(`/api/empresas/${empresa.id}/grupo`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grupoNombre: nombre }),
    })
      .then((r) => r.json())
      .then((data) => {
        setEmpresa((prev) => prev ? { ...prev, grupo: data.grupo } : prev);
        updateEmpresaInGeoJSON(empresa.id, {
          grupoId: data.grupo?.id ?? null,
          grupoNombre: data.grupo?.nombre ?? null,
        });
      })
      .finally(() => { setSavingGrupo(false); setEditingGrupo(false); });
  }, [empresa, setEmpresa, updateEmpresaInGeoJSON]);

  const saveGrupo = useCallback(async () => {
    if (savingGrupo || grupoDropdownOpen) return;
    setSavingGrupo(true);
    try {
      const res = await fetch(`/api/empresas/${empresa.id}/grupo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupoNombre: grupoInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setEmpresa((prev) => prev ? { ...prev, grupo: data.grupo } : prev);
        updateEmpresaInGeoJSON(empresa.id, {
          grupoId: data.grupo?.id ?? null,
          grupoNombre: data.grupo?.nombre ?? null,
        });
        if (data.grupo) {
          setAllGrupos((prev) =>
            prev.some((g) => g.id === data.grupo.id)
              ? prev
              : [...prev, data.grupo].sort((a, b) => a.nombre.localeCompare(b.nombre))
          );
        }
      }
    } finally {
      setSavingGrupo(false);
      setEditingGrupo(false);
    }
  }, [empresa, grupoInput, savingGrupo, grupoDropdownOpen, setEmpresa, updateEmpresaInGeoJSON]);

  return (
    <>
      <div className="rounded-lg border border-wr-amber/20 bg-wr-amber/5">
        <p className="text-[9px] font-semibold text-wr-amber/70 uppercase tracking-widest px-3 pt-2 pb-1">
          Gestión
        </p>

        {/* Toggle perímetro */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-wr-amber/10">
          <div>
            <p className="text-xs font-medium text-wr-text">En perímetro</p>
            <p className="text-[10px] text-wr-hint">
              {empresa.enPerimetro ? "Incluida en análisis" : "Excluida del análisis"}
            </p>
          </div>
          <Switch
            checked={empresa.enPerimetro}
            onCheckedChange={togglePerimetro}
            disabled={toggling}
          />
        </div>

        {/* Grupo editable con autocomplete */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-wr-amber/10">
          <span className="text-xs text-wr-hint flex-shrink-0">Grupo</span>
          <div ref={grupoWrapperRef} className="relative ml-2 flex-1 flex justify-end">
            {editingGrupo ? (
              <>
                <input
                  ref={grupoInputRef}
                  value={grupoInput}
                  onChange={(e) => { setGrupoInput(e.target.value); setGrupoDropdownOpen(true); }}
                  onFocus={() => setGrupoDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { setGrupoDropdownOpen(false); saveGrupo(); }
                    if (e.key === "Escape") { setGrupoDropdownOpen(false); setEditingGrupo(false); }
                  }}
                  onBlur={() => { setTimeout(() => { setGrupoDropdownOpen(false); saveGrupo(); }, 150); }}
                  placeholder="Sin grupo"
                  className="text-xs bg-wr-surface border border-wr-amber/40 rounded px-1.5 py-0.5 text-wr-text w-36 focus:outline-none focus:border-wr-amber"
                />
                {savingGrupo && (
                  <div className="absolute right-1 top-1 w-3 h-3 border border-wr-amber border-t-transparent rounded-full animate-spin" />
                )}
                {/* Dropdown */}
                {grupoDropdownOpen && (suggestions.length > 0 || grupoInput.trim()) && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a2035] border border-wr-border rounded-lg shadow-xl z-50 overflow-hidden">
                    {suggestions.map((g) => (
                      <button
                        key={g.id}
                        onMouseDown={(e) => { e.preventDefault(); selectGrupo(g.nombre); }}
                        className="w-full text-left px-3 py-1.5 text-xs text-wr-text hover:bg-wr-amber/10 hover:text-wr-amber transition-colors flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-wr-amber/50 flex-shrink-0" />
                        {g.nombre}
                      </button>
                    ))}
                    {grupoInput.trim() && !hasExactMatch && (
                      <button
                        onMouseDown={(e) => { e.preventDefault(); selectGrupo(grupoInput.trim()); }}
                        className="w-full text-left px-3 py-1.5 text-xs text-wr-muted hover:bg-wr-surface2 transition-colors border-t border-wr-border flex items-center gap-2"
                      >
                        <span className="text-wr-blue">+</span>
                        Crear: <span className="text-wr-text font-medium">{grupoInput.trim()}</span>
                      </button>
                    )}
                    {grupoInput.trim() && (
                      <button
                        onMouseDown={(e) => { e.preventDefault(); selectGrupo(""); }}
                        className="w-full text-left px-3 py-1.5 text-xs text-wr-red/70 hover:bg-wr-red/10 transition-colors border-t border-wr-border"
                      >
                        Quitar grupo
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={startEditGrupo}
                className="text-xs text-wr-text hover:text-wr-amber transition-colors flex items-center gap-1 group"
              >
                {empresa.grupo ? (
                  <span>{empresa.grupo.nombre}</span>
                ) : (
                  <span className="text-wr-hint italic">Sin grupo</span>
                )}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Vincular lead anónimo a empresa real */}
        {empresa.esAnonima && (
          <div className="px-3 pb-2 pt-1 border-t border-wr-amber/10">
            <button
              onClick={() => setLinkModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 text-xs bg-wr-blue/10 text-wr-blue border border-wr-blue/30 rounded-md px-3 py-1.5 hover:bg-wr-blue/20 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
              Vincular a empresa real
            </button>
            <p className="text-[9px] text-wr-hint text-center mt-1">
              Mueve el CRM a una empresa de la BD y elimina este lead.
            </p>
          </div>
        )}
      </div>

      {empresa.esAnonima && (
        <LinkLeadModal
          open={linkModalOpen}
          leadId={empresa.id}
          leadNombre={empresa.nombre}
          onClose={() => setLinkModalOpen(false)}
          onLinked={(targetId) => {
            onEmpresaChanged?.();
            seleccionarEmpresa(targetId);
          }}
        />
      )}
    </>
  );
}
