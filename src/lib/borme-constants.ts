/**
 * Canonical BORME tipo-acto labels, colors, and ordering.
 * Shared across PanelEmpresa, OperacionesBorme, and the daily summary page.
 */

export interface BormeTipoConfig {
  label: string;
  /** Tailwind classes for pill/badge rendering */
  pill: string;
  /** Tailwind class for a small colored dot indicator */
  dot: string;
}

export const BORME_TIPO: Record<string, BormeTipoConfig> = {
  fusion:              { label: "Fusión",        pill: "bg-purple-500/20 text-purple-300 border-purple-500/30",  dot: "bg-purple-400" },
  adquisicion:         { label: "Adquisición",   pill: "bg-wr-blue/20 text-wr-blue border-wr-blue/30",          dot: "bg-wr-blue" },
  posible_adquisicion: { label: "Posible adq.",  pill: "bg-orange-500/20 text-orange-300 border-orange-500/30",  dot: "bg-orange-400" },
  nombramiento_grupo:  { label: "Nombramiento",  pill: "bg-green-500/20 text-green-300 border-green-500/30",    dot: "bg-green-400" },
  nombramiento:        { label: "Nombramiento",  pill: "bg-green-500/20 text-green-300 border-green-500/30",    dot: "bg-green-400" },
  cambio_denominacion: { label: "Rebranding",    pill: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",  dot: "bg-yellow-400" },
  disolucion:          { label: "Disolución",    pill: "bg-red-500/20 text-red-300 border-red-500/30",          dot: "bg-red-400" },
  ampliacion_capital:  { label: "Amp. capital",  pill: "bg-teal-500/20 text-teal-300 border-teal-500/30",       dot: "bg-teal-400" },
  otros:               { label: "Otro acto",     pill: "bg-wr-surface2 text-wr-muted border-wr-border",         dot: "bg-wr-muted" },
};

export const BORME_TIPO_FALLBACK = BORME_TIPO.otros;

/** Resolve a tipoActo string to its config, falling back to "otros". */
export function getBormeTipo(tipoActo: string): BormeTipoConfig {
  return BORME_TIPO[tipoActo] ?? BORME_TIPO_FALLBACK;
}

/** Display ordering for tipo pills/summaries. */
export const BORME_TIPO_ORDER = [
  "fusion", "adquisicion", "posible_adquisicion",
  "cambio_denominacion", "nombramiento", "disolucion", "otros",
] as const;

/** Tipos that get a detail row in M&A tables. */
export const BORME_DETAIL_TIPOS = new Set([
  "fusion", "adquisicion", "posible_adquisicion",
]);
