import React from "react";
import type { UnitRanking } from "@/types/commandCenter";

interface UnitsRankingSectionProps {
  units: UnitRanking[];
}

export default function UnitsRankingSection({ units }: UnitsRankingSectionProps) {
  // Sort by showUpRate descending
  const sorted = [...units].sort((a, b) => b.showUpRate - a.showUpRate);

  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      <div className="mb-4">
        <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Ranking de unidades</h4>
        <p style={{ color: "#666", fontSize: "11px" }} className="mt-1">Performance % comparecimento</p>
      </div>

      <div className="space-y-3">
        {sorted.map((unit, idx) => {
          const showUpRate = unit.showUpRate;
          const isGood = showUpRate >= 50;
          const isWarning = showUpRate >= 40 && showUpRate < 50;
          const isBad = showUpRate < 40;

          let barColor = "#10b981"; // green
          if (isWarning) barColor = "#f59e0b"; // yellow
          if (isBad) barColor = "#ef4444"; // red

          return (
            <div key={unit.id}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p style={{ color: "#fff", fontSize: "12px" }} className="font-medium">
                    {idx + 1}. {unit.name}
                  </p>
                  <p style={{ color: "#666", fontSize: "10px" }} className="mt-0.5">
                    {unit.leadsPerDay} leads/dia • {unit.comparison}
                  </p>
                </div>
                <span style={{ color: barColor, fontSize: "12px" }} className="font-bold">
                  {showUpRate}%
                </span>
              </div>

              {/* Bar */}
              <div className="w-full h-1.5 rounded-full" style={{ background: "#333" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${showUpRate}%`, background: barColor }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Meta reference */}
      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "0.5px solid #3a3a3a" }}>
        <span style={{ color: "#999", fontSize: "10px" }}>Meta geral</span>
        <span style={{ color: "#10b981", fontSize: "11px", fontWeight: "600" }}>50%</span>
      </div>
    </div>
  );
}
