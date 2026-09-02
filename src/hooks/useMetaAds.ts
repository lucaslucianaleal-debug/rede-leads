import { useState, useEffect, useCallback } from "react";
import type { Campaign, CampaignDecisionCycle, CampaignOperationalEvent, CampaignScaleEvent, PeriodType } from "@/types/commandCenter";
import type { Diagnostic } from "@/types/commandCenter";
import { fetchCampaigns, createCampaign, upsertDailyMetric, updateCampaign, deleteDailyMetric, deleteCampaign } from "@/services/campaignService";
import type { CampaignDailyMetric } from "@/types/commandCenter";
import { auth } from "@/lib/firebase";

export function useMetaAds(unitId?: string, clinicId = "odontocompany-olimpia", ticketMedio = 1800, period: PeriodType = 'operacao') {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [metaSyncing, setMetaSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCampaigns(clinicId, ticketMedio, period);
      setCampaigns(data);
    } catch (e) {
      console.error("useMetaAds error:", e);
    } finally {
      setLoading(false);
    }
  }, [clinicId, ticketMedio, period]);

  useEffect(() => { load(); }, [load]);

  // Derived diagnostics from real data
  const diagnostics: Diagnostic[] = [];
  const active = campaigns.filter(c => c.active);
  if (active.length > 0) {
    const best = [...active].sort((a, b) => b.predictability - a.predictability)[0];
    const worst = [...active].filter(c => c.totalSpend > 0).sort((a, b) => a.predictability - b.predictability)[0];
    if (worst && worst.predictability < 20 && worst.totalSpend > 0) {
      diagnostics.push({ type: "crit", title: `${worst.name}: previsibilidade ${worst.predictability}% — funil fraco`, description: `R$${worst.totalSpend.toLocaleString("pt-BR")} gastos, ${worst.leads} leads e ${worst.completed} comparecimentos. Reveja segmentação, criativo e atendimento.`, action: "Pausar campanha", actionId: "pause_campaign" });
    }
    if (best && best.predictability >= 40) {
      diagnostics.push({ type: "ok", title: `${best.name}: previsibilidade ${best.predictability}% — funil saudável`, description: `${best.leads} leads, ${best.scheduled} agendamentos e ${best.completed} comparecimentos. Campanha com leitura mais confiável.` });
    }
    const overBudget = active.find(c => c.budget > 0 && c.totalSpend / c.budget > 0.9);
    if (overBudget) {
      diagnostics.push({ type: "imp", title: `${overBudget.name}: ${Math.round((overBudget.totalSpend / overBudget.budget) * 100)}% do budget usado`, description: `Spend atual: R$${overBudget.totalSpend.toLocaleString("pt-BR")} de R$${overBudget.budget.toLocaleString("pt-BR")} planejado.` });
    }
  }

  const handleAddCampaign = async (data: { name: string; dateStart: string; dateEnd: string; budget: number; dailyBudget?: number; fundsAdded?: number; taxCost?: number }) => {
    await createCampaign(clinicId, data);
  };

  const handleSaveCampaignFinance = async (campaignId: string, data: { fundsAdded: number; taxCost: number; dailyBudget?: number; lastBudgetChangeAt?: string; scaleHistory?: CampaignScaleEvent[]; scaleCycleState?: 'idle' | 'aguardando_dados' | 'pronto_reavaliar'; cycles?: CampaignDecisionCycle[]; events?: CampaignOperationalEvent[]; activeCycleId?: string }) => {
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

  const handleDeleteCampaign = async (campaignId: string) => {
    await deleteCampaign(clinicId, campaignId);
    await load();
  };

  const handleSyncMetaAds = async () => {
    if (metaSyncing) return;
    const user = auth.currentUser;
    if (!user) {
      window.alert("Sua sessão expirou. Entre novamente para sincronizar o Meta Ads.");
      return;
    }

    setMetaSyncing(true);
    try {
      const idToken = await user.getIdToken();

      const callSync = async (adAccountId?: string) => {
        const response = await fetch("/api/meta/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ clinicId, adAccountId }),
        });
        const payload = await response.json().catch(() => ({}));
        return { response, payload };
      };

      let result = await callSync();

      if (!result.response.ok && result.payload?.code === "META_ACCOUNT_NOT_CONFIGURED") {
        const accountInput = window.prompt(
          "Informe o ID da conta de anúncios da Meta para esta clínica (ex.: 751127997357262 ou act_751127997357262):"
        );
        if (!accountInput?.trim()) return;
        result = await callSync(accountInput.trim());
      }

      if (!result.response.ok) {
        if (result.payload?.code === "META_ACCESS_TOKEN_MISSING") {
          throw new Error("A conexão do Meta ainda não tem o token configurado no servidor.");
        }
        throw new Error(result.payload?.message || "Falha ao sincronizar Meta Ads");
      }

      const s = result.payload || {};
      const errorSuffix = Array.isArray(s.errors) && s.errors.length > 0
        ? `\n\nAtenção: ${s.errors.length} anúncio(s) tiveram erro e foram ignorados nesta rodada.`
        : "";

      window.alert(
        `Meta Ads sincronizada.\n\n` +
        `Anúncios ativos encontrados: ${s.activeAds ?? 0}\n` +
        `Campanhas já vinculadas: ${s.linkedExisting ?? 0}\n` +
        `Novas campanhas criadas: ${s.createdCampaigns ?? 0}\n` +
        `Dias novos adicionados: ${s.metricsAdded ?? 0}\n` +
        `Dias Meta atualizados: ${s.metricsUpdated ?? 0}\n` +
        `Dias manuais preservados: ${s.manualMetricsPreserved ?? 0}` +
        errorSuffix
      );

      await load();
    } catch (error) {
      console.error("Meta sync error:", error);
      window.alert(error instanceof Error ? error.message : "Erro ao sincronizar Meta Ads.");
    } finally {
      setMetaSyncing(false);
    }
  };

  return {
    campaigns,
    diagnostics,
    loading,
    metaSyncing,
    reload: load,
    handleAddCampaign,
    handleSaveDailyMetric,
    handleDeleteDailyMetric,
    handleSaveCampaignFinance,
    handleToggleActive,
    handleDeleteCampaign,
    handleSyncMetaAds,
  };
}
