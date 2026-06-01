import React from "react";
import type { KPI } from "@/types/commandCenter";

interface KPIStripProps {
  kpis: KPI[];
  loading?: boolean;
}

const statusClasses: Record<KPI["status"], string> = {
  bad: "bg-red-500/10 border-red-500/30 text-red-400",
  warn: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  good: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  meta: "bg-blue-600/10 border-blue-600/30 text-blue-300",
  wa: "bg-green-500/10 border-green-500/30 text-green-400",
  neutral: "bg-muted/40 border-border text-muted-foreground",
};

const valueSizeClass = (status: KPI["status"]) =>
  status === "bad" || status === "warn"
    ? "text-2xl font-bold"
    : "text-xl font-semibold";

export default function KPIStrip({ kpis, loading }: KPIStripProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-muted/30 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {kpis.map((kpi, i) => (
        <div
          key={i}
          className={`rounded-xl border p-3 flex flex-col gap-0.5 transition-all hover:shadow-md ${statusClasses[kpi.status]}`}
        >
          <span className="text-[10px] font-medium uppercase tracking-wider opacity-70 leading-none">{kpi.label}</span>
          <span className={`${valueSizeClass(kpi.status)} leading-tight mt-1`}>{kpi.value}</span>
          {kpi.delta && <span className="text-[10px] opacity-80 mt-0.5">{kpi.delta}</span>}
          {kpi.sub && !kpi.delta && <span className="text-[10px] opacity-60">{kpi.sub}</span>}
        </div>
      ))}
    </div>
  );
}
