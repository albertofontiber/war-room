import type React from "react";

export function TendenciaArrow({
  dir,
  pct,
}: {
  dir: "up" | "flat" | "down" | null;
  pct: number | null;
}) {
  if (!dir || dir === "flat")
    return <span className="text-wr-muted text-xs">→</span>;
  if (dir === "up")
    return (
      <span className="text-wr-green text-xs">
        ↑ {pct !== null ? `+${pct.toFixed(1)}%` : ""}
      </span>
    );
  return (
    <span className="text-wr-red text-xs">
      ↓ {pct !== null ? `${pct.toFixed(1)}%` : ""}
    </span>
  );
}

export function Initials({ nombre }: { nombre: string }) {
  const parts = nombre.split(" ").filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <div className="w-12 h-12 rounded-lg bg-wr-blue/20 border border-wr-blue/30 text-wr-blue text-lg font-bold flex items-center justify-center flex-shrink-0">
      {initials}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-wr-muted uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

export function KpiRow({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-wr-hint text-xs">{label}</span>
      <span className="text-wr-text text-xs font-medium flex items-center gap-1.5">
        {value}
        {trend}
      </span>
    </div>
  );
}
