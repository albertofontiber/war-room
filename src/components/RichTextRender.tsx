"use client";

/**
 * Renderer de markdown para contenido guardado por `RichTextEditor`.
 *
 * Maneja:
 *   - Markdown estándar (bold/italic/listas) vía react-markdown.
 *   - Menciones `@[Name](u:id)` / `@[Name](f:id)` — el `@` queda como texto
 *     y el link de markdown se intercepta en el override de `a` y se pinta
 *     como chip coloreado (azul admin / ámbar finder). Si el href no es de
 *     mención (esquema http/https), se renderiza como link normal.
 *
 * Sin GFM, sin tablas, sin HTML inline — el editor no los produce. Si en
 * el futuro entran, añadir `remark-gfm` aquí.
 */

import ReactMarkdown from "react-markdown";
import type { ReactNode } from "react";

const isMentionHref = (href: string | undefined): href is string =>
  typeof href === "string" && (href.startsWith("u:") || href.startsWith("f:"));

type MentionAnchorProps = {
  href?: string;
  children?: ReactNode;
};

function MentionAnchor({ href, children }: MentionAnchorProps) {
  if (!isMentionHref(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-wr-blue hover:underline"
      >
        {children}
      </a>
    );
  }
  const kind = href.startsWith("f:") ? "f" : "u";
  const color =
    kind === "f"
      ? "bg-wr-amber/15 text-wr-amber"
      : "bg-wr-blue/15 text-wr-blue";
  return (
    <span
      className={`inline-block px-1 rounded text-[0.95em] font-medium ${color}`}
      title={kind === "f" ? "Finder" : "Admin"}
    >
      {children}
    </span>
  );
}

/**
 * Componentes del react-markdown — minimal. Listas heredan estilo del
 * contenedor padre (prose o el className que pasen los callers).
 */
const COMPONENTS = {
  a: MentionAnchor,
  // Mantenemos los párrafos como `<p>` con margen mínimo para que el
  // contenido no se separe demasiado dentro de cards pequeñas.
  p: ({ children }: { children?: ReactNode }) => (
    <p className="my-0.5 leading-snug">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc list-inside my-0.5 space-y-0">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal list-inside my-0.5 space-y-0">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-snug">{children}</li>
  ),
};

export function RichTextRender({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown components={COMPONENTS}>{content}</ReactMarkdown>
    </div>
  );
}
