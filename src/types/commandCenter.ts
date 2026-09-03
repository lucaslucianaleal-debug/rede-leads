// Command Center — tipos centrais

export type LayerType = 'ops' | 'meta' | 'wa';
export type PeriodType = 'operacao' | 'ciclo' | 'historico' | 'hoje' | 'semana' | 'mes';

export interface KPI {
  label: string;
  value: string;
  delta?: string;
  sub?: string;
  status: 'bad' | 'warn' | 'good' | 'info' | 'meta' | 'wa' | 'neutral';
}

export interface Diagnostic {
  type: 'crit' | 'imp' | 'ok' | 'info';
  title: string;
  description: string;
  action?: string;
  actionId?: string;
}

export interface FunnelData {
  leads: number;
  scheduled: number;
  completed: number;
  conversionRate: string;
  showUpRate: string;
  bottleneck: string;
  leadsGoal?: number;
}

export interface CampaignDailyMetric {
  date: string; // DD/MM/YYYY
  spend: number;
  impressions: number;
  /** Campo legado. No painel MPC representa CONVERSAS INICIADAS, não cliques de link. */
  clicks: number;
  reach: number;
  /** Cliques reais retornados pela Meta, mantidos apenas para auditoria. */
  metaLinkClicks?: number;
  /** Resultado Meta configurado para a integração (conversas iniciadas). */
  metaResults?: number;
  /** Custo por conversa retornado pela Meta. */
  metaCostPerResult?: number;
  source?: 'meta' | 'manual';
  manualOverride?: boolean;
  syncedAt?: string;
}

export interface CampaignScaleEvent {
  date: string; // DD/MM/YYYY
  fromDailyBudget: number;
  toDailyBudget: number;
  reason?: string;
  investedAtChange?: number;
  reviewAfterSpend?: number;
  reviewAfterHours?: number;
  status?: 'aguardando' | 'pronto_reavaliar' | 'concluido';
  result?: 'saudavel' | 'prejudicou' | 'neutro';
  resultNote?: string;
  note?: string;
}

export interface CampaignDecisionCycle {
  id: string;
  startedAt: string; // ISO
  endedAt?: string; // ISO
  triggerType: 'campaign_created' | 'budget_change' | 'creative_change' | 'audience_change' | 'copy_change' | 'manual';
  triggerNote?: string;
  status: 'aberto' | 'aguardando_dados' | 'pronto_reavaliar' | 'encerrado';
  recommendedDailyBudget: number;
  appliedDailyBudget?: number;
  executedInMeta?: boolean;
  executedAt?: string; // ISO
  adherenceStatus?: 'aderente' | 'acima_recomendado' | 'abaixo_recomendado' | 'nao_executado';
  adherenceDiffPct?: number;
  investedAtStart: number;
  reviewAfterSpend: number;
  reviewAfterHours: number;
  result?: 'saudavel' | 'prejudicou' | 'neutro';
  resultNote?: string;
}

export interface CampaignOperationalEvent {
  id: string;
  cycleId?: string;
  type: 'campaign_created' | 'budget_scaled' | 'creative_changed' | 'audience_changed' | 'copy_changed' | 'cycle_closed' | 'cycle_reopened';
  createdAt: string; // ISO
  title: string;
  note?: string;
  payload?: Record<string, any>;
}

export interface Campaign {
  id: string;
  clinicId: string;
  name: string;
  active: boolean;
  color: string;
  dateStart: string; // DD/MM/YYYY
  dateEnd: string;   // DD/MM/YYYY
  budget: number;    // budget total planejado
  dailyBudget: number; // budget diario cadastrado no Rede Leads; não assumir que veio da Meta
  lastBudgetChangeAt?: string;
  scaleHistory?: CampaignScaleEvent[];
  scaleCycleState?: 'idle' | 'aguardando_dados' | 'pronto_reavaliar';
  cycles?: CampaignDecisionCycle[];
  events?: CampaignOperationalEvent[];
  activeCycleId?: string;
  fundsAdded: number; // créditos/fundos adicionados na conta de anúncios
  taxCost: number;    // impostos/taxas cobrados pela plataforma
  dailyMetrics: CampaignDailyMetric[];
  allDailyMetrics?: CampaignDailyMetric[];

  // Calculados automaticamente (agregados de dailyMetrics):
  totalSpend: number;
  totalImpressions: number;
  /** Total de conversas iniciadas. Nome legado preservado por compatibilidade. */
  totalClicks: number;
  totalReach: number;

  // Calculados a partir dos leads no Firestore:
  leads: number;
  scheduled: number;
  completed: number;
  weekLeads?: number;
  weekScheduled?: number;
  weekCompleted?: number;
  monthLeads?: number;
  monthScheduled?: number;
  monthCompleted?: number;

  // Derivados:
  roas: number;          // (completed * ticketMedio) / totalSpend
  predictability: number; // lead -> comparecimento (%)
  cacLead: number;       // totalSpend / leads
  cacAgendamento: number; // totalSpend / scheduled
  cacComparecimento: number; // totalSpend / completed
  conversionRate: number; // lead -> agendamento * 100
  showUpRate: number;     // agendamento -> comparecimento * 100
}

export interface WhatsAppMessage {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  message: string;
  timeLabel: string;
  status: 'pending' | 'responded' | 'auto';
  responseTime: string;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  on: boolean;
  impact: string;
  impactType: 'positive' | 'neutral';
}

export interface WhatsAppMetrics {
  averageResponseTime: string;
  responseRate: string;
  automatedPercentage: string;
  totalToday: number;
  pendingNow: number;
}

export interface UnitRanking {
  id: string;
  name: string;
  leadsPerDay: number;
  showUpRate: number; // porcentagem 0-100
  comparison: string; // "vs semana anterior"
}

export interface PerformanceChannel {
  id: string;
  name: string;
  leads: number;
  scheduled: number;
  completed: number;
  conversionRate: string; // "37%"
  showUpRate: string; // "45%" - comparecimentos reais
  status: 'good' | 'warning' | 'critical' | 'bad';
  icon: string;
}

export interface RecentLead {
  id: string;
  name: string;
  status: 'agendado' | 'confirmado' | 'compareceu' | 'cancelado';
  date: string;
  time: string;
  action?: string;
}

export interface FieldMember {
  id: string;
  name: string;
  unit: string;
  x: number; // 0-100 posição no mapa
  y: number; // 0-100 posição no mapa
  leads: number;
  meta: number;
  color: string;
}

export interface MetaKPI {
  label: string;
  value: string;
  delta?: string;
  status: 'good' | 'bad' | 'warn' | 'neutral';
}

export interface WhatsAppKPI {
  label: string;
  value: string;
  delta?: string;
  status: 'good' | 'bad' | 'warn' | 'neutral';
}
