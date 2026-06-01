import React from "react";
import type { Diagnostic } from "@/types/commandCenter";
import { useMetaAds } from "@/hooks/useMetaAds";
import DiagnosticCard from "../commandcenter/DiagnosticCard";
import CampaignCard from "../commandcenter/CampaignCard";

interface MetaAdsLayerProps {
  diagnostics: Diagnostic[];
  unit?: string;
  onAction?: (actionId: string) => void;
}

export default function MetaAdsLayer({ diagnostics, unit, onAction }: MetaAdsLayerProps) {
  const { campaigns, totalLeads, totalScheduled, avgRoas, bestCampaign, worstCampaign } = useMetaAds(unit);

  return (
    <div className="space-y-4">
      {/* Diagnóstico Meta */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          DIAGNÓSTICO META ADS
        </div>
        <DiagnosticCard diagnostics={diagnostics.slice(0, 4)} onAction={onAction} />
      </div>

      {/* Resumo CAC/ROAS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Leads totais</p>
          <p className="text-2xl font-bold mt-1">{totalLeads}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Agendados</p>
          <p className="text-2xl font-bold mt-1">{totalScheduled}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Melhor canal</p>
          <p className="text-base font-bold text-emerald-400 mt-1">{bestCampaign?.name ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">ROAS {bestCampaign?.roas.toFixed(1)}x</p>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pausar agora</p>
          <p className="text-base font-bold text-red-400 mt-1">{worstCampaign?.roas === 0 ? worstCampaign.name : "—"}</p>
          <p className="text-[10px] text-muted-foreground">ROAS {worstCampaign?.roas.toFixed(1)}x</p>
        </div>
      </div>

      {/* Tabela campanhas */}
      <CampaignCard campaigns={campaigns} />

      {/* CAC real explainer */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-300">
        <strong>CAC real</strong> = custo da campanha ÷ pacientes que sentaram na cadeira (não custo por lead).
        Integre sua conta Meta Business para calcular automaticamente.
      </div>
    </div>
  );
}
