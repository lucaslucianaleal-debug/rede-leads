import type { KPI, Diagnostic, FunnelData, Campaign, WhatsAppMessage, Automation, WhatsAppMetrics } from "@/types/commandCenter";

// ─── KPIs por layer × período ────────────────────────────────────────────────

export const MOCK_KPIS: Record<string, Record<string, KPI[]>> = {
  ops: {
    hoje: [
      { label: "Leads hoje", value: "15", delta: "+3 vs ontem", status: "good" },
      { label: "Agendados", value: "6", delta: "-1 vs ontem", status: "warn" },
      { label: "Compareceram", value: "2", sub: "meta: 5", status: "bad" },
      { label: "Follow-ups pend.", value: "86", sub: "D1–D3 hoje", status: "bad" },
      { label: "Confirmações env.", value: "12", sub: "agendados amanhã", status: "info" },
      { label: "Sem responsável", value: "851", sub: "precisa distribuir", status: "bad" },
      { label: "Automáticas hoje", value: "18", sub: "42% do total", status: "good" },
      { label: "Taxa de resposta", value: "68%", sub: "leads que respondem", status: "warn" },
    ],
    semana: [
      { label: "Leads semana", value: "89", delta: "+12% vs ant.", status: "good" },
      { label: "Agendados", value: "34", delta: "-8% vs ant.", status: "warn" },
      { label: "Compareceram", value: "19", sub: "meta: 30", status: "bad" },
      { label: "Follow-ups pend.", value: "86", sub: "acumulados", status: "bad" },
      { label: "Confirmações env.", value: "67", sub: "automáticas", status: "good" },
      { label: "Sem responsável", value: "851", sub: "crítico", status: "bad" },
      { label: "Automáticas", value: "94", sub: "% auto: 58%", status: "good" },
      { label: "Taxa de resposta", value: "71%", sub: "média semana", status: "warn" },
    ],
    mes: [
      { label: "Leads mai/26", value: "428", delta: "-68% vs abr", status: "bad" },
      { label: "Meta leads", value: "35%", sub: "meta: 200", status: "bad" },
      { label: "Compareceram", value: "157", sub: "meta: 50%", status: "warn" },
      { label: "Receita prevista", value: "R$ 51k", sub: "ticket R$ 120", status: "info" },
      { label: "CAC médio", value: "—", sub: "integrar Meta", status: "neutral" },
      { label: "Sem responsável", value: "851", sub: "R$ 56.808 parados", status: "bad" },
      { label: "Conv. leads→agend", value: "45%", sub: "meta: 50%", status: "warn" },
      { label: "Taxa comparecim.", value: "37%", sub: "meta: 50%", status: "bad" },
    ],
  },
  meta: {
    hoje: [
      { label: "Leads Meta hoje", value: "8", delta: "+2 vs ontem", status: "good" },
      { label: "Custo por lead", value: "R$ 12,40", sub: "meta: R$ 15", status: "good" },
      { label: "CAC real", value: "R$ 45", sub: "por paciente sentado", status: "good" },
      { label: "ROAS geral", value: "3.2x", sub: "meta: 2.5x", status: "good" },
      { label: "Campanhas ativas", value: "4", sub: "de 6 totais", status: "info" },
      { label: "Impressões hoje", value: "12.4k", sub: "CTR 2.1%", status: "info" },
    ],
    semana: [
      { label: "Leads Meta", value: "43", delta: "+18% vs ant.", status: "good" },
      { label: "Custo por lead", value: "R$ 13,80", sub: "meta: R$ 15", status: "good" },
      { label: "CAC real", value: "R$ 52", sub: "por paciente sentado", status: "good" },
      { label: "ROAS geral", value: "2.9x", sub: "meta: 2.5x", status: "good" },
      { label: "Melhor campanha", value: "Promotora", sub: "ROAS 5.3x", status: "meta" },
      { label: "Pior campanha", value: "Sorteio", sub: "ROAS 0.0x — pausar", status: "bad" },
    ],
    mes: [
      { label: "Leads Meta mai", value: "187", delta: "-41% vs abr", status: "bad" },
      { label: "Custo por lead", value: "R$ 14,20", sub: "acumulado", status: "good" },
      { label: "CAC real", value: "R$ 61", sub: "por paciente sentado", status: "warn" },
      { label: "ROAS geral", value: "2.4x", sub: "abaixo da meta", status: "warn" },
      { label: "Verba gasta", value: "R$ 2.650", sub: "de R$ 5.000 budget", status: "info" },
      { label: "Melhor canal", value: "Online", sub: "+28% eficiência", status: "meta" },
    ],
  },
  wa: {
    hoje: [
      { label: "Msgs recebidas", value: "43", sub: "hoje", status: "info" },
      { label: "Msgs enviadas", value: "61", sub: "humano + auto", status: "info" },
      { label: "Tempo resp. médio", value: "4min", delta: "meta: 5min ✅", status: "good" },
      { label: "Leads sem resposta", value: "8", sub: "+24h parados", status: "bad" },
      { label: "Automáticas hoje", value: "18", sub: "42% do total", status: "good" },
      { label: "Confirmações env.", value: "12", sub: "agendados amanhã", status: "good" },
      { label: "Follow-ups auto", value: "6", sub: "D1–D3 hoje", status: "good" },
      { label: "Taxa de resposta", value: "68%", sub: "leads que respondem", status: "warn" },
    ],
    semana: [
      { label: "Msgs recebidas", value: "312", sub: "semana", status: "info" },
      { label: "Msgs enviadas", value: "428", sub: "humano + auto", status: "info" },
      { label: "Tempo resp. médio", value: "6min", delta: "meta: 5min ⚠️", status: "warn" },
      { label: "Leads sem resposta", value: "8", sub: "acumulados", status: "bad" },
      { label: "Automáticas", value: "94", sub: "% auto: 58%", status: "good" },
      { label: "Follow-ups auto", value: "31", sub: "D1–D3", status: "good" },
    ],
    mes: [
      { label: "Total msgs", value: "1.847", sub: "mai/26", status: "info" },
      { label: "Tempo resp. médio", value: "7min", delta: "meta: 5min ⚠️", status: "warn" },
      { label: "Taxa automação", value: "54%", sub: "meta: 60%", status: "warn" },
      { label: "No-show evitados", value: "23", sub: "por confirmação auto", status: "good" },
      { label: "Conversão WA→agend", value: "38%", sub: "meta: 45%", status: "bad" },
      { label: "Leads reativados", value: "14", sub: "via follow-up D2", status: "good" },
    ],
  },
};

