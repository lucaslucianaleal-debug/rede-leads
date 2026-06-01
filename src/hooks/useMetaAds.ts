import { useState, useEffect, useCallback } from "react";
import type { Campaign } from "@/types/commandCenter";
import type { Diagnostic } from "@/types/commandCenter";
import { fetchCampaigns, createCampaign, upsertDailyMetric, updateCampaign, deleteDailyMetric } from "@/services/campaignService";
import type { CampaignDailyMetric } from "@/types/commandCenter";

export function useMetaAds(unitId?: string, clinicId = "odontocompany-olimpia", ticketMedio = 1800, period: 'hoje' | 'semana' | 'mes' = 'mes') {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCampaigns(clinicId, ticketMedio);
      setCampaigns(data);
    } catch (e) {
      console.error("useMetaAds error:", e);
    } finally {
      setLoading(false);
    }
  }, [clinicId, ticketMedio]);

  useEffect(() => { load(); }, [load]);

  // Derived diagnostics from real data
  const diagnostics: Diagnostic[] = [];
  const active = campaigns.filter(c => c.active);
  if (active.length > 0) {
    const best = [...active].sort((a, b) => b.roas - a.roas)[0];
    const worst = [...active].filter(c => c.totalSpend > 0).sort((a, b) => a.roas - b.roas)[0];
    if (worst && worst.roas < 2 && worst.totalSpend > 0) {
      diagnostics.push({ type: "crit", title: `${worst.name}: ROAS ${worst.roas.toFixed(1)}x — budget queimando`, description: `R$${worst.totalSpend.toLocaleString("pt-BR")} gastos, ${worst.completed} comparecimentos. Considere pausar ou revisar o criativo.`, action: "Pausar campanha", actionId: "pause_campaign" });
    }
    if (best && best.roas >= 5) {
      diagnostics.push({ type: "ok", title: `${best.name}: ROAS ${best.roas.toFixed(1)}x — excelente resultado`, description: `${best.leads} leads, ${best.completed} comparecimentos. Considere aumentar o budget desta campanha.` });
    }
    const overBudget = active.find(c => c.budget > 0 && c.totalSpend / c.budget > 0.9);
    if (overBudget) {
      diagnostics.push({ type: "imp", title: `${overBudget.name}: ${Math.round((overBudget.totalSpend / overBudget.budget) * 100)}% do budget usado`, description: `Spend atual: R$${overBudget.totalSpend.toLocaleString("pt-BR")} de R$${overBudget.budget.toLocaleString("pt-BR")} planejado.` });
    }
  }

  const handleAddCampaign = async (data: { name: string; dateStart: string; dateEnd: string; budget: number; fundsAdded?: number; taxCost?: number }) => {
    await createCampaign(clinicId, data);
  };

  const handleSaveCampaignFinance = async (campaignId: string, data: { fundsAdded: number; taxCost: number }) => {
    await updateCampaign(clinicId, campaignId, data);
    await load();
  };

  const handleSaveDailyMetric = async (campaignId: string, metric: CampaignDailyMetric) => {
    await upsertDailyMetric(clinicId, campaignId, metric);
    await load();
  };

  const handleDeleteDailyMetric = async (campaignId: string, date: string) => {
    await deleteDailyMetric(clinicId, campaignId, date);
    await load();
  };

  const handleToggleActive = async (campaignId: string, active: boolean) => {
    await updateCampaign(clinicId, campaignId, { active });
    await load();
  };

  return {
    campaigns,
    diagnostics,
    loading,
    reload: load,
    handleAddCampaign,
    handleSaveDailyMetric,
    handleDeleteDailyMetric,
    handleSaveCampaignFinance,
    handleToggleActive,
  };
}
