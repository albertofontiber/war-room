"use client";

/**
 * Editor de texto enriquecido reusable. Construido sobre Tiptap.
 *
 * Capacidades:
 *   - Bold / italic con shortcuts (Ctrl+B / Ctrl+I) + toolbar visible.
 *   - Listas viñetas y numeradas (input rules markdown: "- ", "1. ").
 *   - Saltos de línea (Enter = nuevo párrafo; Shift+Enter = hard break).
 *   - Menciones @ opcionales (admins/finders) — pasar `mentions` prop.
 *   - Submit on Enter opcional (chat IA) — pasar `onSubmit`.
 *
 * Formato persistido: **markdown plano**. Convención del sector (Slack,
 * GitHub, Linear, Notion). Marcadores de mención `@[Name](u:id)` /
 * `@[Name](f:id)` se preservan literal — al render con `RichTextRender`
 * se reconocen por el prefijo del href y se pintan como chip.
 *
 * Datos antiguos (texto plano sin formato) siguen siendo válidos como
 * markdown sin marcas. La migración es transparente.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type KeyboardEvent,
} from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import MarkdownIt from "markdown-it";
import {
  type SuggestionProps,
  type SuggestionKeyDownProps,
} from "@tiptap/suggestion";
import { buildMencionMarker } from "@/lib/menciones";

// Instancia singleton de markdown-it para convertir markdown entrante a HTML
// (con menciones ya sustituidas por spans). El editor recibe HTML que el
// parseHTML del Mention reconoce. Configuración alineada con tiptap-markdown
// para que round-trip sea idempotente.
const mdIt = new MarkdownIt({
  html: true, // permite los <span> de menciones en el source
  linkify: false, // NO auto-link URLs (chocaría con menciones u:id/f:id)
  breaks: true, // \n en source → <br>
});

export type MentionCandidate = {
  kind: "u" | "f";
  id: string;
  name: string;
};

export type RichTextEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  /**
   * Si se pasa, el botón Enter envía (chat-style). Shift+Enter sigue siendo
   * hard break. Sin esto, Enter es nuevo párrafo (notas/tareas).
   */
  onSubmit?: () => void;
  /**
   * Configuración de menciones. Si presente, se activa el popup `@`.
   */
  mentions?: {
    candidatesEndpoint: string;
    empresaId: number;
  };
  /**
   * `true` (default) muestra toolbar mínima encima del editor.
   * `false` la oculta — útil cuando la barra estorba (ej. caja muy pequeña).
   */
  toolbar?: boolean;
};

/**
 * Custom Mention que extiende el de Tiptap para soportar atributo `kind` y
 * serializar a nuestro formato persistido `@[Name](kind:id)` en `getText()`
 * y `getMarkdown()` (lo trata como link normal de markdown, que es lo que
 * queremos — `RichTextRender` lo intercepta por el prefijo del href).
 */
const CustomMention = Mention.extend({
  // Override parseHTML para reconocer nuestro shape de span (data-mention-id).
  // El default del Mention es `span[data-type="mention"]`, no nos sirve porque
  // el pre-procesador genera spans con data-mention-id (más explícito).
  parseHTML() {
    return [
      {
        tag: "span[data-mention-id]",
      },
    ];
  },
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-mention-id"),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.id ? { "data-mention-id": String(attrs.id) } : {},
      },
      label: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-mention-label"),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.label ? { "data-mention-label": String(attrs.label) } : {},
      },
      kind: {
        default: "u",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-mention-kind") ?? "u",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-mention-kind": String(attrs.kind ?? "u"),
        }),
      },
    };
  },
  // tiptap-markdown llama `addStorage().markdown.serialize` por nodo al exportar
  // a markdown. Aquí emitimos LITERALMENTE `@[Name](u:id)` (sintaxis link
  // markdown) para que el contenido persistido siga el mismo formato que ya
  // produce el parser server `lib/menciones.ts`. El render side se hace en
  // `RichTextRender` que intercepta links cuyo href empieza por `u:`/`f:`.
  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (text: string) => void },
          node: { attrs: { kind: string; id: string; label: string } }
        ) {
          state.write(
            buildMencionMarker({
              kind: node.attrs.kind === "f" ? "f" : "u",
              id: node.attrs.id,
              name: node.attrs.label,
            })
          );
        },
      },
    };
  },
  renderText({ node }) {
    const kind = node.attrs.kind === "f" ? "f" : "u";
    return buildMencionMarker({ kind, id: node.attrs.id, name: node.attrs.label });
  },
  renderHTML({ node, HTMLAttributes }) {
    const kind = node.attrs.kind === "f" ? "f" : "u";
    const colorClasses =
      kind === "f"
        ? "bg-wr-amber/15 text-wr-amber"
        : "bg-wr-blue/15 text-wr-blue";
    return [
      "span",
      {
        ...HTMLAttributes,
        class: `inline-block px-1 rounded text-[0.95em] font-medium ${colorClasses}`,
      },
      `@${node.attrs.label}`,
    ];
  },
});

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Pre-procesa markdown entrante: 1) sustituye menciones `@[Name](u:id)` por
 * spans HTML (que el parseHTML del Mention reconoce), 2) convierte el
 * resultado a HTML completo con markdown-it. El editor recibe HTML, no
 * markdown — saltamos el parser interno de tiptap-markdown para input.
 *
 * Tiptap-markdown SIGUE usándose para OUTPUT (`getMarkdown()`), donde el
 * `addStorage.markdown.serialize` del Mention emite `@[Name](u:id)` literal.
 *
 * Round-trip: markdown → HTML (con span) → editor doc → markdown (con
 * marcador). Idempotente.
 */
