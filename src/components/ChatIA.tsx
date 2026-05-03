"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useMemo, FormEvent } from "react";
import ReactMarkdown from "react-markdown";

export default function ChatIA() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
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
        className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-wr-blue hover:bg-wr-blue-light text-white flex items-center justify-center shadow-lg transition-colors"
        title="Chat IA"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-3 top-16 sm:inset-auto sm:bottom-5 sm:right-5 sm:top-auto sm:w-[420px] sm:h-[540px] z-50 flex flex-col rounded-lg border border-wr-border bg-wr-surface shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-wr-border shrink-0">
        <span className="text-sm font-semibold text-wr-text">Chat IA</span>
        <button
          onClick={() => setOpen(false)}
          className="text-wr-muted hover:text-wr-text transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-wr-muted text-xs text-center mt-8">
            <p className="mb-2">Pregunta lo que quieras sobre los datos del War Room.</p>
            <p className="text-wr-hint">Ejemplos:</p>
            <p className="text-wr-hint">&quot;Empresas con mas de 5M de ingresos en Barcelona&quot;</p>
            <p className="text-wr-hint">&quot;Cuantas fusiones hubo este mes?&quot;</p>
            <p className="text-wr-hint">&quot;Top 10 empresas por EBITDA en Cataluna&quot;</p>
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
              className={`text-xs leading-relaxed ${
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
                <div className="prose prose-invert prose-sm max-w-none !text-xs !leading-relaxed prose-p:my-1 prose-headings:my-2 prose-headings:text-sm prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-strong:text-wr-text prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-th:border prose-th:border-wr-border prose-td:border prose-td:border-wr-border">
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="text-wr-muted text-xs flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-wr-blue animate-pulse" />
            Consultando datos...
          </div>
        )}

        {error && (
          <div className="text-wr-red text-xs">
            Error: {error.message}
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={onSubmit} className="px-3 py-2.5 border-t border-wr-border shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu pregunta..."
            className="flex-1 bg-wr-surface2 border border-wr-border rounded px-3 py-1.5 text-xs text-wr-text placeholder:text-wr-hint focus:outline-none focus:border-wr-blue"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-3 py-1.5 bg-wr-blue text-white text-xs rounded hover:bg-wr-blue-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
