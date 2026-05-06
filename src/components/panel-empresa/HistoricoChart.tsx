import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { fmtMillions } from "@/lib/format";
import type { FinRow } from "./types";

export function HistoricoChart({ financieros }: { financieros: FinRow[] }) {
  // Orden cronológico ascendente para el eje X
  const data = [...financieros]
    .sort((a, b) => a.anio - b.anio)
    .map((f) => ({
      anio: String(f.anio),
      Ingresos: f.ingresos ?? 0,
      EBITDA: f.ebitda ?? 0,
      "EBITDA%": f.ebitdaPct != null ? Number(f.ebitdaPct.toFixed(1)) : null,
    }));

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#1a2035] border border-[#2d3548] rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-[#94a3b8] mb-1 font-medium">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span style={{ color: p.color }}>{p.name}:</span>
            <span className="text-[#e2e8f0] font-medium">
              {p.name === "EBITDA%"
                ? `${p.value.toFixed(1)}%`
                : `${fmtMillions(p.value)}€`}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mt-1 mb-2" style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 28, bottom: 0, left: 4 }}
          barCategoryGap="28%"
          barGap={3}
        >
          <CartesianGrid
            vertical={false}
            stroke="#2d3548"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="anio"
            tick={{ fill: "#4a5568", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          {/* Eje izquierdo: valores absolutos en M€ */}
          <YAxis
            yAxisId="abs"
            orientation="left"
            tickFormatter={(v) => `${fmtMillions(v)}`}
            tick={{ fill: "#4a5568", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          {/* Eje derecho: % EBITDA */}
          <YAxis
            yAxisId="pct"
            orientation="right"
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#4a5568", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={30}
            domain={[0, "auto"]}
          />
          <ReTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Legend
            iconSize={8}
            iconType="circle"
            formatter={(value) => (
              <span style={{ color: "#94a3b8", fontSize: 10 }}>{value}</span>
            )}
          />
          <Bar
            yAxisId="abs"
            dataKey="Ingresos"
            fill="#3b82f6"
            radius={[2, 2, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            yAxisId="abs"
            dataKey="EBITDA"
            fill="#22c55e"
            radius={[2, 2, 0, 0]}
            maxBarSize={22}
            fillOpacity={0.85}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="EBITDA%"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
