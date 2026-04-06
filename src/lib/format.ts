// ─── Shared formatting helpers ───────────────────────────────────────────────
// Centralised so every component uses the same logic.

/** Format a number with Spanish locale. */
export function fmt(
  n: number | null | undefined,
  decimals = 0,
  fallback = "n.a.",
): string {
  if (n === null || n === undefined) return fallback;
  return n.toLocaleString("es-ES", { maximumFractionDigits: decimals });
}

/** Format a monetary value as K€ / M€. */
export function fmtM(
  n: number | null | undefined,
  fallback = "n.a.",
): string {
  if (n === null || n === undefined) return fallback;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K€`;
  return `${n.toLocaleString("es-ES")}€`;
}

/** Format a percentage with one decimal. */
export function fmtPct(
  n: number | null | undefined,
  fallback = "n.a.",
): string {
  if (n === null || n === undefined) return fallback;
  return `${n.toFixed(1)}%`;
}

/** Format an ISO date string to Spanish locale (e.g. "04 abr 2026"). */
export function fmtDate(
  d: string | null | undefined,
  fallback = "n.a.",
): string {
  if (!d) return fallback;
  return new Date(d).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Short date format for BORME-style rows (e.g. "04 abr 26"). */
export function fmtFechaShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

/** Format a raw number as millions (e.g. "1.2M"). No currency symbol. */
export function fmtMillions(v: number): string {
  return `${(v / 1_000_000).toFixed(1)}M`;
}
