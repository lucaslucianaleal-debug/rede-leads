import React from "react";

export const PerformanceBarCard: React.FC<{ label: string; value: number; max?: number }> = ({ label, value, max = 100 }) => {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="bg-card rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-2 bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default PerformanceBarCard;
