"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useWarRoomStore } from "@/store/useWarRoomStore";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useNavegacion } from "@/lib/navegacion";
import { hrefVista } from "@/lib/navegacion-url";
import { useIsDesktop } from "@/lib/breakpoints";
import type { Vista } from "@/types";
import NotificationsBell from "@/components/NotificationsBell";

export default function Navbar() {
  const {
    modoPresentacion, toggleModoPresentacion,
    setSearchQuery,
    empresasGeoJSON, hydrateEmpresas, setFlyToEmpresaId,
    toggleSidebarMobile,
    setFiltersMobileOpen,
    getFiltrosActivos,
  } = useWarRoomStore();
  const { vista, setVista, seleccionarEmpresa } = useNavegacion();
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const onPipelinePage = pathname === "/pipeline";

  // Único owner del fetch de /api/empresas. Sidebar y MapaEspana antes hacían
  // su propio fetch como fallback, pero los 3 efectos arrancaban en el mismo
  // tick y la guarda `if (geoJSON)` no detenía las réplicas (race detectado en
  // audit perf 2026-05-01). hydrateEmpresas() es idempotente y race-safe.
  useEffect(() => {
    void hydrateEmpresas();
  }, [hydrateEmpresas]);

  // Cambio de vista homogéneo: si estamos en /pipeline, navega directamente a la
  // URL de la vista; si estamos en "/", cambia la vista sin navegar. (Antes hacía
  // `setVista(v)` + `router.push("/")`: dos push seguidos, gana el segundo y la
  // vista se perdía — siempre se aterrizaba en el mapa.)
  const goToVista = useCallback((v: Vista) => {
    if (onPipelinePage) {
      router.push(hrefVista(v));
    } else {
      setVista(v);
    }
  }, [onPipelinePage, router, setVista]);

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const actionsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) actionsRef.current?.removeAttribute("open");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && actionsRef.current?.open) {
        actionsRef.current.removeAttribute("open");
        actionsRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

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

  // Menú del avatar: se cierra al pulsar fuera o con Escape.
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  const initials = session?.user?.name
    ? session.user.name.slice(0, 2).toUpperCase()
    : "??";
  const activeFilterCount = getFiltrosActivos().length;

  return (
    <header className="h-12 lg:h-11 flex-shrink-0 flex items-center px-3 lg:px-4 gap-2 lg:gap-3 border-b border-wr-border bg-wr-surface">
      {/* Hamburger (solo <lg): abre el drawer con navegación + filtros. */}
      <button
        onClick={toggleSidebarMobile}
        aria-label="Abrir menú"
        className="lg:hidden h-9 w-9 flex-shrink-0 flex items-center justify-center -ml-1 rounded-md text-wr-muted hover:bg-wr-surface2 hover:text-wr-text transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      {/* Wordmark — link al inicio (clear search params, vuelve al mapa).
          Versión completa en xl+, abreviada por debajo para priorizar la búsqueda. */}
      <Link
        href="/"
        title="Volver al inicio"
        className="flex shrink-0 items-center gap-2 mr-1 group"
      >
        <span className="hidden xl:inline text-xs font-semibold tracking-[0.15em] text-wr-blue uppercase bg-wr-blue/10 border border-wr-blue/20 px-2.5 py-1 rounded-md transition-colors group-hover:bg-wr-blue/20 group-hover:border-wr-blue/40">
          Fontiber War Room
        </span>
        <span className="xl:hidden h-8 flex items-center text-xs font-semibold tracking-[0.1em] text-wr-blue uppercase bg-wr-blue/10 border border-wr-blue/20 px-2 rounded-md transition-colors group-hover:bg-wr-blue/20 group-hover:border-wr-blue/40">
          WR
        </span>
      </Link>

      {/* Search: ocupa todo el espacio disponible hasta max-w-3xl. Sin separador
         flex-1 detrás (rompía el max-width al competir por el espacio); en su
         lugar, ml-auto en el primer elemento del cluster derecho. */}
      <div className="flex-1 min-w-0 lg:min-w-[240px] max-w-3xl relative">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-wr-hint" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            aria-label="Buscar empresa o CIF"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setDropdownOpen(true); setSelectedIdx(-1); }}
            onFocus={() => inputValue.trim() && setDropdownOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={isDesktop ? "Buscar empresa o CIF…" : "Buscar…"}
            className="w-full h-9 bg-wr-surface2 border border-wr-border rounded-md pl-8 pr-8 py-0 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue transition-colors"
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
            className="fixed top-12 left-3 right-3 lg:absolute lg:top-full lg:left-0 lg:right-auto lg:w-full lg:min-w-[320px] mt-1 bg-wr-surface border border-wr-border rounded-lg shadow-xl z-50 overflow-hidden"
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

      <button
        onClick={() => setFiltersMobileOpen(true)}
        aria-label={`Abrir filtros${activeFilterCount ? ` (${activeFilterCount} activos)` : ""}`}
        className={`lg:hidden h-9 w-9 flex-shrink-0 relative flex items-center justify-center rounded-md border transition-colors ${
          activeFilterCount
            ? "border-wr-blue/40 bg-wr-blue/15 text-wr-blue"
            : "border-wr-border text-wr-muted hover:text-wr-text hover:border-wr-muted"
        }`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        {activeFilterCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 h-4 rounded-full bg-wr-blue text-[9px] leading-4 text-white">
            {activeFilterCount > 9 ? "9+" : activeFilterCount}
          </span>
        )}
      </button>

      {/* Modo presentación */}
      {modoPresentacion && (
        <span className="hidden 2xl:inline ml-auto shrink-0 text-xs font-semibold tracking-widest text-wr-amber border border-wr-amber/30 bg-wr-amber/10 px-2.5 py-1 rounded-md uppercase">
          Modo Presentación
        </span>
      )}

      {/* Navegación Mapa / Tabla / Operaciones / Grupos / CRM.
          Solo visible en lg+: en mobile la navegación vive en el drawer.
          ml-auto empuja todo el cluster derecho hacia la derecha cuando no
          hay banner de Modo Presentación (que ya tiene su propio ml-auto). */}
      <div className={`${modoPresentacion ? "" : "ml-auto"} hidden lg:flex shrink-0 items-center bg-wr-surface2 border border-wr-border rounded-md p-0.5`}>
        <button
          onClick={() => goToVista("mapa")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            !onPipelinePage && vista === "mapa"
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Mapa
        </button>
        <button
          onClick={() => goToVista("tabla")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            !onPipelinePage && vista === "tabla"
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Tabla
        </button>
        <button
          onClick={() => goToVista("operaciones")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            !onPipelinePage && vista === "operaciones"
              ? "bg-wr-blue text-white"
              : "text-wr-muted hover:text-wr-text"
          }`}
        >
          Operaciones
        </button>
        <button
          onClick={() => goToVista("grupos")}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            !onPipelinePage && vista === "grupos"
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
          CRM
        </button>
      </div>

      <details ref={actionsRef} className="relative shrink-0">
        <summary aria-label={`Herramientas${unreadNotifications ? ` (${unreadNotifications} notificaciones sin leer)` : ""}`} title="Herramientas" className="relative h-9 w-9 max-lg:tap-target flex cursor-pointer list-none items-center justify-center rounded-md border border-wr-border text-wr-muted hover:text-wr-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wr-blue [&::-webkit-details-marker]:hidden">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          </svg>
          {unreadNotifications > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-wr-red border border-wr-surface" aria-hidden="true" />}
        </summary>
        <div className="absolute right-0 top-full mt-2 z-50 flex items-center gap-2 rounded-lg border border-wr-border bg-wr-surface p-2 shadow-xl" aria-label="Herramientas del War Room">
          {/* Toggle modo presentación */}
          <button
            onClick={toggleModoPresentacion}
            title={modoPresentacion ? "Desactivar modo presentación" : "Modo presentación"}
            aria-label={modoPresentacion ? "Desactivar modo presentación" : "Modo presentación"}
            aria-pressed={modoPresentacion}
            className={`h-9 w-9 max-lg:tap-target flex items-center justify-center rounded-md transition-colors border ${
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

          {/* Notificaciones */}
          <NotificationsBell compact inToolbarMenu onUnreadCountChange={setUnreadNotifications} />

          {/* Admin: gestión de finders */}
          <button
            onClick={() => router.push("/finders")}
            title="Gestión de finders"
            aria-label="Gestión de finders"
            className="h-9 w-9 max-lg:tap-target flex items-center justify-center rounded-md border border-wr-border text-wr-muted hover:text-wr-text hover:border-wr-muted transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>

          {/* Admin: usuarios del war room */}
          <button
            onClick={() => router.push("/usuarios")}
            title="Usuarios del war room"
            aria-label="Usuarios del war room"
            className="h-9 w-9 max-lg:tap-target flex items-center justify-center rounded-md border border-wr-border text-wr-muted hover:text-wr-text hover:border-wr-muted transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="15.5" r="5.5" />
              <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
            </svg>
          </button>

          {/* Monitorización */}
          <button
            onClick={() => router.push("/monitoring")}
            title="Operación"
            aria-label="Operación"
            className="h-9 w-9 max-lg:tap-target flex items-center justify-center rounded-md border border-wr-border text-wr-muted hover:text-wr-text hover:border-wr-muted transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m7 16 4-5 3 3 5-7" />
            </svg>
          </button>
        </div>
      </details>

      {/* Avatar: menú con Mi cuenta y Cerrar sesión. */}
      <div ref={userMenuRef} className="relative flex-shrink-0">
        <button
          onClick={() => setUserMenuOpen((o) => !o)}
          title={session?.user?.name ?? "Mi cuenta"}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          className="h-9 w-9 max-lg:tap-target rounded-full bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-xs font-semibold flex items-center justify-center hover:bg-wr-blue/30 transition-colors"
        >
          {initials}
        </button>
        {userMenuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1.5 z-50 w-48 rounded-md border border-wr-border bg-wr-surface shadow-2xl py-1 text-xs"
          >
            <div className="px-3 py-2 border-b border-wr-border">
              <p className="font-medium text-wr-text truncate">{session?.user?.name}</p>
              <p className="text-[10px] text-wr-hint truncate">{session?.user?.email}</p>
            </div>
            <Link
              href="/cuenta"
              role="menuitem"
              onClick={() => setUserMenuOpen(false)}
              className="block px-3 py-2 text-wr-muted hover:text-wr-text hover:bg-wr-surface2"
            >
              Mi cuenta
            </Link>
            <button
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="block w-full text-left px-3 py-2 text-wr-muted hover:text-wr-text hover:bg-wr-surface2"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
