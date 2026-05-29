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
  const w = 140;
  const h = 24;
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
      <polyline points={points} fill="none" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
    </svg>
  );
}

export const KPIExecutiveCard: React.FC<KPIExecutiveCardProps> = ({ title, value, delta, deltaDirection = "neutral", subtitle, sparkline }) => {
  const deltaColor = deltaDirection === "up" ? "text-emerald-600 bg-emerald-50" : deltaDirection === "down" ? "text-rose-600 bg-rose-50" : "text-muted-foreground bg-transparent";
  return (
    <div className="relative overflow-hidden" style={{ minHeight: 140 }}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-black/2 pointer-events-none" />
      <div className="bg-card p-5 rounded-[12px] shadow-[0_8px_30px_rgba(16,24,40,0.06)] hover:shadow-[0_12px_40px_rgba(16,24,40,0.09)] transition-shadow duration-250 ease-out h-full flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground tracking-wide">{title}</div>
            <div className="mt-1 text-[28px] md:text-[32px] lg:text-[36px] font-extrabold text-foreground leading-tight">{value}</div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            {delta !== undefined && (
              <div className={`px-2 py-1 rounded-full text-xs font-semibold ${deltaColor}`}>{delta}</div>
            )}
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex-1 max-w-[160px]">
            <div style={{ height: 24 }} className="overflow-hidden">
              <Sparkline data={sparkline || []} />
            </div>
          </div>
          <div className="ml-4 text-xs text-muted-foreground">&nbsp;</div>
        </div>
      </div>
    </div>
  );
};

export default KPIExecutiveCard;
