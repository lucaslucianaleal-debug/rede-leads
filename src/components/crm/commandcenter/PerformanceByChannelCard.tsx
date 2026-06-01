import React from "react";
import type { PerformanceChannel } from "@/types/commandCenter";

interface PerformanceByChannelCardProps {
  channels: PerformanceChannel[];
}

export default function PerformanceByChannelCard({ channels }: PerformanceByChannelCardProps) {
  const statusColors = {
    good: { text: "#10b981", bg: "#2a3a2a", border: "#3a5a3a" },
    warning: { text: "#f59e0b", bg: "#3a3a2a", border: "#5a5a3a" },
    bad: { text: "#ef4444", bg: "#3a2a2a", border: "#5a3a3a" },
    critical: { text: "#ef4444", bg: "#3a2a2a", border: "#5a3a3a" },
  };

  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      <div className="mb-4">
        <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Performance por canal</h4>
      </div>

      <div className="space-y-2">
        {channels && channels.length > 0 ? (
          channels.map(c => {
            const cfg = statusColors[c.status as keyof typeof statusColors] || statusColors.warning;
            return (
              <div
                key={c.id}
                style={{ background: cfg.bg, border: `0.5px solid ${cfg.border}` }}
                className="rounded-lg p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5 flex-1">
                  <span style={{ fontSize: "16px" }}>{c.icon}</span>
                  <div className="min-w-0">
                    <p style={{ color: "#fff", fontSize: "12px" }} className="font-medium truncate">
                      {c.name}
                    </p>
                    <p style={{ color: "#666", fontSize: "10px" }} className="mt-0.5">
                      {c.leads} leads
                    </p>
                  </div>
                </div>

                {/* Conversion rate */}
                <div className="text-right shrink-0">
                  <p style={{ color: cfg.text, fontSize: "13px" }} className="font-bold">
                    {c.conversionRate}
                  </p>
                  <p style={{ color: "#666", fontSize: "9px" }} className="mt-0.5">
                    conversão
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p style={{ color: "#666", fontSize: "12px" }} className="text-center py-4">Carregando dados...</p>
        )}
      </div>

      {/* Footer stats */}
      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "0.5px solid #3a3a3a" }}>
        <span style={{ color: "#999", fontSize: "10px" }}>Total de canais</span>
        <span style={{ color: "#378ADD", fontSize: "11px", fontWeight: "600" }}>{channels?.length || 0} ativos</span>
      </div>
    </div>
  );
}
