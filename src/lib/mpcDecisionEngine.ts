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
  confidencePct: number;
  reviewDate: string;
  budgetCurrent: number;
  budgetRecommended: number;
}

export interface CampaignPerformance {
  level: "excelente" | "boa" | "regular" | "ruim";
  label: string;
  color: string;
  summary: string;
}

export interface ConfidenceContext {
  label: "Baixa" | "Media" | "Alta";
  color: string;
  emoji: string;
  checks: string[];
}

export interface ImpactProjection {
  increasePct: number;
  extraSpend: number;
  leads: number;
  scheduled: number;
  completed: number;
  revenue: number;
}

export interface CampaignStrategicContext {
  campaignId: string;
  campaignName: string;
  priorityScore: number;
  priorityStars: number;
  priorityLabel: string;
  decision: CampaignDecision;
  confidenceContext: ConfidenceContext;
  projection20: ImpactProjection;
  why: string;
  shortAction: string;
  revenuePotential: number;
}

export interface AllocationItem {
  campaignId: string;
  campaignName: string;
  allocated: number;
  expectedLeads: number;
  expectedCompleted: number;
  expectedRevenue: number;
  reason: string;
}

export interface BudgetAllocationPlan {
  totalBudget: number;
  reserve: number;
  items: AllocationItem[];
}

export interface MondayAction {
  id: string;
  title: string;
  impact: string;
  reason: string;
  eta: string;
  due?: string;
}

export interface MarketingMasterStatus {
  level: "saudavel" | "atencao" | "critico";
  emoji: string;
  label: string;
  color: string;
  reason: string;
}

export interface MpcDiagnostic {
  marketing: number;
  comercial: number;
  operacao: number;
  marketingStatus: "good" | "warn" | "crit";
  comercialStatus: "good" | "warn" | "crit";
  operacaoStatus: "good" | "warn" | "crit";
}

export interface WeeklyRisk {
  level: "baixo" | "medio" | "alto";
  emoji: string;
  label: string;
  color: string;
  reason: string;
  potentialRevenueLoss: number;
}

