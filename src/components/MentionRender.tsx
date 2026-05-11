"use client";

import { Fragment } from "react";

/**
 * Renderiza contenido con marcadores `@[Nombre](u:id|f:id)` reemplazándolos
 * por chips visuales. El texto plano alrededor se preserva, incluyendo
 * saltos de línea (whitespace-pre-wrap del padre).
 *
 * No clickable por ahora — futuro: link al perfil del User/Finder o filtro
 * "muéstrame todo lo de X".
 */

const MENTION_RE = /@\[([^\]]+)\]\((u|f):([a-zA-Z0-9_-]+)\)/g;

type Part =
  | { kind: "text"; value: string }
  | { kind: "mention"; name: string; type: "u" | "f"; id: string };

function parse(content: string): Part[] {
  const parts: Part[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({
      kind: "mention",
      name: match[1],
      type: match[2] as "u" | "f",
      id: match[3],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ kind: "text", value: content.slice(lastIndex) });
  }
  return parts;
}

export function MentionRender({ content, className }: { content: string; className?: string }) {
  const parts = parse(content);
  return (
    <span className={className}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p.kind === "text" ? (
            p.value
          ) : (
            <span
              className={`inline-block px-1 rounded text-[0.95em] font-medium ${
                p.type === "f"
                  ? "bg-wr-amber/15 text-wr-amber"
                  : "bg-wr-blue/15 text-wr-blue"
              }`}
              title={p.type === "f" ? `Finder: ${p.name}` : `Admin: ${p.name}`}
            >
              @{p.name}
            </span>
          )}
        </Fragment>
      ))}
    </span>
  );
}
