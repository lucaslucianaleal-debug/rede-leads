import React from "react";
import type { Campaign } from "@/types/commandCenter";

interface CampaignCardProps {
  campaigns: Campaign[];
}

export default function CampaignCard({ campaigns }: CampaignCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold">Campanhas Meta Ads</h4>
        <div className="flex gap-2 text-[10px] text-muted-foreground">
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
            <div key={c.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${isProblematic ? "border-red-500/30 bg-red-500/5" : "border-border/30 bg-muted/20"}`}>
              {/* Dot + name */}
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{c.name}</span>
                  {!c.active && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-bold">pausada</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: c.color }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{c.responseTime}min resp.</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                <span className="text-muted-foreground w-8 text-center">{c.leads}</span>
                <span className="text-muted-foreground w-8 text-center">{c.scheduled}</span>
                <span className={`w-12 text-center font-bold ${c.roas >= 3 ? "text-emerald-400" : c.roas >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
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
