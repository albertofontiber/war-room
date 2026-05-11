"use client";

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
import { type Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import {
  type SuggestionProps,
  type SuggestionKeyDownProps,
} from "@tiptap/suggestion";
import { buildMencionMarker } from "@/lib/menciones";

/**
 * Editor de texto con menciones (@). Construido sobre Tiptap (ProseMirror)
 * + `@tiptap/extension-mention`. Patrón best-practice del sector — Slack,
 * GitHub, Notion, Linear usan el mismo enfoque.
 *
 * Diferencias con el textarea previo:
 *   - El usuario ve el **chip renderizado** mientras edita (no el marcador
 *     `@[Nombre](u:id)`). El marcador es interno; se persiste igualmente
 *     vía `editor.getText()` para mantener el contrato con el parser server.
 *   - La mención es un nodo atómico: si pulsas Backspace al borde, desaparece
 *     entera; no se puede romper el marcador parcialmente.
 *   - Soporta multilínea natural (paragraphs + hardBreaks).
 *
 * Contrato con el caller (idéntico al componente previo, props compatibles):
 *   - `value: string` con marcadores `@[Name](u:id|f:id)` mezclados con texto.
 *   - `onChange(value)` recibe el texto serializado en el mismo formato.
 *
 * Carga lazy de candidatos al primer `@` (igual que antes). La lista
 * cacheada vive en estado local; si el deal cambia de finder asignado entre
 * cargas, se refresca en el próximo montaje del componente.
 */

export type MentionCandidate = {
  kind: "u" | "f";
  id: string;
  name: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  candidatesEndpoint: string;
  empresaId: number;
  placeholder?: string;
  /** Min-height en líneas (~1.5em por línea). Sustituye al `rows` del textarea. */
  rows?: number;
  className?: string;
  autoFocus?: boolean;
  /** Tiptap no nativiza HTML `required`; el caller debe validar el contenido. */
  required?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
};

const MENCION_REGEX = /@\[([^\]]+)\]\((u|f):([a-zA-Z0-9_-]+)\)/g;

/**
 * Convierte el texto con marcadores en el JSON document de Tiptap. Cada `\n`
 * del input se convierte en hardBreak dentro de un único paragraph — preserva
 * la sensación de "textarea" sin meterte en lógica de párrafos múltiples.
 */
function parseToTiptapDoc(text: string): JSONContent {
  if (!text) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  const lines = text.split("\n");
  const inline: JSONContent[] = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) inline.push({ type: "hardBreak" });

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    MENCION_REGEX.lastIndex = 0;
    while ((match = MENCION_REGEX.exec(line)) !== null) {
      if (match.index > lastIndex) {
        inline.push({ type: "text", text: line.slice(lastIndex, match.index) });
      }
      inline.push({
        type: "mention",
        attrs: {
          id: match[3],
          label: match[1],
          kind: match[2],
        },
      });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      inline.push({ type: "text", text: line.slice(lastIndex) });
    }
  });

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: inline.length > 0 ? inline : undefined,
      },
    ],
  };
}

/**
 * Mention node custom. Extiende el de Tiptap para soportar el atributo
 * `kind` (u|f) y serializar a nuestro formato persistido `@[Name](u:id)`
 * en `getText()`. El renderHTML produce un `<span>` con clase por tipo
 * (para chips coloreados — los estilos viven en globals.css o se aplican
 * por className inline aquí mismo).
 */
const CustomMention = Mention.extend({
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

// ───────────────────────────────────────────────────────────────────────────
// Suggestion popup (lista de candidatos) — componente React renderizado por
// Tiptap vía ReactRenderer. Posicionado vía CSS absoluto sobre el editor;
// evitamos tippy.js como dependencia extra. El ref expone `onKeyDown` para
// que Tiptap delegue ↑↓ Enter/Esc/Tab.
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

export function MentionTextarea({
  value,
  onChange,
  candidatesEndpoint,
  empresaId,
  placeholder,
  rows = 2,
  className,
  autoFocus,
  disabled,
  id,
  ariaLabel,
}: Props) {
  // Cache de candidatos por la vida del componente. El primer `@` dispara
  // el fetch; las siguientes invocaciones del suggestion lo reusan.
  const candidatesRef = useRef<MentionCandidate[] | null>(null);
  const loadingRef = useRef(false);

  const fetchCandidates = useCallback(async (): Promise<MentionCandidate[]> => {
    if (candidatesRef.current) return candidatesRef.current;
    if (loadingRef.current) return [];
    loadingRef.current = true;
    try {
      const res = await fetch(`${candidatesEndpoint}?empresaId=${empresaId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data: MentionCandidate[] = await res.json();
        candidatesRef.current = data;
        return data;
      }
    } catch {
      // silencioso — devolvemos lista vacía y el popup mostrará "Sin resultados"
    } finally {
      loadingRef.current = false;
    }
    candidatesRef.current = [];
    return [];
  }, [candidatesEndpoint, empresaId]);

  // Estado del popup. Tiptap nos entrega clientRect; lo guardamos para
  // posicionar el popup como fixed-coordinates (no necesitamos Tippy).
  const [popupState, setPopupState] = useState<{
    items: MentionCandidate[];
    rect: DOMRect | null;
    command: SuggestionProps["command"];
    loading: boolean;
  } | null>(null);

  const popupStateRef = useRef(popupState);
  popupStateRef.current = popupState;

  const listRef = useRef<MentionListHandle | null>(null);

  const mentionSuggestion = useMemo(
    () => ({
      char: "@",
      // Tiptap llama esto cada vez que el query cambia. Async permite el
      // lazy-fetch en el primer `@`.
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      CustomMention.configure({
        HTMLAttributes: { class: "wr-mention" },
        suggestion: mentionSuggestion,
      }),
    ],
    content: parseToTiptapDoc(value),
    editable: !disabled,
    autofocus: autoFocus ?? false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        // El className del caller ya define padding/border/colores. Añadimos
        // outline-none para que el focus no haga ring nativo encima del border
        // custom, y un min-height calculado por `rows` para imitar al textarea.
        class: `${className ?? ""} outline-none`,
        style: `min-height: ${rows * 1.5}em`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Serializa al formato persistido. `blockSeparator: "\n"` y los
      // hardBreaks se traducen también a "\n" → mismo formato que el caller
      // espera y que el parser server consume sin cambios.
      const text = ed.getText({ blockSeparator: "\n" });
      onChange(text);
    },
  });

  // Si `value` cambia desde fuera (ej. limpiar el campo tras submit, edit
  // diferente nota), reseteamos el contenido. Comparamos con el texto actual
  // para no romper el caret en cada onChange interno.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: "\n" });
    if (current !== value) {
      editor.commands.setContent(parseToTiptapDoc(value));
    }
  }, [value, editor]);

  // Cleanup: destruir el editor al desmontar evita memory leaks.
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
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

/**
 * Renderiza el popup en posición fixed según `rect.bottom/left` del caret
 * que Tiptap nos entrega. Más simple que tippy y suficiente — Tiptap nos da
 * coordenadas de viewport, así que `position: fixed` con esos números acierta.
 */
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

// Re-exports para evitar romper imports del antiguo archivo si los hay.
export { MentionList };
export type { Editor };
// `KeyboardEvent` re-exportado para compat — algunos callers podrían tiparlo.
export type { KeyboardEvent };
