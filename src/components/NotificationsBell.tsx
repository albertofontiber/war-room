"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Notificacion = {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  link: string | null;
  leida: boolean;
  leidaAt: string | null;
  createdAt: string;
};

type ApiResponse = {
  items: Notificacion[];
  unreadCount: number;
};

// 60s — antes 30s. Reduce el polling a la mitad sin pérdida perceptible
// (tareas/notas no llegan al segundo). Si en el futuro queremos casi-tiempo-
// real, el siguiente paso sería SSE/WebSocket en vez de polling.
const POLL_MS = 60_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

/**
 * Campana reutilizable. Por defecto consume el endpoint admin
 * (`/api/notificaciones`); el portal del finder pasa `endpoint` distinto y
 * el componente funciona idéntico — el destinatario lo determina la sesión
 * en el backend, no el cliente.
 */
export default function NotificationsBell({
  endpoint = "/api/notificaciones",
  compact = false,
}: { endpoint?: string; compact?: boolean } = {}) {
  const router = useRouter();
  const [items, setItems] = useState<Notificacion[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch(`${endpoint}?limit=10`, { cache: "no-store" });
      if (!res.ok) return;
      const data: ApiResponse = await res.json();
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // silencioso: si falla el poll, mantenemos el estado anterior
    }
  }, [endpoint]);

  // Carga inicial + polling cada 30s
  useEffect(() => {
    fetchNotifs();
    const t = setInterval(fetchNotifs, POLL_MS);
    return () => clearInterval(t);
  }, [fetchNotifs]);

  // Cierra dropdown al click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !dropdownRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) return;
    setLoading(true);
    try {
      await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      await fetchNotifs();
    } finally {
      setLoading(false);
    }
  }, [endpoint, unreadCount, fetchNotifs]);

  const handleItemClick = useCallback(
    async (n: Notificacion) => {
      // Marca leída si no lo estaba (optimista) y navega
      if (!n.leida) {
        setItems((prev) =>
          prev.map((it) => (it.id === n.id ? { ...it, leida: true } : it))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [n.id] }),
        }).catch(() => {});
      }
      setOpen(false);
      if (n.link) router.push(n.link);
    },
    [endpoint, router]
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        title="Notificaciones"
        className={`${compact ? "h-9 w-9 max-lg:tap-target" : "tap-target"} relative flex items-center justify-center rounded-md border border-wr-border text-wr-muted hover:text-wr-text hover:border-wr-muted transition-colors`}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-wr-red text-white text-[9px] font-semibold flex items-center justify-center leading-none border border-wr-surface">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[92vw] bg-wr-surface border border-wr-border rounded-lg shadow-2xl z-50 overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-wr-border flex items-center justify-between">
            <span className="text-xs font-semibold text-wr-text">Notificaciones</span>
            <button
              onClick={markAllRead}
              disabled={loading || unreadCount === 0}
              className="text-[10px] text-wr-blue hover:underline disabled:text-wr-hint disabled:no-underline disabled:cursor-default"
            >
              Marcar todas leídas
            </button>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-wr-hint">
                Sin notificaciones por ahora.
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-wr-border/60 last:border-b-0 transition-colors ${
                    n.leida
                      ? "bg-transparent hover:bg-wr-surface2/40"
                      : "bg-wr-blue/5 hover:bg-wr-blue/10"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.leida && (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-wr-blue flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-wr-text leading-snug">
                        {n.titulo}
                      </p>
                      <p className="text-[11px] text-wr-muted mt-0.5 leading-snug whitespace-pre-wrap line-clamp-3">
                        {n.mensaje}
                      </p>
                      <p className="text-[10px] text-wr-hint mt-1">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
