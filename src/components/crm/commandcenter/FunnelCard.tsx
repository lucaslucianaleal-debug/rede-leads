import React from "react";
import type { FunnelData } from "@/types/commandCenter";

interface FunnelCardProps {
  funnel: FunnelData;
}

export default function FunnelCard({ funnel }: FunnelCardProps) {
  const maxVal = funnel.leads || 1;
  const bars = [
    { label: "leads", value: funnel.leads, color: "#378ADD" },
    { label: "agendados", value: funnel.scheduled, color: "#534AB7" },
    { label: "vieram", value: funnel.completed, color: "#1D9E75" },
  ];

  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Funil acumulado jan–mai/26</h4>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-4 h-24 mb-2">
        {bars.map(b => {
          const pct = Math.round((b.value / maxVal) * 100);
          return (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
              <span style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">{b.value.toLocaleString("pt-BR")}</span>
              <div className="w-full flex items-end" style={{ height: "56px" }}>
                <div
                  style={{ background: b.color, height: `${Math.max(4, pct)}%` }}
                  className="w-full rounded-t-md"
                />
              </div>
              <span style={{ color: "#999", fontSize: "10px" }}>{b.label}</span>
            </div>
          );
        })}

        {/* Stats sidebar */}
        <div className="flex flex-col gap-2 pl-4" style={{ borderLeft: "0.5px solid #3a3a3a" }}>
          <div style={{ fontSize: "12px" }}>
            <span style={{ color: "#999" }}>Conv. leads → agend:</span>
            <span style={{ color: parseFloat(funnel.conversionRate) >= 45 ? "#10b981" : "#f59e0b", marginLeft: "4px" }} className="font-bold">
              {funnel.conversionRate} {parseFloat(funnel.conversionRate) >= 45 ? "✅" : "⚠️"}
            </span>
          </div>
          <div style={{ fontSize: "12px" }}>
            <span style={{ color: "#999" }}>Agend → compareceu:</span>
            <span style={{ color: parseFloat(funnel.showUpRate) >= 50 ? "#10b981" : "#f59e0b", marginLeft: "4px" }} className="font-bold">
              {funnel.showUpRate} {parseFloat(funnel.showUpRate) >= 50 ? "✅" : "⚠️"} meta: 50%
            </span>
          </div>
          <div style={{ fontSize: "12px" }}>
            <span style={{ color: "#999" }}>Gargalo real:</span>
            <span style={{ color: "#ef4444", marginLeft: "4px" }} className="font-bold">{funnel.bottleneck}, não conversão</span>
          </div>
        </div>
      </div>
    </div>
  );
}