function markdownToTiptapContent(md: string): string {
  if (!md) return "";
  const withMentions = md.replace(
    /@\[([^\]]+)\]\((u|f):([a-zA-Z0-9_-]+)\)/g,
    (_, name: string, kind: string, id: string) => {
      const safeName = escapeHtmlAttr(name);
      return `<span data-mention-id="${escapeHtmlAttr(id)}" data-mention-kind="${kind}" data-mention-label="${safeName}">@${safeName}</span>`;
    }
  );
  return mdIt.render(withMentions);
}

// ───────────────────────────────────────────────────────────────────────────
// Suggestion popup
// ───────────────────────────────────────────────────────────────────────────

type MentionListHandle = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};
type MentionListProps = {
  items: MentionCandidate[];
  command: (item: { id: string; label: string; kind: string }) => void;
  loading: boolean;
};

const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  ({ items, command, loading }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const select = useCallback(
      (idx: number) => {
        const item = items[idx];
        if (!item) return;
        command({ id: item.id, label: item.name, kind: item.kind });
      },
      [items, command]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (event.key === "ArrowUp") {
            setSelectedIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
            return true;
          }
          if (event.key === "ArrowDown") {
            setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            select(selectedIndex);
            return true;
          }
          return false;
        },
      }),
      [items, selectedIndex, select]
    );

    if (loading && items.length === 0) {
      return (
        <div className="bg-wr-surface border border-wr-border rounded-md shadow-lg px-2 py-1.5 text-[10px] text-wr-hint">
          Cargando…
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="bg-wr-surface border border-wr-border rounded-md shadow-lg px-2 py-1.5 text-[10px] text-wr-hint">
          Sin resultados
        </div>
      );
    }

    return (
      <div className="bg-wr-surface border border-wr-border rounded-md shadow-lg min-w-[200px] max-h-56 overflow-y-auto">
        {items.map((c, i) => (
          <button
            key={`${c.kind}-${c.id}`}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              select(i);
            }}
            onMouseEnter={() => setSelectedIndex(i)}
            className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 ${
              i === selectedIndex
                ? "bg-wr-blue/15 text-wr-blue"
                : "text-wr-text hover:bg-wr-surface2"
            }`}
          >
            <span
              className={`text-[9px] uppercase tracking-wider px-1 rounded ${
                c.kind === "f"
                  ? "bg-wr-amber/20 text-wr-amber"
                  : "bg-wr-blue/20 text-wr-blue"
              }`}
            >
              {c.kind === "f" ? "Finder" : "Admin"}
            </span>
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>
    );
  }
);
MentionList.displayName = "MentionList";

// ───────────────────────────────────────────────────────────────────────────
// Editor
// ───────────────────────────────────────────────────────────────────────────

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  rows = 2,
  className,
  autoFocus,
  disabled,
  id,
  ariaLabel,
  onSubmit,
  mentions,
  toolbar = true,
}: RichTextEditorProps) {
  // Cache lazy de candidatos de mención por la vida del componente.
  const candidatesRef = useRef<MentionCandidate[] | null>(null);
  const loadingRef = useRef(false);

  const fetchCandidates = useCallback(async (): Promise<MentionCandidate[]> => {
    if (!mentions) return [];
    if (candidatesRef.current) return candidatesRef.current;
    if (loadingRef.current) return [];
    loadingRef.current = true;
    try {
      const res = await fetch(
        `${mentions.candidatesEndpoint}?empresaId=${mentions.empresaId}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data: MentionCandidate[] = await res.json();
        candidatesRef.current = data;
        return data;
      }
    } catch {
      /* silencioso */
    } finally {
      loadingRef.current = false;
    }
    candidatesRef.current = [];
    return [];
  }, [mentions]);

  const [popupState, setPopupState] = useState<{
    items: MentionCandidate[];
    rect: DOMRect | null;
    command: SuggestionProps["command"];
    loading: boolean;
  } | null>(null);
  const listRef = useRef<MentionListHandle | null>(null);
  // Editor real disponible tras useEditor — handleKeyDown corre antes de
  // que `editor` esté asignado, así que usamos un ref vivo asignado en
  // onCreate para consultar isActive(...) en cada keypress.
  const editorRefForKeyboard = useRef<{ isActive: (name: string) => boolean } | null>(null);

  const mentionSuggestion = useMemo(
    () => ({
      char: "@",
      items: async ({ query }: { query: string }): Promise<MentionCandidate[]> => {
        const all = await fetchCandidates();
        const q = query.toLowerCase().trim();
        if (!q) return all.slice(0, 8);
        return all
          .filter((c) => c.name.toLowerCase().includes(q))
          .slice(0, 8);
      },
      render: () => {
        let renderer: ReactRenderer<MentionListHandle, MentionListProps> | null = null;
        return {
          onStart: (props: SuggestionProps<MentionCandidate>) => {
            renderer = new ReactRenderer(MentionList, {
              props: {
                items: props.items,
                command: props.command,
                loading: loadingRef.current,
              },
              editor: props.editor,
            });
            listRef.current = renderer.ref;
            setPopupState({
              items: props.items,
              rect: props.clientRect ? props.clientRect() : null,
              command: props.command,
              loading: loadingRef.current,
            });
          },
          onUpdate: (props: SuggestionProps<MentionCandidate>) => {
            renderer?.updateProps({
              items: props.items,
              command: props.command,
              loading: loadingRef.current,
            });
            setPopupState({
              items: props.items,
              rect: props.clientRect ? props.clientRect() : null,
              command: props.command,
              loading: loadingRef.current,
            });
          },
          onKeyDown: (props: SuggestionKeyDownProps): boolean => {
            if (props.event.key === "Escape") {
              setPopupState(null);
              return true;
            }
            return listRef.current?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            renderer?.destroy();
            renderer = null;
            listRef.current = null;
            setPopupState(null);
          },
        };
      },
    }),
    [fetchCandidates]
  );

  const extensions = useMemo<Extensions>(() => {
    // Listas + bold/italic vienen activadas en StarterKit por default.
    // Headings/blockquote/codeBlock/strike/horizontalRule deshabilitadas —
    // un editor de notas no es un editor de blog.
    const base: Extensions = [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      // tiptap-markdown serializa/deserializa entre JSON Tiptap y markdown
      // plano. `linkify: false` evita auto-link de URLs sueltas (que
      // colisionaría con menciones `u:id`/`f:id`).
      Markdown.configure({
        linkify: false,
        breaks: true,
        transformPastedText: true,
        // html:true permite que los <span data-mention-...> del pre-procesado
        // sobrevivan al parsing markdown y los detecte el parseHTML del Mention.
        html: true,
      }),
    ];
    if (mentions) {
      base.push(
        CustomMention.configure({
          HTMLAttributes: { class: "wr-mention" },
          suggestion: mentionSuggestion,
        })
      );
    }
    return base;
  }, [placeholder, mentions, mentionSuggestion]);

  const editor = useEditor({
    extensions,
    content: markdownToTiptapContent(value),
    editable: !disabled,
    autofocus: autoFocus ?? false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        class: `${className ?? ""} outline-none prose-mirror-content`,
        style: `min-height: ${rows * 1.5}em`,
      },
      handleKeyDown: (_view, event) => {
        // Si onSubmit está set (modo chat): Enter envía, Shift+Enter es
        // hard break. EXCEPCIÓN: si el cursor está dentro de una lista,
        // dejamos que Tiptap maneje Enter (crea nuevo item de la lista, o
        // sale al final si el item está vacío). Para enviar estando en
        // lista, el usuario pulsa el botón Enviar explícitamente.
        // Sin esta excepción, no había forma de hacer listas multi-item en
        // chat — Enter enviaba, Shift+Enter metía hardbreak DENTRO del
        // mismo `<li>` y el markdown salía con escapes raros (1\., \\ ).
        if (onSubmit && event.key === "Enter" && !event.shiftKey) {
          const editorRef = editorRefForKeyboard.current;
          const inList =
            editorRef?.isActive("bulletList") ||
            editorRef?.isActive("orderedList");
          if (inList) return false; // Tiptap crea nuevo item / sale al final.
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Serializa a markdown vía tiptap-markdown.
      const md = (ed.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? ed.getText({ blockSeparator: "\n" });
      onChange(md);
    },
    onCreate: ({ editor: ed }) => {
      editorRefForKeyboard.current = ed as unknown as { isActive: (n: string) => boolean };
    },
    onDestroy: () => {
      editorRefForKeyboard.current = null;
    },
  });

  // Reset content si `value` cambia desde fuera (form reset post-submit, edit
  // de otra entidad). Compara markdown actual vs nuevo.
  useEffect(() => {
    if (!editor) return;
    const current =
      (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? editor.getText({ blockSeparator: "\n" });
    if (current !== value) {
      editor.commands.setContent(markdownToTiptapContent(value || ""));
    }
  }, [value, editor]);

  // Cleanup al desmontar.
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      {toolbar && editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {popupState && popupState.rect && (
        <MentionPopup
          rect={popupState.rect}
          items={popupState.items}
          command={popupState.command}
          loading={popupState.loading}
          ref={listRef}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Toolbar mínima
// ───────────────────────────────────────────────────────────────────────────

type ToolbarEditor = {
  isActive: (name: string) => boolean;
  chain: () => {
    focus: () => {
      toggleBold: () => { run: () => void };
      toggleItalic: () => { run: () => void };
      toggleBulletList: () => { run: () => void };
      toggleOrderedList: () => { run: () => void };
    };
  };
};

function Toolbar({ editor }: { editor: ToolbarEditor }) {
  const btn = (active: boolean) =>
    `text-[11px] w-6 h-6 flex items-center justify-center rounded transition-colors ${
      active
        ? "bg-wr-blue/20 text-wr-blue"
        : "text-wr-muted hover:text-wr-text hover:bg-wr-surface2"
    }`;

  return (
    <div className="flex items-center gap-0.5 mb-1 px-1 py-0.5 border border-wr-border rounded-md bg-wr-surface2/40 w-fit">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBold().run();
        }}
        className={btn(editor.isActive("bold"))}
        title="Negrita (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleItalic().run();
        }}
        className={btn(editor.isActive("italic"))}
        title="Cursiva (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <span className="w-px h-3 bg-wr-border mx-0.5" />
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleBulletList().run();
        }}
        className={btn(editor.isActive("bulletList"))}
        title="Viñetas (— · —)"
      >
        •
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().toggleOrderedList().run();
        }}
        className={btn(editor.isActive("orderedList"))}
        title="Numerada (1. 2. 3.)"
      >
        1.
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// MentionPopup (posicionado vía clientRect)
// ───────────────────────────────────────────────────────────────────────────

const MentionPopup = forwardRef<
  MentionListHandle,
  {
    rect: DOMRect;
    items: MentionCandidate[];
    command: SuggestionProps["command"];
    loading: boolean;
  }
>(({ rect, items, command, loading }, ref) => {
  return (
    <div
      style={{
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        zIndex: 9999,
      }}
    >
      <MentionList
        ref={ref}
        items={items}
        command={(item) => command(item as never)}
        loading={loading}
      />
    </div>
  );
});
MentionPopup.displayName = "MentionPopup";

// Re-exports para compat.
export type { KeyboardEvent };
