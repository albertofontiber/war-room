"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import type { Vista } from "@/types";

export default function Navbar() {
  const {
    vistaActual, setVista, modoPresentacion, toggleModoPresentacion,
    sizeMetric, setSizeMetric, setSearchQuery,
    empresasGeoJSON, seleccionarEmpresa, setFlyToEmpresaId,
  } = useWarRoomStore();
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const onPipelinePage = pathname === "/pipeline";

  // Cambio de vista homogéneo: si estamos en /pipeline, navega a "/" y setea la vista
  // del War Room; si estamos en "/", cambia la vista sin navegar.
  const goToVista = useCallback((v: Vista) => {
    if (onPipelinePage) {
      setVista(v);
      router.push("/");
    } else {
      setVista(v);
    }
  }, [onPipelinePage, router, setVista]);

  const [inputValue, setInputValue] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce: update store search after 200ms
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(inputValue), 200);
    return () => clearTimeout(t);
  }, [inputValue, setSearchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) &&
          !inputRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filtered results for dropdown (max 8)
  const results = useMemo(() => {
    if (!inputValue.trim() || !empresasGeoJSON) return [];
    const q = inputValue.toLowerCase();
    return empresasGeoJSON
      .filter((f) => {
        const nombre = ((f.properties.nombre as string) ?? "").toLowerCase();
        const cif = ((f.properties.cif as string) ?? "").toLowerCase();
        return nombre.includes(q) || cif.includes(q);
      })
      .slice(0, 8)
      .map((f) => ({
        id: f.properties.id as number,
        nombre: f.properties.nombre as string,
        provincia: f.properties.provincia as string,
        cif: f.properties.cif as string | null,
      }));
  }, [inputValue, empresasGeoJSON]);

  const handleSelect = useCallback((id: number) => {
    seleccionarEmpresa(id);
    setFlyToEmpresaId(id);
    setDropdownOpen(false);
    setInputValue("");
    setSearchQuery("");
  }, [seleccionarEmpresa, setFlyToEmpresaId, setSearchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!dropdownOpen || results.length === 0) {
      if (e.key === "Escape") { setInputValue(""); setSearchQuery(""); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIdx].id);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
      setInputValue("");
      setSearchQuery("");
    }
  };

  const initials = session?.user?.name
    ? session.user.name.slice(0, 2).toUpperCase()
    : "??";

  return (
    <header className="h-11 flex-shrink-0 flex items-center px-4 gap-3 border-b border-wr-border bg-wr-surface">
      {/* Wordmark */}
      <div className="flex items-center gap-2 mr-2">
        <span className="text-xs font-semibold tracking-[0.15em] text-wr-blue uppercase bg-wr-blue/10 border border-wr-blue/20 px-2.5 py-1 rounded-md">
          Fontiber War Room
        </span>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-lg relative">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-wr-hint" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setDropdownOpen(true); setSelectedIdx(-1); }}
            onFocus={() => inputValue.trim() && setDropdownOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar empresa o CIF…"
            className="w-full bg-wr-surface2 border border-wr-border rounded-md pl-8 pr-8 py-1.5 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue transition-colors"
          />
          {inputValue && (
            <button
              onClick={() => { setInputValue(""); setSearchQuery(""); setDropdownOpen(false); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-wr-hint hover:text-wr-muted"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {dropdownOpen && results.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 bg-wr-surface border border-wr-border rounded-lg shadow-xl z-50 overflow-hidden"
          >
            {results.map((r, i) => (
              <button
                key={r.id}
                onClick={() => handleSelect(r.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  i === selectedIdx ? "bg-wr-blue/15 text-wr-text" : "text-wr-muted hover:bg-wr-surface2 hover:text-wr-text"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-wr-text">{r.nombre}</p>
                  <p className="text-[10px] text-wr-hint">{r.provincia}{r.cif ? ` · ${r.cif}` : ""}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Modo presentación */}
      {modoPresentacion && (
        <span className="text-xs font-semibold tracking-widest text-wr-amber border border-wr-amber/30 bg-wr-amber/10 px-2.5 py-1 rounded-md uppercase">
          Modo Presentación
        </span>
      )}

      {/* Toggle Mapa / Tabla / Operaciones / Grupos / Pipeline */}
      <div className="flex items-center bg-wr-surface2 border border-wr-border rounded-md p-0.5">
        <button
          onClick={() => goToVista("mapa")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            !onPipelinePage && vistaActual === "mapa"
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Mapa
        </button>
        <button
          onClick={() => goToVista("tabla")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            !onPipelinePage && vistaActual === "tabla"
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Tabla
        </button>
        <button
          onClick={() => goToVista("operaciones")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            !onPipelinePage && vistaActual === "operaciones"
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Operaciones
        </button>
        <button
          onClick={() => goToVista("grupos")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            !onPipelinePage && vistaActual === "grupos"
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Grupos
        </button>
        <button
          onClick={() => router.push("/pipeline")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            onPipelinePage
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Pipeline
        </button>
      </div>

      {/* Toggle métrica tamaño */}
      <div className="flex items-center bg-wr-surface2 border border-wr-border rounded-md p-0.5">
        <button
          onClick={() => setSizeMetric("ingresos")}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            sizeMetric === "ingresos"
              ? "bg-wr-surface text-wr-text"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Ingresos
        </button>
        <button
          onClick={() => setSizeMetric("ebitda")}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            sizeMetric === "ebitda"
              ? "bg-wr-surface text-wr-text"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          EBITDA
        </button>
      </div>

      {/* Toggle modo presentación */}
      <button
        onClick={toggleModoPresentacion}
        title={modoPresentacion ? "Desactivar modo presentación" : "Modo presentación"}
        className={`p-1.5 rounded-md transition-colors border ${
          modoPresentacion
            ? "border-wr-amber/40 text-wr-amber bg-wr-amber/10"
            : "border-wr-border text-wr-muted hover:text-wr-text hover:border-wr-muted"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </button>


      {/* Avatar usuario */}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        title={`${session?.user?.name} — Cerrar sesión`}
        className="w-7 h-7 rounded-full bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-xs font-semibold flex items-center justify-center hover:bg-wr-blue/30 transition-colors"
      >
        {initials}
      </button>
    </header>
  );
}