// ─── Diagnósticos por layer ───────────────────────────────────────────────────

export const MOCK_DIAGNOSTICS: Record<string, Diagnostic[]> = {
  ops: [
    {
      type: "crit",
      title: "851 leads sem responsável — R$ 56.808 parados",
      description: "Distribuir agora por carga de equipe. Risco de perda aumenta a cada hora.",
      action: "Distribuir",
      actionId: "distribute_leads",
    },
    {
      type: "imp",
      title: "6 pacientes agendados sem confirmação de presença",
      description: "Amanda, Vanessa, Damaris, Alisson, Paula, Milena — risco de no-show amanhã.",
      action: "Confirmar",
      actionId: "confirm_appointments",
    },
    {
      type: "imp",
      title: "86 follow-ups pendentes na fila D1–D3",
      description: "Queda de 46% vs. semana anterior. Lucas e Julia precisam retomar cadência.",
      action: "Ver fila",
      actionId: "view_followup_queue",
    },
    {
      type: "info",
      title: "Promotora Sorteio Rádio com conversão 18% → abaixo da meta",
      description: "Canal mais fraco esta semana. Avaliar substituição de abordagem.",
      action: "Analisar",
      actionId: "analyze_channel",
    },
  ],
  meta: [
    {
      type: "crit",
      title: "Campanha Sorteio com ROAS 0.0x — nenhuma conversão",
      description: "R$ 320 gastos, 0 agendamentos. Pausar imediatamente.",
      action: "Pausar campanha",
      actionId: "pause_campaign_sorteio",
    },
    {
      type: "imp",
      title: "Google: comparecimento caiu 43pp esta semana",
      description: "Causa provável: falta de confirmação 2h antes. Ativar automação.",
      action: "Ativar confirmação",
      actionId: "enable_confirmation_auto",
    },
    {
      type: "ok",
      title: "Promotora com ROAS 5.3x — melhor canal ativo",
      description: "CAC R$ 45. Considerar aumentar verba em 20%.",
      action: "Otimizar verba",
      actionId: "optimize_budget_promotora",
    },
    {
      type: "info",
      title: "Leads Meta com tempo de resposta médio 18min",
      description: "Meta recomenda <5min para máxima conversão. Ativar resposta automática.",
    },
  ],
  wa: [
    {
      type: "crit",
      title: "8 leads sem resposta há +24h — risco de perda",
      description: "Ana Ferreira, João Lima e +6. Acionar agora via WA.",
      action: "Responder todos",
      actionId: "respond_pending",
    },
    {
      type: "imp",
      title: "Vanessa não confirmou presença amanhã 09:30",
      description: "Enviar lembrete agora para evitar no-show.",
      action: "Enviar lembrete",
      actionId: "send_reminder_vanessa",
    },
    {
      type: "ok",
      title: "Tempo de resposta médio: 4min — dentro da meta",
      description: "Meta estabelecida: 5min. Equipe performando bem hoje.",
    },
    {
      type: "info",
      title: "54% das mensagens são automáticas — meta 60%",
      description: "Ativar follow-up D2 automático para aumentar automação.",
      action: "Ativar follow-up D2",
      actionId: "enable_followup_d2",
    },
  ],
};

// ─── Funil ────────────────────────────────────────────────────────────────────

export const MOCK_FUNNEL: FunnelData = {
  leads: 428,
  scheduled: 157,
  completed: 69,
  conversionRate: "37%",
  showUpRate: "44%",
  bottleneck: "no-show",
  leadsGoal: 200,
};

