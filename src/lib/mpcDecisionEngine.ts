import type { Campaign, CampaignDailyMetric } from "@/types/commandCenter";

export type CampaignAction =
  | "escalar_20"
  | "escalar_30"
  | "manter"
  | "aguardar_dados"
  | "otimizar"
  | "pausar";

export type CampaignStatus =
  | "aprendizado"
  | "validando"
  | "escala"
  | "otimizacao"
  | "pausar";

export interface CampaignDecision {
  status: CampaignStatus;
  action: CampaignAction;
  title: string;
  emoji: string;
  color: string;
  recommendation: string;
  reasons: string[];
  nextReview: string;
  confidence: "baixa" | "media" | "alta";
}

const TARGETS = {
  cpl: 8,
  cacAgendamento: 20,
  cacComparecimento: 80,
  showUpRate: 50,
  conversionRate: 35,
};

function parseDate(value: string): Date | null {
  const [d, m, y] = value.split("/").map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sortMetrics(metrics: CampaignDailyMetric[]) {
  return [...metrics].sort((a, b) => {
    const da = parseDate(a.date)?.getTime() || 0;
    const db = parseDate(b.date)?.getTime() || 0;
    return da - db;
  });
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeCpcSeries(metrics: CampaignDailyMetric[]) {
  return metrics
    .filter((m) => (m.clicks || 0) > 0 || (m.spend || 0) > 0)
    .map((m) => ({
      cpc: (m.clicks || 0) > 0 ? (m.spend || 0) / m.clicks : (m.spend || 0),
      clicks: m.clicks || 0,
    }));
}

function stageByInvestment(spend: number): CampaignStatus {
  if (spend <= 50) return "aprendizado";
  if (spend <= 150) return "validando";
  if (spend <= 300) return "escala";
  return "otimizacao";
}

function statusLabel(status: CampaignStatus) {
  if (status === "aprendizado") return { label: "APRENDIZADO", color: "#f59e0b", emoji: "🟡" };
  if (status === "validando") return { label: "VALIDANDO", color: "#10b981", emoji: "🟢" };
  if (status === "escala") return { label: "EM ESCALA", color: "#3b82f6", emoji: "🔵" };
  if (status === "otimizacao") return { label: "OTIMIZACAO FINA", color: "#8b5cf6", emoji: "🟣" };
  return { label: "PAUSAR", color: "#ef4444", emoji: "🔴" };
}

function computeConfidence(campaign: Campaign): "baixa" | "media" | "alta" {
  if (campaign.totalSpend < 50 || campaign.leads < 8) return "baixa";
  if (campaign.totalSpend < 150 || campaign.leads < 20) return "media";
  return "alta";
}

export function buildCampaignDecision(campaign: Campaign): CampaignDecision {
  const spend = (campaign.totalSpend || 0) + (campaign.taxCost || 0);
  const status = stageByInvestment(spend);
  const label = statusLabel(status);

  const recent = sortMetrics(campaign.dailyMetrics).slice(-7);
  const full = sortMetrics(campaign.allDailyMetrics || campaign.dailyMetrics);
  const recentCpc = computeCpcSeries(recent);
  const fullCpc = computeCpcSeries(full);

  const last3 = recentCpc.slice(-3);
  const cpcRising3d = last3.length === 3 && last3[2].cpc > last3[1].cpc && last3[1].cpc > last3[0].cpc;
  const clicksFalling3d = last3.length === 3 && last3[2].clicks < last3[1].clicks && last3[1].clicks < last3[0].clicks;

  const historicalCpc = avg(fullCpc.map((x) => x.cpc));
  const currentCpc = avg(recentCpc.map((x) => x.cpc));
  const cpcAboveHistoryPct = historicalCpc > 0 ? Math.round(((currentCpc - historicalCpc) / historicalCpc) * 100) : 0;

  const reasons: string[] = [];

  if (campaign.cacLead > 0 && campaign.cacLead <= TARGETS.cpl) reasons.push(`CPL abaixo da meta (${campaign.cacLead.toFixed(2)} <= ${TARGETS.cpl.toFixed(2)}).`);
  if (campaign.cacAgendamento > 0 && campaign.cacAgendamento <= TARGETS.cacAgendamento) reasons.push(`CAC de agendamento abaixo da meta (${campaign.cacAgendamento.toFixed(2)} <= ${TARGETS.cacAgendamento.toFixed(2)}).`);
  if (campaign.conversionRate >= TARGETS.conversionRate) reasons.push(`Conversao lead -> agendamento acima da meta (${campaign.conversionRate}% >= ${TARGETS.conversionRate}%).`);
  if (campaign.showUpRate >= TARGETS.showUpRate) reasons.push(`Comparecimento acima da meta (${campaign.showUpRate}% >= ${TARGETS.showUpRate}%).`);

  if (cpcRising3d && clicksFalling3d) {
    reasons.push("Nos ultimos 3 dias, CPC subiu e cliques cairam: sinal de fadiga do criativo/publico.");
  }

  if (cpcAboveHistoryPct >= 60) {
    reasons.push(`CPC atual esta ${cpcAboveHistoryPct}% acima do historico da propria campanha.`);
  }

  if (spend > 100 && campaign.completed === 0) {
    return {
      status: "pausar",
      action: "pausar",
      title: "PAUSAR CAMPANHA",
      emoji: "🔴",
      color: "#ef4444",
      recommendation: "Pausar imediatamente e reavaliar criativo, publico e abordagem comercial.",
      reasons: [
        `Investimento acumulado alto (${spend.toFixed(0)}) sem comparecimentos.`,
        ...reasons,
      ],
      nextReview: "Revisar apos novo criativo e nova segmentacao.",
      confidence: computeConfidence(campaign),
    };
  }

  if (cpcRising3d && clicksFalling3d) {
    return {
      status: "otimizacao",
      action: "otimizar",
      title: "REVISAR CRIATIVO/PUBLICO",
      emoji: "🟠",
      color: "#f59e0b",
      recommendation: "Trocar criativo principal e ajustar publico antes de aumentar investimento.",
      reasons,
      nextReview: "Nova leitura apos 3 dias de veiculacao do novo criativo.",
      confidence: computeConfidence(campaign),
    };
  }

  const goodCost = campaign.cacLead > 0 && campaign.cacLead <= TARGETS.cpl && campaign.cacAgendamento > 0 && campaign.cacAgendamento <= TARGETS.cacAgendamento;

  if (goodCost && spend < 50) {
    return {
      status,
      action: "aguardar_dados",
      title: "CONTINUAR COLETANDO DADOS",
      emoji: "🟡",
      color: "#f59e0b",
      recommendation: "Campanha promissora. Manter como esta ate atingir investimento minimo de R$50.",
      reasons,
      nextReview: "Reavaliar ao consumir mais R$30 ou atingir R$50 investidos.",
      confidence: computeConfidence(campaign),
    };
  }

  if (goodCost && spend >= 50 && campaign.showUpRate >= TARGETS.showUpRate) {
    const newBudget = campaign.budget > 0 ? campaign.budget * 1.3 : 0;
    return {
      status: "escala",
      action: "escalar_30",
      title: "ESCALAR CAMPANHA +30%",
      emoji: "🟢",
      color: "#10b981",
      recommendation: newBudget > 0
        ? `Aumentar budget em 30% (${campaign.budget.toFixed(0)} -> ${newBudget.toFixed(0)}).`
        : "Aumentar budget em 30% mantendo monitoramento diario.",
      reasons,
      nextReview: "Nova analise apos consumir mais R$50.",
      confidence: computeConfidence(campaign),
    };
  }

  if (goodCost && spend >= 50) {
    const newBudget = campaign.budget > 0 ? campaign.budget * 1.2 : 0;
    return {
      status: "validando",
      action: "escalar_20",
      title: "ESCALAR CAMPANHA +20%",
      emoji: "🟢",
      color: "#10b981",
      recommendation: newBudget > 0
        ? `Aumentar budget em 20% (${campaign.budget.toFixed(0)} -> ${newBudget.toFixed(0)}).`
        : "Aumentar budget em 20% com monitoramento de CPL e CAC.",
      reasons,
      nextReview: "Nova analise apos consumir mais R$30.",
      confidence: computeConfidence(campaign),
    };
  }

  if (campaign.cacLead > TARGETS.cpl * 1.2 || campaign.cacAgendamento > TARGETS.cacAgendamento * 1.2) {
    return {
      status: "otimizacao",
      action: "otimizar",
      title: "OTIMIZAR CAMPANHA",
      emoji: "🟠",
      color: "#f59e0b",
      recommendation: "Revisar criativo, publico e copy antes de manter o mesmo ritmo de investimento.",
      reasons: [
        `Custos acima da meta (CPL ${campaign.cacLead.toFixed(2)} / CAC agendamento ${campaign.cacAgendamento.toFixed(2)}).`,
        ...reasons,
      ],
      nextReview: "Reavaliar em 3 dias ou apos 10 novos leads.",
      confidence: computeConfidence(campaign),
    };
  }

  return {
    status,
    action: "manter",
    title: `${label.label}`,
    emoji: label.emoji,
    color: label.color,
    recommendation: "Manter configuracao atual e seguir monitorando o funil.",
    reasons: reasons.length > 0 ? reasons : ["Sem sinal forte de alerta ou escala no momento."],
    nextReview: "Reavaliar apos mais dados de funil (7 dias).",
    confidence: computeConfidence(campaign),
  };
}
