import React from "react";

type KPIExecutiveCardProps = {
  title: string;
  value: string | number;
  delta?: string | number;
  deltaDirection?: "up" | "down" | "neutral";
  subtitle?: string;
  sparkline?: number[];
};

function Sparkline({ data = [] }: { data?: number[] }) {
  const w = 120;
  const h = 28;
  if (!data || data.length === 0) return <svg width={w} height={h} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1, max - min);
  const step = w / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
      <polyline points={points} fill="none" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}

export const KPIExecutiveCard: React.FC<KPIExecutiveCardProps> = ({ title, value, delta, deltaDirection = "neutral", subtitle, sparkline }) => {
  const deltaColor = deltaDirection === "up" ? "text-green-600" : deltaDirection === "down" ? "text-rose-600" : "text-muted-foreground";
  return (
    <div className="bg-card p-4 rounded-lg shadow-sm flex flex-col justify-between" style={{ minHeight: 96 }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
        </div>
        <div className="text-right">
          {delta !== undefined && (
            <div className={`text-sm font-medium ${deltaColor}`}>{delta}</div>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="shrink-0">
          <Sparkline data={sparkline || []} />
        </div>
        <div className="text-xs text-muted-foreground ml-3">{subtitle}</div>
      </div>
    </div>
  );
};

export default KPIExecutiveCard;