// ─── Campanhas Meta ───────────────────────────────────────────────────────────

export const MOCK_CAMPAIGNS: Campaign[] = [
  { id: "1", name: "Profilaxia Online", active: true, color: "#3b82f6", leads: 13, scheduled: 10, completed: 5, cac: 62, roas: 3.2, responseTime: 4, budget: 800 },
  { id: "2", name: "Clareamento", active: true, color: "#8b5cf6", leads: 7, scheduled: 6, completed: 4, cac: 45, roas: 5.3, responseTime: 6, budget: 600 },
  { id: "3", name: "Promotora Campo", active: true, color: "#10b981", leads: 32, scheduled: 32, completed: 21, cac: 38, roas: 5.3, responseTime: 2, budget: 0 },
  { id: "4", name: "Google Ads", active: true, color: "#f59e0b", leads: 11, scheduled: 7, completed: 3, cac: 120, roas: 1.8, responseTime: 18, budget: 500 },
  { id: "5", name: "Indicação", active: true, color: "#ec4899", leads: 6, scheduled: 6, completed: 4, cac: 0, roas: 9.9, responseTime: 1, budget: 0 },
  { id: "6", name: "Sorteio Rádio", active: false, color: "#6b7280", leads: 11, scheduled: 2, completed: 0, cac: null, roas: 0, responseTime: 42, budget: 320 },
];

// ─── Mensagens WhatsApp ───────────────────────────────────────────────────────

export const MOCK_MESSAGES: WhatsAppMessage[] = [
  { id: "1", name: "Ana Paula Ferreira", initials: "AP", avatarColor: "#3b82f6", message: "Oi, posso confirmar para amanhã 08:30?", timeLabel: "há 2min", status: "pending", responseTime: "—" },
  { id: "2", name: "Ana Lucia da Cruz", initials: "AL", avatarColor: "#8b5cf6", message: "Boa tarde! Quero agendar para essa semana.", timeLabel: "há 5min", status: "responded", responseTime: "3min" },
  { id: "3", name: "Alessandro Antônio", initials: "AA", avatarColor: "#10b981", message: "Confirmado para 11:30 ✅", timeLabel: "há 12min", status: "auto", responseTime: "auto" },
  { id: "4", name: "Levy Pereira", initials: "LP", avatarColor: "#f59e0b", message: "Não vou conseguir ir amanhã, pode remarcar?", timeLabel: "há 18min", status: "pending", responseTime: "18min" },
  { id: "5", name: "Camily Simões", initials: "CS", avatarColor: "#ec4899", message: "Já agendei pelo link! Obrigada 😊", timeLabel: "há 24min", status: "responded", responseTime: "4min" },
  { id: "6", name: "Caio César Rodrigues", initials: "CC", avatarColor: "#6366f1", message: "Que horas funciona o consultório?", timeLabel: "há 1h", status: "pending", responseTime: "1h+" },
  { id: "7", name: "Maria Santos", initials: "MS", avatarColor: "#14b8a6", message: "Lembrete enviado automaticamente.", timeLabel: "há 1h 20min", status: "auto", responseTime: "auto" },
  { id: "8", name: "Fernanda Lima", initials: "FL", avatarColor: "#f97316", message: "Vim sim, fui atendida! Obrigada.", timeLabel: "há 2h", status: "responded", responseTime: "2min" },
];

export const MOCK_WA_METRICS: WhatsAppMetrics = {
  averageResponseTime: "4min",
  responseRate: "68%",
  automatedPercentage: "42%",
  totalToday: 43,
  pendingNow: 8,
};

// ─── Automações ───────────────────────────────────────────────────────────────

export const MOCK_AUTOMATIONS: Automation[] = [
  { id: "1", name: "Confirmação 2h antes", description: "WhatsApp automático antes do horário agendado", on: true, impact: "+12 comp/mês", impactType: "positive" },
  { id: "2", name: "Follow-up D1 automático", description: "Mensagem no dia seguinte à captação sem agendamento", on: true, impact: "+18% conv.", impactType: "positive" },
  { id: "3", name: "Follow-up D2 automático", description: "Reativação no 2º dia sem resposta", on: false, impact: "+8 agend/mês", impactType: "positive" },
  { id: "4", name: "Resposta imediata Meta Leads", description: "WhatsApp em até 2min após lead pelo Meta", on: true, impact: "-60% tempo resp.", impactType: "positive" },
  { id: "5", name: "Reativação no-show", description: "Mensagem automática para quem não compareceu", on: false, impact: "+5 retornos/mês", impactType: "positive" },
  { id: "6", name: "Relatório diário gestor", description: "Resumo do dia às 20h para o responsável", on: true, impact: "visibilidade", impactType: "neutral" },
];

// ─── Unidades ─────────────────────────────────────────────────────────────────

export const MOCK_UNITS = [
  { id: "all", label: "Toda a rede" },
  { id: "olimpia", label: "Olímpia" },
  { id: "novohorizonte", label: "Novo Horizonte" },
  { id: "votuporanga", label: "Votuporanga" },
  { id: "catanduva", label: "Catanduva" },
];
