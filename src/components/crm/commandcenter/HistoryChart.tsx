import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface HistoryPoint {
  date: string;
  scheduled: number;
  completed: number;
}

interface HistoryChartProps {
  data: HistoryPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg px-3 py-2 text-xs shadow-lg">
      <p style={{ color: "#fff" }} className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export default function HistoryChart({ data }: HistoryChartProps) {
  // compute trend vs first point
  const first = data[0]?.scheduled ?? 1;
  const last = data[data.length - 1]?.scheduled ?? 0;
  const trendPct = Math.round(((last - first) / first) * 100);
  const trendLabel = trendPct > 0 ? `+${trendPct}%` : `${trendPct}%`;
  const trendColor = trendPct >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">Tendência 7 dias</span>
        <span className={`text-xs font-semibold ${trendColor}`}>
          {trendLabel} agendamentos vs semana anterior
        </span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }}
          />
          <Line
            type="monotone"
            dataKey="scheduled"
            name="Agendamentos"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#3b82f6" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="completed"
            name="Compareceram"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3, fill: "#10b981" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
