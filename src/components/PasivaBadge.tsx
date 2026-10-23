export function PasivaBadge({ value }: { value: boolean | null | undefined }) {
  if (value !== true) return null;
  return (
    <span className="inline-flex rounded border border-orange-400/30 bg-orange-400/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-300" title="Actividad de protección pasiva confirmada; fuentes en la ficha">
      Pasiva
    </span>
  );
}
