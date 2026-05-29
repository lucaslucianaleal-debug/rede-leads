import React from "react";

export const PerformanceBarCard: React.FC<{ label: string; value: number; max?: number }> = ({ label, value, max = 100 }) => {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="bg-card rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
      </div>
      <div className="mt-3 h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-3 bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">Eficiência • conversão visual</div>
    </div>
  );
};

export default PerformanceBarCard;
