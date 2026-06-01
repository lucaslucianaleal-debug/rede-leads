import React from "react";
import type { FunnelData } from "@/types/commandCenter";

interface FunnelCardProps {
  funnel: FunnelData;
}

export default function FunnelCard({ funnel }: FunnelCardProps) {
  const maxVal = funnel.leads || 1;
  const bars = [
    { label: "leads", value: funnel.leads, color: "bg-blue-500" },
    { label: "agendados", value: funnel.scheduled, color: "bg-violet-500" },
    { label: "vieram", value: funnel.completed, color: "bg-emerald-500" },
  ];

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold">Funil acumulado jan–mai/26</h4>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-4 h-24 mb-2">
        {bars.map(b => {
          const pct = Math.round((b.value / maxVal) * 100);
          return (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-sm font-bold">{b.value.toLocaleString("pt-BR")}</span>
              <div className="w-full flex items-end" style={{ height: "56px" }}>
                <div
                  className={`w-full rounded-t-md ${b.color}`}
                  style={{ height: `${Math.max(4, pct)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{b.label}</span>
            </div>
          );
        })}

        {/* Stats sidebar */}
        <div className="flex flex-col gap-2 pl-4 border-l border-border/50 text-xs min-w-[120px]">
          <div>
            <span className="text-muted-foreground">Conv. leads → agend:</span>
            <span className={`ml-1 font-bold ${parseFloat(funnel.conversionRate) >= 45 ? "text-emerald-400" : "text-amber-400"}`}>
              {funnel.conversionRate} {parseFloat(funnel.conversionRate) >= 45 ? "✅" : "⚠️"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Agend → compareceu:</span>
            <span className={`ml-1 font-bold ${parseFloat(funnel.showUpRate) >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
              {funnel.showUpRate} {parseFloat(funnel.showUpRate) >= 50 ? "✅" : "⚠️"} meta: 50%
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Gargalo real:</span>
            <span className="ml-1 font-bold text-red-400">{funnel.bottleneck}, não conversão</span>
          </div>
        </div>
      </div>
    </div>
  );
}
