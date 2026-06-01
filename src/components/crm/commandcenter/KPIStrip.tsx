import React from "react";
import type { KPI } from "@/types/commandCenter";

interface KPIStripProps {
  kpis: KPI[];
  loading?: boolean;
}

const statusColors: Record<string, string> = {
  good: "#10b981",
  bad: "#ef4444",
  warn: "#f59e0b",
  info: "#3b82f6",
  neutral: "#6b7280",
  meta: "#3b82f6",
  wa: "#10b981",
};

function deltaColor(delta?: string): string {
  if (!delta) return "#666";
  if (delta.startsWith("▲")) return "#10b981";
  if (delta.startsWith("▼")) return "#ef4444";
  return "#666";
}

export default function KPIStrip({ kpis, loading }: KPIStripProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: "white", border: "0.5px solid #ccc" }} className="rounded-lg p-4 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  const cols = kpis.length <= 4 ? 4 : 5;

  return (
    <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {kpis.map((kpi, i) => {
        const color = statusColors[kpi.status] || "#000";
        return (
          <div
            key={i}
            style={{
              background: "white",
              border: "0.5px solid #ccc",
              color: "#000",
            }}
            className="rounded-lg p-4"
          >
            <p className="text-[10px] text-[#999] font-normal mb-2">{kpi.label}</p>
            <p
              style={{ color, fontSize: "22px", fontWeight: "700" }}
              className="mb-1 leading-none"
            >
              {kpi.value}
            </p>
            {kpi.delta && (
              <p style={{ color: deltaColor(kpi.delta), fontSize: "10px", fontWeight: "600" }} className="mt-1">
                {kpi.delta}
              </p>
            )}
            {kpi.sub && (
              <p className="text-[10px] text-[#aaa] font-normal mt-0.5">{kpi.sub}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
