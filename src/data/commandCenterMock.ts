import type { KPI, Diagnostic, FunnelData, Campaign, WhatsAppMessage, Automation, WhatsAppMetrics, UnitRanking, PerformanceChannel, RecentLead, FieldMember } from "@/types/commandCenter";

// ─── 4 KPIs fixos (briefing) ──────────────────────────────────────────────────

export const KPI_BRIEFING: KPI[] = [
  { label: "Leads hoje", value: "15", delta: "+50% vs ontem", status: "good" },
  { label: "Comparecidos", value: "1", sub: "meta: 5 hoje", status: "bad" },
  { label: "Receita prevista", value: "R$ 2k", sub: "ticket R$ 120", status: "good" },
  { label: "CAC real", value: "R$ 180", sub: "integrar Meta para exato", status: "warn" },
];

// ─── Diagnósticos unificados (ops + meta + wa) ────────────────────────────────

export const MOCK_DIAGNOSTICS: Diagnostic[] = [
  {
    type: "crit",
    title: "8 leads sem resposta +24h — risco de perda imediata",
    description: "Ana Ferreira, João Lima e +6. Cada hora reduz chance de agendamento em ~12%.",
    action: "Enviar WA agora",
    actionId: "send_whatsapp_unresponded",
  },
  {
    type: "crit",
    title: "Campanha Sorteio com 0 conversões — R$ 320 queimados",
    description: "ROAS 0.0x. 11 leads captados, 0 agendamentos. Pausar e redirecionar budget.",
    action: "Pausar campanha",
    actionId: "pause_campaign_sorteio",
  },
  {
    type: "imp",
    title: "Comparecimento em 37% — meta é 50%",
    description: "Confirmação 2h antes reduz no-show em ~15pp. Automação está desligada.",
    action: "Ativar confirmação",
    actionId: "activate_automation_confirmation",
  },
  {
    type: "ok",
    title: "Tempo de resposta WA: 4min — dentro da meta",
    description: "Meta: 5min. Equipe performando bem. Manter cadência.",
    action: undefined,
    actionId: undefined,
  },
];

// ─── Histórico 7 dias ─────────────────────────────────────────────────────────

export const MOCK_HISTORY = [
  { date: "25/05", leads: 18, completed: 5 },
  { date: "26/05", leads: 22, completed: 8 },
  { date: "27/05", leads: 14, completed: 3 },
  { date: "28/05", leads: 19, completed: 7 },
  { date: "29/05", leads: 11, completed: 2 },
  { date: "30/05", leads: 16, completed: 4 },
  { date: "31/05", leads: 15, completed: 1 },
];

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

// ─── Ranking de Unidades ──────────────────────────────────────────────────────

export const MOCK_UNITS_RANKING: UnitRanking[] = [
  { id: "olimpia", name: "Olímpia", leadsPerDay: 18, showUpRate: 52, comparison: "+8% vs semana" },
  { id: "catanduva", name: "Catanduva", leadsPerDay: 15, showUpRate: 48, comparison: "-3% vs semana" },
  { id: "votuporanga", name: "Votuporanga", leadsPerDay: 12, showUpRate: 41, comparison: "+2% vs semana" },
  { id: "novohorizonte", name: "Novo Horizonte", leadsPerDay: 8, showUpRate: 35, comparison: "-5% vs semana" },
];

// ─── Performance por Canal ─────────────────────────────────────────────────────

export const MOCK_PERFORMANCE_CHANNELS: PerformanceChannel[] = [
  { id: "online", name: "Online", leads: 89, conversionRate: "42%", status: "good", icon: "💻" },
  { id: "presencial", name: "E-presencial", leads: 156, conversionRate: "38%", status: "good", icon: "🎥" },
  { id: "google", name: "Google Ads", leads: 45, conversionRate: "29%", status: "warning", icon: "🔍" },
  { id: "whatsapp", name: "WhatsApp", leads: 138, conversionRate: "34%", status: "good", icon: "💬" },
];

// ─── Leads Recentes ───────────────────────────────────────────────────────────

export const MOCK_RECENT_LEADS: RecentLead[] = [
  { id: "1", name: "Anne Caroline", status: "agendado", date: "31/05", time: "14:30", action: "Confirmar" },
  { id: "2", name: "Bruna Silva", status: "confirmado", date: "31/05", time: "10:00", action: "Lembrar" },
  { id: "3", name: "Carol Souza", status: "compareceu", date: "31/05", time: "09:30", action: "Seguir" },
  { id: "4", name: "Diana Costa", status: "agendado", date: "01/06", time: "16:00", action: "Confirmar" },
  { id: "5", name: "Eduarda Lima", status: "cancelado", date: "31/05", time: "11:00", action: "Reagendar" },
  { id: "6", name: "Fernanda Gomes", status: "agendado", date: "02/06", time: "15:30", action: "Confirmar" },
  { id: "7", name: "Gabriela Rocha", status: "confirmado", date: "31/05", time: "14:00", action: "Lembrar" },
  { id: "8", name: "Helena Pereira", status: "compareceu", date: "31/05", time: "13:00", action: "Seguir" },
];

// ─── Campo ao Vivo (Membros em Campo) ──────────────────────────────────────

export const MOCK_FIELD_MEMBERS: FieldMember[] = [
  { id: "1", name: "Lucas", unit: "Olímpia - GPS ao vivo", x: 60, y: 45, leads: 4, meta: 5, color: "#378ADD" },
  { id: "2", name: "Julia", unit: "Rua David de Oliveira", x: 35, y: 65, leads: 0, meta: 5, color: "#ec4899" },
  { id: "3", name: "Neto", unit: "Rua Benjamim Constant", x: 70, y: 50, leads: 2, meta: 5, color: "#1D9E75" },
];
