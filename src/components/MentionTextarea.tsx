"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { buildMencionMarker } from "@/lib/menciones";

/**
 * Textarea con autocomplete de menciones (@). Cuando el usuario escribe `@`
 * seguido de letras, aparece un popup con candidatos filtrados (admins +
 * eventualmente el finder del deal). Seleccionar uno inserta el marcador
 * estructurado `@[Nombre](u:id|f:id)` en el texto.
 *
 * Por qué no contenteditable: dragons. El textarea plano + popup absoluto da
 * 90% de la UX a 10% del coste y debugging. La pérdida visual es que los
 * marcadores se ven como `@[Nombre](u:abc)` mientras editas (no como chip);
 * al guardar, `MentionRender` los muestra bonitos. Tradeoff aceptable —
 * Slack/GitHub usan rich editors precisamente para evitar esto, pero aquí
 * el coste no compensa para un editor de notas/tareas.
 *
 * Carga lazy de candidatos: la primera vez que el usuario teclea `@`, hace
 * el fetch a `endpoint?empresaId=X`. Cachea durante la vida del componente.
 */

export type MentionCandidate = {
  kind: "u" | "f";
  id: string;
  name: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** URL del endpoint que devuelve candidatos. Distinto en admin y portal. */
  candidatesEndpoint: string;
  empresaId: number;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** ID/nombre para tests y a11y. */
  id?: string;
  ariaLabel?: string;
};

/**
 * Match el "@token" activo en la posición del cursor. Devuelve null si no hay
 * un mention activo (no estamos tras un `@`, o hay espacio entre el `@` y el
 * cursor). El token puede contener letras, espacios, acentos, punto, guión —
 * para que "@Alberto Silva" o "@alberto.silva" funcionen mientras se escribe.
 */
function detectActiveMention(
  text: string,
  cursorPos: number
): { start: number; query: string } | null {
  // Buscar el último '@' antes del cursor.
  const before = text.slice(0, cursorPos);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;

  // Si el '@' es parte de un email (precedido por un letra o número sin
  // espacio), no es mención.
  if (at > 0 && /\S/.test(before[at - 1])) return null;

  const query = before.slice(at + 1);
  // Si el query contiene `]` o `)` ya hemos cerrado un marcador; no es mention activo.
  if (/[\]\n)]/.test(query)) return null;
  // Cap a 30 chars (más allá no es razonable; cierra el popup).
  if (query.length > 30) return null;
  return { start: at, query };
}

/** Insert sin perder el caret. Devuelve el nuevo texto + nueva posición de caret. */
function insertAtMention(
  text: string,
  mentionStart: number,
  cursorPos: number,
  marker: string
): { text: string; cursor: number } {
  const before = text.slice(0, mentionStart);
  const after = text.slice(cursorPos);
  // Insertar marcador + espacio para fluidez de tipeo.
  const inserted = marker + " ";
  return { text: before + inserted + after, cursor: before.length + inserted.length };
}

export function MentionTextarea({
  value,
  onChange,
  candidatesEndpoint,
  empresaId,
  placeholder,
  rows = 2,
  className,
  autoFocus,
  required,
  disabled,
  id,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [candidates, setCandidates] = useState<MentionCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<{ start: number; query: string } | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const loadCandidates = useCallback(async () => {
    if (candidates !== null || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${candidatesEndpoint}?empresaId=${empresaId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data: MentionCandidate[] = await res.json();
        setCandidates(data);
      } else {
        setCandidates([]);
      }
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [candidatesEndpoint, empresaId, candidates, loading]);

  const filtered = useMemo(() => {
    if (!active || !candidates) return [];
    const q = active.query.toLowerCase().trim();
    if (!q) return candidates.slice(0, 8);
    return candidates
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [active, candidates]);

  // Reset highlight cuando cambia el filtro.
  useEffect(() => {
    setHighlighted(0);
  }, [active?.query, candidates]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    onChange(newText);
    const cursor = e.target.selectionStart ?? newText.length;
    const detected = detectActiveMention(newText, cursor);
    setActive(detected);
    if (detected) void loadCandidates();
  };

  const handleSelect = useCallback(
    (cand: MentionCandidate) => {
      if (!active || !ref.current) return;
      const cursor = ref.current.selectionStart ?? value.length;
      const marker = buildMencionMarker(cand);
      const { text, cursor: newCursor } = insertAtMention(value, active.start, cursor, marker);
      onChange(text);
      setActive(null);
      // Restaurar caret tras el insert (en el siguiente tick por React).
      setTimeout(() => {
        if (ref.current) {
          ref.current.focus();
          ref.current.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    },
    [active, value, onChange]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!active || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      handleSelect(filtered[highlighted]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActive(null);
    }
  };

  // Re-detectar mención cuando el caret cambia por click u arrows.
  const handleSelect2 = () => {
    if (!ref.current) return;
    const cursor = ref.current.selectionStart ?? value.length;
    const detected = detectActiveMention(value, cursor);
    setActive(detected);
    if (detected) void loadCandidates();
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={handleSelect2}
        onSelect={handleSelect2}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        required={required}
        disabled={disabled}
        className={className}
      />
      {active && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 sm:right-auto sm:min-w-[200px] mt-1 bg-wr-surface border border-wr-border rounded-md shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((c, i) => (
            <button
              key={`${c.kind}-${c.id}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // Evita perder el focus del textarea.
                handleSelect(c);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 ${
                i === highlighted ? "bg-wr-blue/15 text-wr-blue" : "text-wr-text hover:bg-wr-surface2"
              }`}
            >
              <span className={`text-[9px] uppercase tracking-wider px-1 rounded ${c.kind === "f" ? "bg-wr-amber/20 text-wr-amber" : "bg-wr-blue/20 text-wr-blue"}`}>
                {c.kind === "f" ? "Finder" : "Admin"}
              </span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      {active && filtered.length === 0 && candidates !== null && !loading && (
        <div className="absolute z-50 left-0 mt-1 bg-wr-surface border border-wr-border rounded-md shadow-lg px-2 py-1.5 text-[10px] text-wr-hint">
          Sin resultados para &ldquo;{active.query}&rdquo;
        </div>
      )}
    </div>
  );
}