export interface MonthlyProjection {
  projectedCompleted: number;
  targetCompleted: number;
  missing: number;
  probability: number;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function resolveBudgetBase(campaign: Campaign) {
  const spend = (campaign.totalSpend || 0) + (campaign.taxCost || 0);
  return campaign.budget > 0 ? campaign.budget : Math.max(spend, 10);
}

function controlledScaleBudget(baseBudget: number) {
  const increase = Math.min(baseBudget * 0.2, 5);
  const safeIncrease = Math.max(increase, 1);
  return {
    current: round(baseBudget),
    recommended: round(baseBudget + safeIncrease),
  };
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatPtDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function buildCampaignDecision(campaign: Campaign): CampaignDecision {
  const spend = (campaign.totalSpend || 0) + (campaign.taxCost || 0);
  const budgetScale = controlledScaleBudget(resolveBudgetBase(campaign));
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
  const recentMetrics = recent.slice(-4);
  const reachDown4d = recentMetrics.length >= 4 && recentMetrics[3].reach < recentMetrics[2].reach && recentMetrics[2].reach < recentMetrics[1].reach;
  const impressionsUp4d = recentMetrics.length >= 4 && recentMetrics[3].impressions > recentMetrics[2].impressions && recentMetrics[2].impressions > recentMetrics[1].impressions;
  const confidenceLevel = computeConfidence(campaign);
  const confidencePct = confidenceLevel === "alta" ? 82 : confidenceLevel === "media" ? 64 : 48;
  const reviewDate = formatPtDate(addDays(new Date(), confidenceLevel === "baixa" ? 3 : confidenceLevel === "media" ? 2 : 1));

  const reasons: string[] = [];

  if (campaign.cacLead > 0 && campaign.cacLead <= TARGETS.cpl) reasons.push(`CPL abaixo da meta (${campaign.cacLead.toFixed(2)} <= ${TARGETS.cpl.toFixed(2)}).`);
  if (campaign.cacAgendamento > 0 && campaign.cacAgendamento <= TARGETS.cacAgendamento) reasons.push(`CAC de agendamento abaixo da meta (${campaign.cacAgendamento.toFixed(2)} <= ${TARGETS.cacAgendamento.toFixed(2)}).`);
  if (campaign.conversionRate >= TARGETS.conversionRate) reasons.push(`Conversao lead -> agendamento acima da meta (${campaign.conversionRate}% >= ${TARGETS.conversionRate}%).`);
  if (campaign.showUpRate >= TARGETS.showUpRate) reasons.push(`Comparecimento acima da meta (${campaign.showUpRate}% >= ${TARGETS.showUpRate}%).`);

  if (cpcRising3d && clicksFalling3d) {
    reasons.push("Nos ultimos 3 dias, CPC subiu e cliques cairam: sinal de fadiga do criativo/publico.");
  }

  if (reachDown4d && impressionsUp4d) {
    reasons.push("Alcance caiu enquanto impressoes subiram: indicio de saturacao do publico.");
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
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.recommended,
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
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.current,
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
      nextReview: "Reavaliar apos consumir mais R$50 de investimento ou em 3 dias.",
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.current,
    };
  }

  if (goodCost && spend >= 50 && campaign.showUpRate >= TARGETS.showUpRate) {
    return {
      status: "escala",
      action: "escalar_20",
      title: "CAMPANHA VALIDADA",
      emoji: "🟢",
      color: "#10b981",
      recommendation: `Escalar gradualmente: ${budgetScale.current.toFixed(0)} -> ${budgetScale.recommended.toFixed(0)} por dia.`,
      reasons,
      nextReview: "Revisar apos consumir mais R$50 de investimento ou em 3 dias.",
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.recommended,
    };
  }

  if (goodCost && spend >= 50) {
    return {
      status: "validando",
      action: "escalar_20",
      title: "INICIAR ESCALA CONTROLADA",
      emoji: "🟢",
      color: "#10b981",
      recommendation: `Ajustar budget diario de ${budgetScale.current.toFixed(0)} para ${budgetScale.recommended.toFixed(0)}.`,
      reasons,
      nextReview: "Revisar apos consumir mais R$50 de investimento ou em 3 dias.",
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.recommended,
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
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.current,
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
    confidence: confidenceLevel,
    confidencePct,
    reviewDate,
    budgetCurrent: budgetScale.current,
    budgetRecommended: budgetScale.current,
  };
}

export function buildCampaignPerformance(campaign: Campaign, ticketMedio: number): CampaignPerformance {
  const receita = campaign.completed * ticketMedio;
  const cplOk = campaign.cacLead > 0 && campaign.cacLead <= TARGETS.cpl;
  const cacOk = campaign.cacAgendamento > 0 && campaign.cacAgendamento <= TARGETS.cacAgendamento;
  const convOk = campaign.conversionRate >= TARGETS.conversionRate;

  const score = (cplOk ? 30 : 10) + (cacOk ? 30 : 10) + (convOk ? 20 : 10) + (receita >= ticketMedio * 2 ? 20 : receita > 0 ? 10 : 0);

  if (score >= 80) {
    return { level: "excelente", label: "Excelente", color: "#10b981", summary: "Indicadores principais acima da meta." };
  }
  if (score >= 60) {
    return { level: "boa", label: "Boa", color: "#3b82f6", summary: "Boa eficiencia, com pontos de ajuste." };
  }
  if (score >= 40) {
    return { level: "regular", label: "Regular", color: "#f59e0b", summary: "Entrega parcial, precisa otimizar." };
  }
  return { level: "ruim", label: "Ruim", color: "#ef4444", summary: "Baixa eficiencia para o investimento atual." };
}

export function buildConfidenceContext(campaign: Campaign): ConfidenceContext {
  const spend = (campaign.totalSpend || 0) + (campaign.taxCost || 0);
  const metricsDays = new Set((campaign.allDailyMetrics || campaign.dailyMetrics || []).map((m) => m.date)).size;
  const checks = [
    `${campaign.leads} leads avaliados`,
    `${metricsDays} dias com dados`,
    `R$${spend.toFixed(0)} investidos`,
  ];

  if (campaign.leads >= 15 && metricsDays >= 7 && spend >= 80) {
    return { label: "Alta", color: "#10b981", emoji: "🟢", checks };
  }
  if (campaign.leads >= 6 && metricsDays >= 4 && spend >= 30) {
    return { label: "Media", color: "#f59e0b", emoji: "🟡", checks };
  }
  return { label: "Baixa", color: "#ef4444", emoji: "🔴", checks };
}

export function projectImpact(campaign: Campaign, ticketMedio: number, increasePct = 20): ImpactProjection {
  const spend = (campaign.totalSpend || 0) + (campaign.taxCost || 0);
  const baseForIncrease = campaign.budget > 0 ? campaign.budget : Math.max(spend, 10);
  const extraSpend = baseForIncrease * (increasePct / 100);

  const leadPerReal = spend > 0 ? campaign.leads / spend : 0;
  const expectedLeads = extraSpend * leadPerReal;
  const conv = campaign.conversionRate > 0 ? campaign.conversionRate / 100 : 0;
  const show = campaign.showUpRate > 0 ? campaign.showUpRate / 100 : 0;
  const expectedScheduled = expectedLeads * conv;
  const expectedCompleted = expectedScheduled * show;
  const expectedRevenue = expectedCompleted * ticketMedio;

  return {
    increasePct,
    extraSpend: round(extraSpend),
    leads: round(expectedLeads),
    scheduled: round(expectedScheduled),
    completed: round(expectedCompleted),
    revenue: round(expectedRevenue),
  };
}

export function buildStrategicContext(campaign: Campaign, ticketMedio: number): CampaignStrategicContext {
  const decision = buildCampaignDecision(campaign);
  const confidenceContext = buildConfidenceContext(campaign);
  const projection20 = projectImpact(campaign, ticketMedio, 20);

  const revenuePotential = campaign.completed * ticketMedio;
  const efficiencyScore = clamp((TARGETS.cpl / Math.max(campaign.cacLead || TARGETS.cpl, 0.1)) * 25, 0, 35);
  const conversionScore = clamp((campaign.conversionRate / TARGETS.conversionRate) * 20, 0, 20);
  const showUpScore = clamp((campaign.showUpRate / TARGETS.showUpRate) * 15, 0, 15);
  const revenueScore = clamp(revenuePotential / 200, 0, 20);
  const confidenceBonus = confidenceContext.label === "Alta" ? 10 : confidenceContext.label === "Media" ? 5 : 0;
  const pausePenalty = decision.action === "pausar" ? -30 : 0;
  const priorityScore = Math.round(clamp(efficiencyScore + conversionScore + showUpScore + revenueScore + confidenceBonus + pausePenalty, 0, 100));
  const priorityStars = clamp(Math.round(priorityScore / 20), 1, 5);
  const why = campaign.cacLead > 0 && campaign.cacLead <= TARGETS.cpl
    ? "Maior eficiencia"
    : campaign.completed * ticketMedio >= ticketMedio * 3
      ? "Maior potencial financeiro"
      : "Ainda em aprendizado";

  const shortAction = decision.action === "escalar_30"
    ? "Escalar 30%"
    : decision.action === "escalar_20"
      ? "Escalar 20%"
      : decision.action === "pausar"
        ? "Pausar"
        : decision.action === "otimizar"
          ? "Otimizar"
          : "Manter";

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    priorityScore,
    priorityStars,
    priorityLabel: priorityScore >= 75 ? "Prioridade Alta" : priorityScore >= 50 ? "Prioridade Media" : "Prioridade Baixa",
    decision,
    confidenceContext,
    projection20,
    why,
    shortAction,
    revenuePotential,
  };
}

export function buildBudgetAllocationPlan(campaigns: Campaign[], ticketMedio: number, totalBudget: number): BudgetAllocationPlan {
  const active = campaigns.filter((c) => c.active);
  if (active.length === 0 || totalBudget <= 0) {
    return { totalBudget, reserve: totalBudget, items: [] };
  }

  const contexts = active
    .map((c) => buildStrategicContext(c, ticketMedio))
    .filter((ctx) => ctx.decision.action !== "pausar")
    .sort((a, b) => b.priorityScore - a.priorityScore);

  if (contexts.length === 0) {
    return { totalBudget, reserve: totalBudget, items: [] };
  }

  const reserve = Math.round(totalBudget * 0.1);
  const allocatable = totalBudget - reserve;
  const weightSum = contexts.reduce((sum, ctx) => sum + Math.max(ctx.priorityScore, 1), 0);

  const items: AllocationItem[] = contexts.map((ctx) => {
    const ratio = Math.max(ctx.priorityScore, 1) / weightSum;
    const allocated = Math.round(allocatable * ratio);
    const campaign = active.find((c) => c.id === ctx.campaignId)!;
    const projection = projectImpact(campaign, ticketMedio, campaign.budget > 0 ? (allocated / campaign.budget) * 100 : 20);
    return {
      campaignId: ctx.campaignId,
      campaignName: ctx.campaignName,
      allocated,
      expectedLeads: projection.leads,
      expectedCompleted: projection.completed,
      expectedRevenue: projection.revenue,
      reason: ctx.decision.recommendation,
    };
  });

  return { totalBudget, reserve, items };
}

export function buildMondayActions(campaigns: Campaign[], ticketMedio: number): MondayAction[] {
  const contexts = campaigns
    .filter((c) => c.active)
    .map((c) => ({ campaign: c, ctx: buildStrategicContext(c, ticketMedio) }))
    .sort((a, b) => b.ctx.priorityScore - a.ctx.priorityScore);

  const actions: MondayAction[] = [];

  contexts.forEach(({ campaign, ctx }) => {
    if (ctx.decision.action === "pausar") {
      actions.push({
        id: `${campaign.id}-pausar`,
        title: `Pausar ${campaign.name}`,
        impact: "Protege verba e evita desperdicio no curto prazo.",
        reason: ctx.decision.recommendation,
        eta: "2 minutos",
      });
      return;
    }

    if (ctx.decision.action === "escalar_20" || ctx.decision.action === "escalar_30") {
      actions.push({
        id: `${campaign.id}-escalar`,
        title: `Ajustar ${campaign.name}: R$${ctx.decision.budgetCurrent.toFixed(0)} -> R$${ctx.decision.budgetRecommended.toFixed(0)}/dia`,
        impact: `Impacto esperado: +${ctx.projection20.leads} leads, +${ctx.projection20.completed} comparecimentos, +R$${ctx.projection20.revenue.toFixed(0)}.`,
        reason: ctx.decision.recommendation,
        eta: "2 minutos",
      });
      return;
    }

    if (ctx.decision.action === "otimizar") {
      actions.push({
        id: `${campaign.id}-otimizar`,
        title: `Trocar criativo/publico em ${campaign.name}`,
        impact: "Objetivo: recuperar tracao e reduzir custo por resultado.",
        reason: ctx.decision.recommendation,
        eta: "25 minutos",
        due: "Terca-feira",
      });
      return;
    }

    actions.push({
      id: `${campaign.id}-manter`,
      title: `Manter ${campaign.name}`,
      impact: "Continuar captacao enquanto acumula dados confiaveis.",
      reason: ctx.decision.recommendation,
      eta: "Nenhuma acao",
    });
  });

  const lowShowUp = campaigns.find((c) => c.active && c.scheduled >= 6 && c.showUpRate > 0 && c.showUpRate < TARGETS.showUpRate);
  if (lowShowUp) {
    actions.push({
      id: `comercial-${lowShowUp.id}`,
      title: "Revisar tempo de resposta do comercial",
      impact: "Potencial de ganho direto em comparecimento nas campanhas ativas.",
      reason: `${lowShowUp.name} esta com comparecimento ${lowShowUp.showUpRate}% (meta ${TARGETS.showUpRate}%).`,
      eta: "10 minutos",
    });
  }

  return actions.slice(0, 5);
}

export function buildMpcDiagnostic(campaigns: Campaign[], targetCompleted = 50): MpcDiagnostic {
  const active = campaigns.filter((c) => c.active);
  const marketingRaw = active.length > 0
    ? avg(active.map((c) => {
      const cpl = c.cacLead > 0 ? c.cacLead : TARGETS.cpl * 2;
      const conv = c.conversionRate;
      return clamp((TARGETS.cpl / cpl) * 55 + (conv / TARGETS.conversionRate) * 45, 0, 100);
    }))
    : 0;

  const scheduled = active.reduce((a, c) => a + c.scheduled, 0);
  const completed = active.reduce((a, c) => a + c.completed, 0);
  const showUp = scheduled > 0 ? (completed / scheduled) * 100 : 0;
  const comercialRaw = clamp((showUp / TARGETS.showUpRate) * 100, 0, 100);
  const operacaoRaw = clamp((completed / Math.max(targetCompleted, 1)) * 100, 0, 100);

  const toStatus = (score: number): "good" | "warn" | "crit" => {
    if (score >= 75) return "good";
    if (score >= 50) return "warn";
    return "crit";
  };

  return {
    marketing: Math.round(marketingRaw / 10),
    comercial: Math.round(comercialRaw / 10),
    operacao: Math.round(operacaoRaw / 10),
    marketingStatus: toStatus(marketingRaw),
    comercialStatus: toStatus(comercialRaw),
    operacaoStatus: toStatus(operacaoRaw),
  };
}

export function buildMarketingMasterStatus(campaigns: Campaign[], ticketMedio: number): MarketingMasterStatus {
  const active = campaigns.filter((c) => c.active);
  if (active.length === 0) {
    return {
      level: "atencao",
      emoji: "🟡",
      label: "ATENCAO",
      color: "#f59e0b",
      reason: "Sem campanhas ativas no momento.",
    };
  }

  const leads = active.reduce((a, c) => a + c.leads, 0);
  const scheduled = active.reduce((a, c) => a + c.scheduled, 0);
  const completed = active.reduce((a, c) => a + c.completed, 0);
  const showUp = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
  const potentialRevenue = completed * ticketMedio;
  const pausedDecisionCount = active.map((c) => buildCampaignDecision(c)).filter((d) => d.action === "pausar").length;

  if (pausedDecisionCount > 0 || leads < 5) {
    return {
      level: "critico",
      emoji: "🔴",
      label: "CRITICO",
      color: "#ef4444",
      reason: pausedDecisionCount > 0
        ? "Ha campanha com recomendacao de pausa imediata."
        : "Volume de leads insuficiente para sustentar a meta.",
    };
  }

  if (showUp < TARGETS.showUpRate || potentialRevenue < ticketMedio * 4) {
    return {
      level: "atencao",
      emoji: "🟡",
      label: "ATENCAO",
      color: "#f59e0b",
      reason: showUp < TARGETS.showUpRate
        ? "Funil de marketing esta ativo, mas o gargalo esta no comparecimento."
        : "Campanhas ativas com retorno ainda abaixo do potencial.",
    };
  }

  return {
    level: "saudavel",
    emoji: "🟢",
    label: "SAUDAVEL",
    color: "#10b981",
    reason: "Funil esta saudavel e as campanhas mantem boa eficiencia.",
  };
}

export function buildWeeklyRisk(campaigns: Campaign[], ticketMedio: number): WeeklyRisk {
  const active = campaigns.filter((c) => c.active);
  const scheduled = active.reduce((a, c) => a + c.scheduled, 0);
  const completed = active.reduce((a, c) => a + c.completed, 0);
  const showUp = scheduled > 0 ? completed / scheduled : 0;
  const expectedCompleted = Math.round(scheduled * (TARGETS.showUpRate / 100));
  const miss = Math.max(expectedCompleted - completed, 0);
  const potentialRevenueLoss = miss * ticketMedio;

  if (showUp < 0.35) {
    return {
      level: "alto",
      emoji: "🔴",
      label: "ALTO",
      color: "#ef4444",
      reason: "Comparecimentos muito abaixo da meta desta semana.",
      potentialRevenueLoss,
    };
  }

  if (showUp < 0.5) {
    return {
      level: "medio",
      emoji: "🟠",
      label: "MEDIO",
      color: "#f59e0b",
      reason: "Comparecimentos abaixo do esperado, exigir acao comercial.",
      potentialRevenueLoss,
    };
  }

  return {
    level: "baixo",
    emoji: "🟢",
    label: "BAIXO",
    color: "#10b981",
    reason: "Ritmo de comparecimento dentro do esperado.",
    potentialRevenueLoss,
  };
}

export function buildMonthlyProjection(campaigns: Campaign[], targetCompleted = 50): MonthlyProjection {
  const active = campaigns.filter((c) => c.active);
  const completed = active.reduce((a, c) => a + c.completed, 0);
  const missing = Math.max(targetCompleted - completed, 0);
  const progress = targetCompleted > 0 ? completed / targetCompleted : 0;
  const quality = active.length > 0
    ? avg(active.map((c) => (buildCampaignDecision(c).action === "pausar" ? 0.3 : c.predictability > 0 ? c.predictability / 100 : 0.5)))
    : 0;
  const probability = Math.round(clamp((progress * 0.55 + quality * 0.45) * 100, 5, 95));

  return {
    projectedCompleted: completed,
    targetCompleted,
    missing,
    probability,
  };
}
