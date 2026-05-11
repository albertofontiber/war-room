"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo, FormEvent } from "react";
import ReactMarkdown from "react-markdown";

/**
 * Evento global que dispara el chat cuando un tool de tarea termina con
 * éxito (crear_tarea, actualizar_tarea). Cualquier componente que muestre
 * tareas debe escuchar `wr:tareas-changed` y refrescar si el `empresaId`
 * coincide con el suyo. Importable desde otros sitios:
 *
 *   import { TAREAS_CHANGED_EVENT } from "@/components/ChatIA";
 *   window.addEventListener(TAREAS_CHANGED_EVENT, handler);
 *
 * Detail: `{ empresaId: number; tareaId?: number; source: "crear_tarea"|"actualizar_tarea" }`.
 */
export const TAREAS_CHANGED_EVENT = "wr:tareas-changed";

export default function ChatIA() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Observa los tool results en el stream del chat. Cuando crear_tarea o
  // actualizar_tarea devuelven `{ok: true, tarea: {empresa: {id}}}`,
  // dispara un window event para que TareasSection (y futuros consumers)
  // refresquen su lista sin que el usuario tenga que pulsar F5.
  //
  // Dedup por toolCallId (o un fallback si no existe): el stream emite el
  // mismo part en múltiples renders mientras llega, así que sin dedup
  // dispararíamos N eventos por una sola tarea.
  const dispatchedRef = useRef(new Set<string>());
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts ?? []) {
        // Acceso defensivo — el shape exacto de los parts de tool depende
        // de la versión del AI SDK. Buscamos un `output` (o `result`
        // legacy) que tenga la forma de nuestros tools.
        const anyPart = part as Record<string, unknown>;
        const output = (anyPart.output ?? anyPart.result) as
          | {
              ok?: boolean;
              tarea?: { id?: number; empresa?: { id?: number } };
            }
          | undefined;
        if (!output?.ok) continue;
        const empresaId = output.tarea?.empresa?.id;
        if (!empresaId) continue;

        const callId =
          (anyPart.toolCallId as string | undefined) ??
          `${msg.id}-${output.tarea?.id ?? "?"}`;
        if (dispatchedRef.current.has(callId)) continue;
        dispatchedRef.current.add(callId);

        // El toolName puede venir en `toolName` (v4 SDK) o codificado en
        // `type` como `tool-crear_tarea` (v5). Intentamos ambos.
        const rawType = anyPart.type as string | undefined;
        const toolName =
          (anyPart.toolName as string | undefined) ??
          (rawType?.startsWith("tool-") ? rawType.slice(5) : undefined) ??
          "tool";

        window.dispatchEvent(
          new CustomEvent(TAREAS_CHANGED_EVENT, {
            detail: {
              empresaId,
              tareaId: output.tarea?.id,
              source: toolName,
            },
          })
        );
      }
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // En mobile el chat ocupa toda la pantalla. Cuando aparece el teclado virtual
  // de iOS, el `position: fixed` mantiene el contenedor a la altura completa
  // del layout viewport — el input queda escondido bajo el teclado.
  // Usamos `visualViewport` para reducir la altura del contenedor a la zona
  // realmente visible y que el input aterrice justo encima del teclado.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const isMobile = window.innerWidth < 640;
    if (!isMobile) return;

    const apply = () => {
      if (containerRef.current) {
        containerRef.current.style.height = `${vv.height}px`;
      }
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      if (containerRef.current) containerRef.current.style.height = "";
    };
  }, [open]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 w-12 h-12 rounded-full bg-wr-blue hover:bg-wr-blue-light text-white flex items-center justify-center shadow-lg transition-colors"
        title="Chat IA"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 h-[100dvh] sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[540px] sm:w-[420px] z-50 flex flex-col bg-wr-surface border-0 sm:border border-wr-border shadow-2xl rounded-none sm:rounded-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:py-2.5 border-b border-wr-border shrink-0">
        <span className="text-sm font-semibold text-wr-text">Chat IA</span>
        <button
          onClick={() => setOpen(false)}
          className="text-wr-muted hover:text-wr-text transition-colors p-1 -m-1"
          aria-label="Cerrar chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-wr-muted text-sm sm:text-xs text-center mt-6 sm:mt-8 space-y-1.5">
            <p className="mb-2">Pregunta sobre los datos o pide crear tareas.</p>
            <p className="text-wr-hint">Ejemplos:</p>
            <p className="text-wr-hint">&quot;Top 10 empresas por EBITDA en Cataluña&quot;</p>
            <p className="text-wr-hint">&quot;¿Cuántas fusiones hubo este mes?&quot;</p>
            <p className="text-wr-hint">&quot;Crea una tarea para llamar a Aize mañana&quot;</p>
            <p className="text-wr-hint">&quot;Recuérdame mandar el NDA a Tesein el viernes&quot;</p>
          </div>
        )}

        {messages.map((msg) => {
          const text = msg.parts
            ?.filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("") || "";

          if (!text) return null;

          return (
            <div
              key={msg.id}
              className={`text-sm sm:text-xs leading-relaxed ${
                msg.role === "user"
                  ? "text-wr-blue-light ml-8"
                  : "text-wr-text mr-4"
              }`}
            >
              {msg.role === "user" ? (
                <div className="bg-wr-surface2 rounded-lg px-3 py-2 text-right">
                  {text}
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none !text-sm sm:!text-xs !leading-relaxed prose-p:my-1 prose-headings:my-2 prose-headings:text-sm prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-strong:text-wr-text prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-th:border prose-th:border-wr-border prose-td:border prose-td:border-wr-border">
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="text-wr-muted text-sm sm:text-xs flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-wr-blue animate-pulse" />
            Consultando datos...
          </div>
        )}

        {error && (
          <div className="text-wr-red text-sm sm:text-xs">
            Error: {error.message}
          </div>
        )}
      </div>

      {/* Input. `pb-[env(safe-area-inset-bottom)]` evita que el home indicator
          de iOS tape el botón cuando el teclado está cerrado. */}
      <form
        onSubmit={onSubmit}
        className="px-3 py-2.5 border-t border-wr-border shrink-0 pb-[max(env(safe-area-inset-bottom),0.625rem)] sm:pb-2.5"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu pregunta..."
            className="flex-1 bg-wr-surface2 border border-wr-border rounded px-3 py-2 sm:py-1.5 text-sm sm:text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 sm:px-3 sm:py-1.5 bg-wr-blue text-white text-sm sm:text-xs rounded hover:bg-wr-blue-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
