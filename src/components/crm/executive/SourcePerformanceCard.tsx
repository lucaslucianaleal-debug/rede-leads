import React from "react";

export const SourcePerformanceCard: React.FC<{ source: string; cac?: number; roi?: number; conversion?: number }> = ({ source, cac, roi, conversion }) => {
  const donut = (
    <svg width="48" height="48" viewBox="0 0 36 36" className="inline-block">
      <path d="M18 2.0845a15.9155 15.9155 0 1 0 0 31.831A15.9155 15.9155 0 1 0 18 2.0845" fill="#f1f5f9" />
      <path d="M18 2.0845a15.9155 15.9155 0 0 1 11.313 27.247" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  return (
    <div className="bg-card rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {donut}
          <div>
            <div className="text-sm font-semibold">{source}</div>
            <div className="text-xs text-muted-foreground">Qualidade da fonte</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{cac !== undefined ? `R$ ${cac}` : '—'}</div>
          <div className="text-xs text-muted-foreground">ROI: {roi !== undefined ? `${roi}%` : '—'}</div>
        </div>
      </div>
    </div>
  );
};

export default SourcePerformanceCard;
