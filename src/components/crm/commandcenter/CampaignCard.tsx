import React from "react";
import type { Campaign } from "@/types/commandCenter";

interface CampaignCardProps {
  campaigns: Campaign[];
}

export default function CampaignCard({ campaigns }: CampaignCardProps) {
  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Campanhas Meta Ads</h4>
        <div className="flex gap-2 text-[10px] text-[#999]">
          <span>Leads</span>
          <span>Agend.</span>
          <span>ROAS</span>
        </div>
      </div>

      <div className="space-y-2">
        {campaigns.map(c => {
          const maxLeads = Math.max(...campaigns.map(x => x.leads), 1);
          const barPct = Math.round((c.leads / maxLeads) * 100);
          const isProblematic = c.roas < 1 || !c.active;

          return (
            <div key={c.id} style={{ background: isProblematic ? "#3a2a2a" : "#323232", border: `0.5px solid ${isProblematic ? "#5a3a3a" : "#3a3a3a"}` }} className="flex items-center gap-3 p-2.5 rounded-lg">
              {/* Dot + name */}
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span style={{ color: "#fff", fontSize: "12px" }} className="font-medium truncate">{c.name}</span>
                  {!c.active && (
                    <span style={{ background: "#333", color: "#999", fontSize: "9px" }} className="px-1.5 py-0.5 rounded uppercase font-bold">pausada</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-[#333] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: c.color }} />
                  </div>
                  <span style={{ color: "#999", fontSize: "10px" }} className="whitespace-nowrap">{c.responseTime}min resp.</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                <span style={{ color: "#999" }} className="w-8 text-center">{c.leads}</span>
                <span style={{ color: "#999" }} className="w-8 text-center">{c.scheduled}</span>
                <span style={{ color: c.roas >= 3 ? "#10b981" : c.roas >= 1.5 ? "#f59e0b" : "#ef4444" }} className="w-12 text-center font-bold">
                  {c.roas > 0 ? `${c.roas.toFixed(1)}x` : "0.0x"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
