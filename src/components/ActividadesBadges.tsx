import { ACTIVIDAD_LABEL, parseActividades } from "@/lib/actividades";

export function ActividadesBadges({ value }: { value: unknown }) {
  return <span className="inline-flex flex-wrap gap-1">{parseActividades(value).map((actividad) => (
    <span key={actividad} className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${actividad === "pci_pasiva" ? "border-orange-400/30 bg-orange-400/10 text-orange-300" : "border-wr-border bg-wr-surface2 text-wr-muted"}`}>
      {ACTIVIDAD_LABEL[actividad]}
    </span>
  ))}</span>;
}
