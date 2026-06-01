// Command Center — tipos centrais

export type LayerType = 'ops' | 'meta' | 'wa';
export type PeriodType = 'hoje' | 'semana' | 'mes';

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

export interface Campaign {
  id: string;
  name: string;
  active: boolean;
  color: string;
  leads: number;
  scheduled: number;
  completed: number;
  cac: number | null;
  roas: number;
  responseTime: number; // minutos
  budget: number;
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
  conversionRate: string; // "37%"
  status: 'good' | 'warning' | 'critical';
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
