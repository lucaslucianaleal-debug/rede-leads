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
