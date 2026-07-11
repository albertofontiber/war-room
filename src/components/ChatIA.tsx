"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  dispatchDataChanged,
  type ResourceKind,
} from "@/lib/data-events";
import { normalizeChatMarkdown } from "@/lib/normalize-chat-markdown";
import { RichTextEditor } from "@/components/RichTextEditor";

/**
 * Mapping toolName → recurso afectado. Mantener alineado con los tools
 * declarados en `src/app/api/chat/route.ts`. Si se añade un tool nuevo
 * (ej. `crear_nota`), añadir aquí su entry; si introduce un tipo de
 * recurso no listado, añadirlo a `ResourceKind` en `data-events.ts`.
 */
const TOOL_TO_RESOURCE: Record<string, ResourceKind> = {
  crear_tarea: "tarea",
  actualizar_tarea: "tarea",
  crear_contacto: "contacto",
  actualizar_contacto: "contacto",
  cambiar_etapa: "stage",
};

function resourceForTool(toolName: string): ResourceKind | null {
  return TOOL_TO_RESOURCE[toolName] ?? null;
}

function actionForTool(toolName: string): "create" | "update" | undefined {
  if (toolName.startsWith("crear_")) return "create";
  if (toolName.startsWith("actualizar_")) return "update";
  if (toolName === "cambiar_etapa") return "update";
  return undefined;
}

