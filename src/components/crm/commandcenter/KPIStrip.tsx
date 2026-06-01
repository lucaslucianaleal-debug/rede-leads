import React from "react";
import type { KPI } from "@/types/commandCenter";

interface KPIStripProps {
  kpis: KPI[];
  loading?: boolean;
}

const statusColors = {
  good: "#10b981",
  bad: "#ef4444",
  warn: "#f59e0b",
  info: "#3b82f6",
  neutral: "#6b7280",
  meta: "#3b82f6",
  wa: "#10b981",
};

export default function KPIStrip({ kpis, loading }: KPIStripProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ background: "white", border: "0.5px solid #ccc" }} className="rounded-lg p-4 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-3">
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
              style={{ color, fontSize: "24px", fontWeight: "700" }}
              className="mb-1 leading-none"
            >
              {kpi.value}
            </p>
            {kpi.delta && (
              <p className="text-[10px] text-[#999] font-normal">{kpi.delta}</p>
            )}
            {kpi.sub && (
              <p className="text-[10px] text-[#999] font-normal">{kpi.sub}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
