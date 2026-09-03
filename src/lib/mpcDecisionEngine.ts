import type { Campaign, CampaignDailyMetric, CampaignDecisionCycle } from "@/types/commandCenter";

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
  checklist: { label: string; ok: boolean }[];
  adherenceStatus?: "aderente" | "acima_recomendado" | "abaixo_recomendado" | "nao_executado";
  adherenceDiffPct?: number;
  learningInsight?: string;
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

export interface ScaleCycleState {
  state: "idle" | "aguardando_dados" | "pronto_reavaliar";
  additionalSpendSinceLastScale: number;
  spendRemainingToReview: number;
  hoursSinceLastScale: number;
  hoursRemainingToReview: number;
}

export interface OperationalScaleRow {
  campaignId: string;
  campaignName: string;
  currentDailyBudget: number;
  recommendedDailyBudget: number;
  deltaDailyBudget: number;
  statusLabel: string;
  expectedLeads: number;
  expectedCompleted: number;
  expectedRevenue: number;
  nextReviewText: string;
  reason: string;
}

export interface PortfolioAllocationItem {
  campaignId: string;
  campaignName: string;
  allocatedBudget: number;
  suggestedDailyBudget: number;
  expectedLeads: number;
  expectedRevenue: number;
  reason: string;
}

export interface PortfolioAllocationPlan {
  totalExtraBudget: number;
  items: PortfolioAllocationItem[];
  blockedCampaigns: { campaignId: string; campaignName: string; reason: string }[];
}

export interface CapacityGate {
  canScale: boolean;
  pendingConfirmations: number;
  bookedPressure: "baixo" | "medio" | "alto";
  reason: string;
}

