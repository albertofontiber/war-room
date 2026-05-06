import { BORME_TIPO } from "@/lib/borme-constants";

/** Pill compacta con el label del tipo BORME. Cae a estilos por defecto si el
 *  tipo no está en `BORME_TIPO` (defensa contra valores inesperados). */
export function TipoPill({ tipo }: { tipo: string }) {
  const cfg = BORME_TIPO[tipo] ?? {
    label: tipo,
    pill: "bg-wr-surface2 text-wr-muted border-wr-border",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap ${cfg.pill}`}
    >
      {cfg.label}
    </span>
  );
}
