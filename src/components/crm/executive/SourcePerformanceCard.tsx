import React from "react";

export const SourcePerformanceCard: React.FC<{ source: string; cac?: number; roi?: number; conversion?: number }> = ({ source, cac, roi, conversion }) => {
  return (
    <div className="bg-card rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{source}</div>
        <div className="text-xs text-muted-foreground">CAC</div>
      </div>
      <div className="mt-2">
        <div className="text-lg font-semibold">{cac !== undefined ? `R$ ${cac}` : '—'}</div>
        <div className="text-xs text-muted-foreground">ROI: {roi !== undefined ? `${roi}%` : '—'} • Conv.: {conversion !== undefined ? `${conversion}%` : '—'}</div>
      </div>
    </div>
  );
};

export default SourcePerformanceCard;