export interface DecisionTimelineStep {
  atIso: string;
  dateLabel: string;
  title: string;
  status: "done" | "current" | "next";
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

/**
 * `clicks` é um nome legado do banco. Desde a integração Meta v2 ele contém
 * CONVERSAS INICIADAS. Toda decisão daqui para frente trata o campo assim.
 */
function computeConversationSeries(metrics: CampaignDailyMetric[]) {
  return metrics
    .filter((m) => (m.clicks || 0) > 0 || (m.spend || 0) > 0)
    .map((m) => ({
      costPerConversation: (m.clicks || 0) > 0 ? (m.spend || 0) / m.clicks : (m.spend || 0),
      conversations: m.clicks || 0,
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
  return campaign.dailyBudget > 0 ? campaign.dailyBudget : 15;
}

function controlledScaleBudget(baseBudget: number) {
  const increase = Math.min(baseBudget * 0.2, 5);
  const safeIncrease = Math.max(increase, 1);
  return {
    current: round(baseBudget),
    recommended: round(baseBudget + safeIncrease),
  };
}

function parseBrDate(value?: string) {
  if (!value) return null;
  const [dd, mm, yyyy] = value.split("/").map(Number);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getActiveCycle(campaign: Campaign): CampaignDecisionCycle | null {
  const cycles = campaign.cycles || [];
  if (cycles.length === 0) return null;
  if (campaign.activeCycleId) {
    const found = cycles.find((c) => c.id === campaign.activeCycleId);
    if (found) return found;
  }
  return cycles[cycles.length - 1] || null;
}

function buildLearningInsight(campaign: Campaign) {
  const closed = (campaign.cycles || []).filter((c) => c.result && c.appliedDailyBudget);
  if (closed.length < 3) return "Ainda sem historico suficiente de ciclos para definir limite de escala.";

  const byBudget = closed
    .map((c) => ({
      budget: Number(c.appliedDailyBudget || c.recommendedDailyBudget || 0),
      result: c.result,
    }))
    .sort((a, b) => a.budget - b.budget);

  const negative = byBudget.find((x) => x.result === "prejudicou");
  if (!negative) {
    const best = byBudget.filter((x) => x.result === "saudavel").pop();
    return best
      ? `Campanha manteve eficiencia ate R$${best.budget.toFixed(0)}/dia nos ciclos anteriores.`
      : "Sem degradacao registrada nos ciclos fechados.";
  }

  const lastHealthy = [...byBudget].reverse().find((x) => x.result === "saudavel" && x.budget <= negative.budget);
  if (lastHealthy) {
    return `Historico sugere teto operacional perto de R$${lastHealthy.budget.toFixed(0)}/dia; acima disso a eficiencia caiu.`;
  }
  return `Historico recente indica queda de eficiencia em R$${negative.budget.toFixed(0)}/dia.`;
}

export function buildOperationalCapacityGate(campaigns: Campaign[]): CapacityGate {
  const active = campaigns.filter((c) => c.active);
  const scheduled = active.reduce((sum, c) => sum + c.scheduled, 0);
  const completed = active.reduce((sum, c) => sum + c.completed, 0);
  // Isto NÃO é ocupação de agenda. É somente um sinal conservador de agendamentos ainda sem comparecimento.
  const pendingConfirmations = Math.max(scheduled - completed, 0);

  if (pendingConfirmations >= 12) {
    return {
      canScale: false,
      pendingConfirmations,
      bookedPressure: "alto",
      reason: "Sinal operacional alto: muitos agendamentos ainda sem comparecimento. Validar confirmacoes antes de escalar.",
    };
  }

  if (pendingConfirmations >= 8) {
    return {
      canScale: false,
      pendingConfirmations,
      bookedPressure: "medio",
      reason: "Sinal operacional moderado: validar confirmacoes e comparecimentos antes de aumentar volume.",
    };
  }

  return {
    canScale: true,
    pendingConfirmations,
    bookedPressure: pendingConfirmations >= 5 ? "medio" : "baixo",
    reason: "Nao ha gargalo evidente no funil agendamento -> comparecimento. Capacidade real da agenda ainda nao e medida.",
  };
}

export function computeScaleCycleState(campaign: Campaign): ScaleCycleState {
  const activeCycle = getActiveCycle(campaign);
  if (activeCycle) {
    const investedAtStart = Number(activeCycle.investedAtStart || 0);
    const additionalSpend = Math.max((campaign.totalSpend || 0) - investedAtStart, 0);
    const spendGate = Number(activeCycle.reviewAfterSpend || 50);
    const spendRemaining = Math.max(spendGate - additionalSpend, 0);

    const startedAt = new Date(activeCycle.startedAt);
    const hoursSince = Number.isNaN(startedAt.getTime()) ? 999 : (Date.now() - startedAt.getTime()) / (1000 * 60 * 60);
    const hourGate = Number(activeCycle.reviewAfterHours || 72);
    const hoursRemaining = Math.max(hourGate - hoursSince, 0);

    const waiting = spendRemaining > 0 && hoursRemaining > 0 && activeCycle.status === "aguardando_dados";

    return {
      state: waiting ? "aguardando_dados" : "pronto_reavaliar",
      additionalSpendSinceLastScale: round(additionalSpend),
      spendRemainingToReview: round(spendRemaining),
      hoursSinceLastScale: round(hoursSince),
      hoursRemainingToReview: round(hoursRemaining),
    };
  }

  const history = campaign.scaleHistory || [];
  const last = history.length > 0 ? history[history.length - 1] : null;
  if (!last) {
    return {
      state: "idle",
      additionalSpendSinceLastScale: 0,
      spendRemainingToReview: 0,
      hoursSinceLastScale: 0,
      hoursRemainingToReview: 0,
    };
  }

  const investedAtChange = Number(last.investedAtChange || 0);
  const additionalSpend = Math.max((campaign.totalSpend || 0) - investedAtChange, 0);
  const spendGate = Number(last.reviewAfterSpend || 50);
  const spendRemaining = Math.max(spendGate - additionalSpend, 0);

  const dt = parseBrDate(last.date);
  const hoursSince = dt ? (Date.now() - dt.getTime()) / (1000 * 60 * 60) : 999;
  const hourGate = Number(last.reviewAfterHours || 72);
  const hoursRemaining = Math.max(hourGate - hoursSince, 0);

  const waiting = spendRemaining > 0 && hoursRemaining > 0;

  return {
    state: waiting ? "aguardando_dados" : "pronto_reavaliar",
    additionalSpendSinceLastScale: round(additionalSpend),
    spendRemainingToReview: round(spendRemaining),
    hoursSinceLastScale: round(hoursSince),
    hoursRemainingToReview: round(hoursRemaining),
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
  const recentConversations = computeConversationSeries(recent);
  const fullConversations = computeConversationSeries(full);

  const last3 = recentConversations.slice(-3);
  const costPerConversationRising3d = last3.length === 3
    && last3[2].costPerConversation > last3[1].costPerConversation
    && last3[1].costPerConversation > last3[0].costPerConversation;
  const conversationsFalling3d = last3.length === 3
    && last3[2].conversations < last3[1].conversations
    && last3[1].conversations < last3[0].conversations;

  const historicalCostPerConversation = avg(fullConversations.map((x) => x.costPerConversation));
  const currentCostPerConversation = avg(recentConversations.map((x) => x.costPerConversation));
  const costAboveHistoryPct = historicalCostPerConversation > 0
    ? Math.round(((currentCostPerConversation - historicalCostPerConversation) / historicalCostPerConversation) * 100)
    : 0;
  const recentMetrics = recent.slice(-4);
  const reachDown4d = recentMetrics.length >= 4 && recentMetrics[3].reach < recentMetrics[2].reach && recentMetrics[2].reach < recentMetrics[1].reach;
  const impressionsUp4d = recentMetrics.length >= 4 && recentMetrics[3].impressions > recentMetrics[2].impressions && recentMetrics[2].impressions > recentMetrics[1].impressions;
  const confidenceLevel = computeConfidence(campaign);
  const confidencePct = confidenceLevel === "alta" ? 82 : confidenceLevel === "media" ? 64 : 48;
  const reviewDate = formatPtDate(addDays(new Date(), confidenceLevel === "baixa" ? 3 : confidenceLevel === "media" ? 2 : 1));
  const scaleCycle = computeScaleCycleState(campaign);
  const activeCycle = getActiveCycle(campaign);
  const adherenceStatus = activeCycle?.adherenceStatus;
  const adherenceDiffPct = activeCycle?.adherenceDiffPct;
  const learningInsight = buildLearningInsight(campaign);

  const checklistBase = [
    { label: "Campanha saiu do aprendizado", ok: spend >= 50 },
    { label: "CPL abaixo da meta", ok: campaign.cacLead > 0 && campaign.cacLead <= TARGETS.cpl },
    { label: "Investimento minimo de R$50", ok: spend >= 50 },
    { label: "Dados de pelo menos 6 dias", ok: new Set((campaign.allDailyMetrics || campaign.dailyMetrics || []).map((m) => m.date)).size >= 6 },
    { label: "Comparecimentos positivos", ok: campaign.completed > 0 || campaign.showUpRate >= TARGETS.showUpRate },
  ];

  const reasons: string[] = [];

  if (campaign.cacLead > 0 && campaign.cacLead <= TARGETS.cpl) reasons.push(`CPL abaixo da meta (${campaign.cacLead.toFixed(2)} <= ${TARGETS.cpl.toFixed(2)}).`);
  if (campaign.cacAgendamento > 0 && campaign.cacAgendamento <= TARGETS.cacAgendamento) reasons.push(`CAC de agendamento abaixo da meta (${campaign.cacAgendamento.toFixed(2)} <= ${TARGETS.cacAgendamento.toFixed(2)}).`);
  if (campaign.conversionRate >= TARGETS.conversionRate) reasons.push(`Conversao lead -> agendamento acima da meta (${campaign.conversionRate}% >= ${TARGETS.conversionRate}%).`);
  if (campaign.showUpRate >= TARGETS.showUpRate) reasons.push(`Comparecimento acima da meta (${campaign.showUpRate}% >= ${TARGETS.showUpRate}%).`);

  if (costPerConversationRising3d && conversationsFalling3d) {
    reasons.push("Nos ultimos 3 dias, o custo por conversa subiu e as conversas iniciadas cairam: sinal de perda de eficiencia do criativo/publico.");
  }

  if (reachDown4d && impressionsUp4d) {
    reasons.push("Alcance caiu enquanto impressoes subiram: indicio de saturacao do publico.");
  }

  if (costAboveHistoryPct >= 60) {
    reasons.push(`Custo por conversa atual esta ${costAboveHistoryPct}% acima do historico da propria campanha.`);
  }

  const decorate = (input: Omit<CampaignDecision, "checklist" | "adherenceStatus" | "adherenceDiffPct" | "learningInsight">): CampaignDecision => ({
    ...input,
    checklist: checklistBase,
    adherenceStatus,
    adherenceDiffPct,
    learningInsight,
  });

  if (scaleCycle.state === "aguardando_dados" && activeCycle?.triggerType === "budget_change") {
    return decorate({
      status: "validando",
      action: "aguardar_dados",
      title: "AGUARDANDO DADOS DA ESCALA",
      emoji: "🟡",
      color: "#f59e0b",
      recommendation: `Escala registrada. Aguardar ${Math.ceil(scaleCycle.hoursRemainingToReview)}h ou mais R$${scaleCycle.spendRemainingToReview.toFixed(0)} investidos antes de nova alteracao.`,
      reasons: [
        `Ja investiu +R$${scaleCycle.additionalSpendSinceLastScale.toFixed(0)} desde a ultima escala registrada.`,
        "Evitar mudancas antes de completar a janela de avaliacao da nova escala.",
      ],
      nextReview: "Reavaliar quando 72h ou +R$50 forem atendidos.",
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: campaign.dailyBudget || budgetScale.current,
      budgetRecommended: campaign.dailyBudget || budgetScale.current,
    });
  }

  if (spend > 100 && campaign.completed === 0) {
    return decorate({
      status: "pausar",
      action: "pausar",
      title: "PAUSAR CAMPANHA",
      emoji: "🔴",
      color: "#ef4444",
      recommendation: "Pausar e reavaliar criativo, publico e abordagem comercial antes de novo investimento.",
      reasons: [
        `Investimento acumulado alto (${spend.toFixed(0)}) sem comparecimentos.`,
        ...reasons,
      ],
      nextReview: "Revisar apos novo criativo e nova segmentacao.",
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.current,
    });
  }

  if (costPerConversationRising3d && conversationsFalling3d) {
    return decorate({
      status: "otimizacao",
      action: "otimizar",
      title: "REVISAR CRIATIVO/PUBLICO",
      emoji: "🟠",
      color: "#f59e0b",
      recommendation: "Revisar criativo principal e publico antes de aumentar investimento.",
      reasons,
      nextReview: "Nova leitura apos 3 dias de veiculacao do ajuste.",
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.current,
    });
  }

  const goodCost = campaign.cacLead > 0 && campaign.cacLead <= TARGETS.cpl && campaign.cacAgendamento > 0 && campaign.cacAgendamento <= TARGETS.cacAgendamento;

  if (goodCost && spend < 50) {
    return decorate({
      status,
      action: "aguardar_dados",
      title: "CONTINUAR COLETANDO DADOS",
      emoji: "🟡",
      color: "#f59e0b",
      recommendation: "Campanha promissora. Manter como esta ate atingir investimento minimo de R$50.",
      reasons,
      nextReview: "Reavaliar apos mais R$50 de investimento ou em 3 dias.",
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.current,
    });
  }

  if (goodCost && spend >= 50 && campaign.showUpRate >= TARGETS.showUpRate) {
    return decorate({
      status: "escala",
      action: "escalar_20",
      title: "CAMPANHA VALIDADA",
      emoji: "🟢",
      color: "#10b981",
      recommendation: `Escala sugerida sobre o budget cadastrado: ${budgetScale.current.toFixed(0)} -> ${budgetScale.recommended.toFixed(0)} por dia. Confirmar budget real na Meta antes de executar.`,
      reasons,
      nextReview: "Revisar apos mais R$50 de investimento ou em 3 dias.",
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.recommended,
    });
  }

  if (goodCost && spend >= 50) {
    return decorate({
      status: "validando",
      action: "escalar_20",
      title: "ESCALA PODE SER AVALIADA",
      emoji: "🟢",
      color: "#10b981",
      recommendation: `Budget cadastrado permite sugestao de ${budgetScale.current.toFixed(0)} para ${budgetScale.recommended.toFixed(0)}. Confirmar valor real na Meta e capacidade comercial antes de executar.`,
      reasons,
      nextReview: "Revisar apos mais R$50 de investimento ou em 3 dias.",
      confidence: confidenceLevel,
      confidencePct,
      reviewDate,
      budgetCurrent: budgetScale.current,
      budgetRecommended: budgetScale.recommended,
    });
  }

  if (campaign.cacLead > TARGETS.cpl * 1.2 || campaign.cacAgendamento > TARGETS.cacAgendamento * 1.2) {
    return decorate({
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
    });
  }

  return decorate({
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
  });
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

/** Projeção linear simples. Não é previsão estatística; só deve ser exibida como estimativa. */
export function projectImpact(campaign: Campaign, ticketMedio: number, increasePct = 20): ImpactProjection {
  const spend = (campaign.totalSpend || 0) + (campaign.taxCost || 0);
  const baseForIncrease = campaign.dailyBudget > 0 ? campaign.dailyBudget : 15;
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
      ? "Avaliar escala 20%"
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

export function buildOperationalScalePlan(campaigns: Campaign[], ticketMedio: number): OperationalScaleRow[] {
  const gate = buildOperationalCapacityGate(campaigns);
  return campaigns
    .filter((c) => c.active)
    .map((campaign) => {
      const decision = buildCampaignDecision(campaign);
      const projection = projectImpact(campaign, ticketMedio, 20);
      const cycle = computeScaleCycleState(campaign);
      const blockedByCapacity = !gate.canScale && (decision.action === "escalar_20" || decision.action === "escalar_30");
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        currentDailyBudget: campaign.dailyBudget || decision.budgetCurrent,
        recommendedDailyBudget: blockedByCapacity ? (campaign.dailyBudget || decision.budgetCurrent) : decision.budgetRecommended,
        deltaDailyBudget: round((blockedByCapacity ? (campaign.dailyBudget || decision.budgetCurrent) : decision.budgetRecommended) - (campaign.dailyBudget || decision.budgetCurrent)),
        statusLabel: blockedByCapacity ? "Validar operacao" : decision.action === "aguardar_dados" ? "Aguardando dados" : decision.action === "escalar_20" ? "Escala sugerida" : decision.action === "otimizar" ? "Otimizar" : decision.action === "pausar" ? "Pausar" : "Manter",
        expectedLeads: projection.leads,
        expectedCompleted: projection.completed,
        expectedRevenue: projection.revenue,
        nextReviewText: cycle.state === "aguardando_dados" && getActiveCycle(campaign)?.triggerType === "budget_change"
          ? `Aguardar ${Math.ceil(cycle.hoursRemainingToReview)}h ou +R$${cycle.spendRemainingToReview.toFixed(0)}`
          : "Pronto para nova revisao",
        reason: blockedByCapacity ? gate.reason : decision.recommendation,
      };
    })
    .sort((a, b) => b.expectedRevenue - a.expectedRevenue);
}

export function buildPortfolioAllocationPlan(campaigns: Campaign[], ticketMedio: number, totalExtraBudget: number): PortfolioAllocationPlan {
  const gate = buildOperationalCapacityGate(campaigns);
  const active = campaigns.filter((c) => c.active);
  if (totalExtraBudget <= 0 || active.length === 0) {
    return { totalExtraBudget, items: [], blockedCampaigns: [] };
  }

  const candidates = active
    .map((campaign) => {
      const decision = buildCampaignDecision(campaign);
      const projection = projectImpact(campaign, ticketMedio, 20);
      return { campaign, decision, projection, score: projection.revenue + campaign.completed * ticketMedio * 0.15 };
    })
    .sort((a, b) => b.score - a.score);

  const blockedCampaigns: { campaignId: string; campaignName: string; reason: string }[] = [];
  const items: PortfolioAllocationItem[] = [];
  let remaining = totalExtraBudget;

  for (const entry of candidates) {
    const { campaign, decision, projection } = entry;
    const hardBlocked = decision.action === "pausar" || decision.action === "aguardar_dados";
    const blockedByCapacity = !gate.canScale;
    if (hardBlocked || blockedByCapacity) {
      blockedCampaigns.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        reason: hardBlocked ? decision.recommendation : gate.reason,
      });
      continue;
    }

    const suggested = Math.min(remaining, Math.max(5, Math.round((campaign.dailyBudget || 15) * 0.4)));
    if (suggested <= 0) continue;

    items.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      allocatedBudget: suggested,
      suggestedDailyBudget: round((campaign.dailyBudget || 15) + suggested),
      expectedLeads: projection.leads,
      expectedRevenue: projection.revenue,
      reason: `${decision.recommendation} Estimativa linear; confirmar budget real antes de executar.`,
    });
    remaining -= suggested;
    if (remaining <= 0) break;
  }

  return {
    totalExtraBudget,
    items,
    blockedCampaigns,
  };
}

export function buildDecisionTimeline(campaign: Campaign): DecisionTimelineStep[] {
  const cycle = getActiveCycle(campaign);
  const now = new Date();
  const state = computeScaleCycleState(campaign);
  const startedAt = cycle?.startedAt ? new Date(cycle.startedAt) : addDays(new Date(), -3);
  const steps: DecisionTimelineStep[] = [
    { atIso: startedAt.toISOString(), dateLabel: startedAt.toLocaleDateString("pt-BR"), title: "Inicio do ciclo operacional", status: "done" },
  ];

  const isRealBudgetChange = cycle?.triggerType === "budget_change";
  if (isRealBudgetChange) {
    steps.push({
      atIso: cycle?.executedAt || now.toISOString(),
      dateLabel: (cycle?.executedAt ? new Date(cycle.executedAt) : now).toLocaleDateString("pt-BR"),
      title: cycle?.executedInMeta ? "Escala registrada como executada" : "Ajuste de budget pendente",
      status: "current",
    });

    const reviewAt = new Date(Date.now() + state.hoursRemainingToReview * 60 * 60 * 1000);
    steps.push({ atIso: reviewAt.toISOString(), dateLabel: reviewAt.toLocaleDateString("pt-BR"), title: "Reavaliar ciclo com dados suficientes", status: "next" });
    steps.push({ atIso: addDays(reviewAt, 3).toISOString(), dateLabel: formatPtDate(addDays(reviewAt, 3)), title: "Nova escala somente se os dados aprovarem", status: "next" });
  } else {
    steps.push({
      atIso: now.toISOString(),
      dateLabel: now.toLocaleDateString("pt-BR"),
      title: "Campanha em acompanhamento",
      status: "current",
    });
  }

  return steps;
}

export function buildMondayActions(campaigns: Campaign[], ticketMedio: number): MondayAction[] {
  const gate = buildOperationalCapacityGate(campaigns);
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
      if (!gate.canScale) {
        actions.push({
          id: `${campaign.id}-bloqueio-capacidade`,
          title: `Nao escalar ${campaign.name} antes de validar operacao`,
          impact: "Evita ampliar volume enquanto ha sinal de gargalo entre agendamento e comparecimento.",
          reason: gate.reason,
          eta: "Revisar em 24h",
        });
        return;
      }
      actions.push({
        id: `${campaign.id}-escalar`,
        title: `Avaliar ajuste de ${campaign.name}: R$${ctx.decision.budgetCurrent.toFixed(0)} -> R$${ctx.decision.budgetRecommended.toFixed(0)}/dia`,
        impact: `Estimativa linear: +${ctx.projection20.leads} leads, +${ctx.projection20.completed} comparecimentos, +R$${ctx.projection20.revenue.toFixed(0)} em receita potencial.`,
        reason: ctx.decision.recommendation,
        eta: "Validar antes de executar",
      });
      return;
    }

    if (ctx.decision.action === "aguardar_dados") {
      actions.push({
        id: `${campaign.id}-aguardar-dados`,
        title: `Aguardar dados em ${campaign.name}`,
        impact: "Evita intervencoes prematuras e reduz risco de falso positivo na decisao.",
        reason: ctx.decision.recommendation,
        eta: "Sem acao operacional hoje",
      });
      return;
    }

    if (ctx.decision.action === "otimizar") {
      actions.push({
        id: `${campaign.id}-otimizar`,
        title: `Revisar criativo/publico em ${campaign.name}`,
        impact: "Objetivo: recuperar conversas iniciadas e reduzir custo por conversa.",
        reason: ctx.decision.recommendation,
        eta: "25 minutos",
        due: "Proxima janela de otimizacao",
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
      title: "Revisar confirmacao e comparecimento do comercial",
      impact: "Atuar no trecho agendamento -> comparecimento, que esta abaixo da meta.",
      reason: `${lowShowUp.name} esta com comparecimento ${lowShowUp.showUpRate}% (meta ${TARGETS.showUpRate}%). O sistema ainda nao mede tempo de resposta.`,
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
        ? "Ha campanha com recomendacao de pausa."
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
  const hasWeekData = active.some((c) => typeof c.weekScheduled === "number" || typeof c.weekCompleted === "number");
  const scheduled = hasWeekData
    ? active.reduce((a, c) => a + (c.weekScheduled || 0), 0)
    : active.reduce((a, c) => a + c.scheduled, 0);
  const completed = hasWeekData
    ? active.reduce((a, c) => a + (c.weekCompleted || 0), 0)
    : active.reduce((a, c) => a + c.completed, 0);

  if (scheduled < 3) {
    return {
      level: "baixo",
      emoji: "⚪",
      label: "SEM BASE",
      color: "#9ca3af",
      reason: "A semana ainda nao tem agendamentos suficientes para classificar risco com confianca.",
      potentialRevenueLoss: 0,
    };
  }

  const showUp = completed / scheduled;
  const expectedCompleted = Math.round(scheduled * (TARGETS.showUpRate / 100));
  const miss = Math.max(expectedCompleted - completed, 0);
  const potentialRevenueLoss = miss * ticketMedio;

  if (showUp < 0.35) {
    return {
      level: "alto",
      emoji: "🔴",
      label: "ALTO",
      color: "#ef4444",
      reason: "Comparecimentos abaixo de 35% nos agendamentos desta semana.",
      potentialRevenueLoss,
    };
  }

  if (showUp < 0.5) {
    return {
      level: "medio",
      emoji: "🟠",
      label: "MEDIO",
      color: "#f59e0b",
      reason: "Comparecimentos desta semana abaixo da meta de 50%.",
      potentialRevenueLoss,
    };
  }

  return {
    level: "baixo",
    emoji: "🟢",
    label: "BAIXO",
    color: "#10b981",
    reason: "Comparecimento da semana dentro ou acima da meta.",
    potentialRevenueLoss,
  };
}

export function buildMonthlyProjection(campaigns: Campaign[], targetCompleted = 50): MonthlyProjection {
  const active = campaigns.filter((c) => c.active);
  const completed = active.reduce((a, c) => a + (c.monthCompleted ?? c.completed), 0);
  const missing = Math.max(targetCompleted - completed, 0);
  const today = new Date();
  const elapsedDays = Math.max(today.getDate(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const projectedCompleted = completed > 0 ? Math.round((completed / elapsedDays) * daysInMonth) : 0;
  // Mantido por compatibilidade de interface: agora representa aderencia do ritmo projetado à meta,
  // e não uma "probabilidade estatística".
  const probability = targetCompleted > 0 ? Math.round(clamp((projectedCompleted / targetCompleted) * 100, 0, 100)) : 0;

  return {
    projectedCompleted,
    targetCompleted,
    missing,
    probability,
  };
}