export default function ChatIA() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Rehidratar el hilo persistido (ChatThread) una sola vez al montar. El
  // server guarda la conversación al final de cada turno (onFinish del
  // stream), así que reabrir la app recupera donde lo dejaste.
  const historyLoadedRef = useRef(false);
  useEffect(() => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/chat/history");
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: unknown[] };
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages as Parameters<typeof setMessages>[0]);
        }
      } catch {
        // Sin historial no pasa nada — el chat empieza vacío.
      }
    })();
  }, [setMessages]);

  // "Nueva conversación": borra el hilo en servidor y limpia el estado local.
  const nuevaConversacion = useCallback(async () => {
    if (isLoading) return;
    setMessages([]);
    try {
      await fetch("/api/chat/history", { method: "DELETE" });
    } catch {
      // Si falla el DELETE, el próximo turno re-guardará el hilo viejo; no
      // es crítico y el usuario ya ve el chat vacío.
    }
  }, [isLoading, setMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Observa los tool results en el stream del chat. Cuando un tool con
  // efecto sobre una empresa termina (`{ok: true, ...}` con un campo de
  // entidad reconocible), dispara `wr:data-changed` para que cualquier
  // widget interesado refresque sin que el usuario pulse F5.
  //
  // Dedup por toolCallId (o un fallback si no existe): el stream emite el
  // mismo part en múltiples renders mientras llega, así que sin dedup
  // dispararíamos N eventos por una sola operación.
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
              contacto?: { id?: number; empresa?: { id?: number } };
              // Shape de cambiar_etapa: la empresa va a nivel raíz.
              empresa?: { id?: number };
            }
          | undefined;
        if (!output?.ok) continue;

        const callId =
          (anyPart.toolCallId as string | undefined) ??
          `${msg.id}-${output.tarea?.id ?? output.contacto?.id ?? output.empresa?.id ?? "?"}`;
        if (dispatchedRef.current.has(callId)) continue;

        // El toolName puede venir en `toolName` (v4 SDK) o codificado en
        // `type` como `tool-crear_tarea` (v5). Intentamos ambos.
        const rawType = anyPart.type as string | undefined;
        const toolName =
          (anyPart.toolName as string | undefined) ??
          (rawType?.startsWith("tool-") ? rawType.slice(5) : undefined) ??
          "";

        const resource = resourceForTool(toolName);
        if (!resource) continue; // Tool sin efecto (ej. execute_sql, buscar_empresa).

        // Resolver empresaId/resourceId según el recurso. Los tools de tarea
        // y contacto embeben la empresa en `output.{tarea,contacto}.empresa.id`;
        // cambiar_etapa la devuelve a nivel raíz (`output.empresa.id`) y no
        // tiene id propio.
        const empresaId =
          output.tarea?.empresa?.id ??
          output.contacto?.empresa?.id ??
          output.empresa?.id;
        const resourceId = output.tarea?.id ?? output.contacto?.id;
        if (!empresaId) continue;

        dispatchedRef.current.add(callId);
        dispatchDataChanged({
          resource,
          resourceId,
          action: actionForTool(toolName),
          parent: { resource: "empresa", id: empresaId },
          source: toolName,
        });
      }
    }
  }, [messages]);

  // El autofocus del RichTextEditor cuando `open` cambia a true ya gestiona
  // el foco al abrir el chat — no necesitamos manipular el ref del input
  // como hacíamos con el `<input>` plano.

  // En mobile el chat ocupa toda la pantalla. Por defecto, `position: fixed`
  // se referencia al *layout viewport* de iOS, que puede diferir del
  // *visual viewport* (lo realmente visible) en 4 dimensiones:
  //
  // - altura: el teclado virtual reduce el visual viewport pero NO el layout
  //   → el input queda escondido bajo el teclado.
  // - offsetTop: Safari mueve el visual viewport arriba para "centrar" el
  //   input con focus → el modal anclado a `top: 0` del layout queda con
  //   su mitad superior FUERA de la zona visible (el usuario ve el contenido
  //   subyacente, ej. el mapa).
  // - ancho: con zoom (intencional o pinch accidental) el visual viewport
  //   es más estrecho que el layout → el modal se desborda por la derecha
  //   y el botón Enviar queda cortado.
  // - offsetLeft: idem si el zoom se aplica desplazado.
  //
  // Fix: forzar las 4 dimensiones del modal a coincidir con `visualViewport`.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const isMobile = window.innerWidth < 640;
    if (!isMobile) return;

    const apply = () => {
      const el = containerRef.current;
      if (!el) return;
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
      el.style.width = `${vv.width}px`;
      el.style.left = `${vv.offsetLeft}px`;
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      const el = containerRef.current;
      if (el) {
        el.style.height = "";
        el.style.top = "";
        el.style.width = "";
        el.style.left = "";
      }
    };
  }, [open]);

  // El editor llama a onSubmit sin args; el botón Enviar también lo invoca
  // directamente. Mantenemos el guard de loading + trim para idempotencia.
  const onSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  }, [input, isLoading, sendMessage]);

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

  // En móvil: `top-0 left-0 right-0` ancla el modal pero NO el `bottom`
  // (intencional: la altura la fija visualViewport vía style inline, para que
  // el teclado iOS no tape el input). El `h-[100dvh]` actúa como fallback si
  // el navegador no expone visualViewport.
  // En desktop (sm+): `sm:top-auto sm:left-auto` cancela el anclaje móvil
  // y vuelve a la posición flotante `sm:bottom-5 sm:right-5`.
  return (
    <div
      ref={containerRef}
      className="fixed top-0 left-0 right-0 h-[100dvh] sm:top-auto sm:left-auto sm:right-5 sm:bottom-5 sm:h-[540px] sm:w-[420px] z-50 flex flex-col bg-wr-surface border-0 sm:border border-wr-border shadow-2xl rounded-none sm:rounded-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:py-2.5 border-b border-wr-border shrink-0">
        <span className="text-sm font-semibold text-wr-text">Chat IA</span>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={() => void nuevaConversacion()}
              disabled={isLoading}
              className="text-wr-muted hover:text-wr-text transition-colors text-[11px] px-2 py-1 rounded border border-wr-border disabled:opacity-50"
              title="Borra el historial y empieza de cero"
            >
              Nueva conversación
            </button>
          )}
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
            <p className="text-wr-hint">&quot;Mueve la videollamada con Acme al jueves&quot;</p>
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
                <div className="prose prose-invert prose-sm max-w-none !text-sm sm:!text-xs !leading-relaxed prose-p:my-1 prose-headings:my-2 prose-headings:text-sm prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-strong:text-wr-text prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-th:border prose-th:border-wr-border prose-td:border prose-td:border-wr-border prose-table:my-2 overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {normalizeChatMarkdown(text)}
                  </ReactMarkdown>
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
          de iOS tape el botón cuando el teclado está cerrado.
          Editor rich text: bold/italic/listas + Enter envía, Shift+Enter
          nueva línea (consistente con Slack moderno). */}
      <div className="px-3 py-2.5 border-t border-wr-border shrink-0 pb-[max(env(safe-area-inset-bottom),0.625rem)] sm:pb-2.5">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-wr-surface2 border border-wr-border rounded focus-within:border-wr-blue px-2 py-1">
            <RichTextEditor
              value={input}
              onChange={setInput}
              onSubmit={onSubmit}
              placeholder="Escribe tu pregunta…"
              rows={1}
              disabled={isLoading}
              autoFocus={open}
              toolbar={true}
              className="text-sm sm:text-xs text-wr-text placeholder:text-wr-hint"
            />
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 sm:px-3 sm:py-1.5 bg-wr-blue text-white text-sm sm:text-xs rounded hover:bg-wr-blue-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
