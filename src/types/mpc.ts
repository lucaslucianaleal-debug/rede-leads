// ════════════════════════════════════════════════════════════════
// MPC (Método de Performance e Clareza) — Executive Dashboard Types
// ════════════════════════════════════════════════════════════════

export type AlertLevel = "low" | "medium" | "critical";

export interface MPCMetrics {
  // Resumo Executivo (6 KPIs principais)
  producao: {
    total: number;
    meta: number;
    percentualMeta: number;
    tendencia: number; // % de variação
  };
  conversao: {
    total: number;
    meta: number;
    percentualMeta: number;
    tendencia: number;
  };
  comparecimento: {
    total: number;
    meta: number;
    percentualMeta: number;
    tendencia: number;
  };
  satisfacao: {
    total: number;
    meta: number;
    percentualMeta: number;
    tendencia: number;
  };
  receita: {
    total: number;
    meta: number;
    percentualMeta: number;
    tendencia: number;
  };
  metaGeral: number; // % geral atingida
}

export interface MPCAlert {
  id: string;
  level: AlertLevel;
  title: string;
  probableCause: string;
  impact: string;
  suggestedAction: string;
  affectedEntity: string; // ex: "Dra. Bárbara", "Recepção", "Implantes"
  metrics?: Record<string, any>;
  timestamp: Date;
}

export interface DentistPerformance {
  id: string;
  name: string;
  specialty: string;
  dailyTarget: number;
  todayAttended: number;
  weekAttended: number;   // últimos 7 dias
  monthAttended: number;  // últimos 30 dias
  totalAttended: number;  // todos os atendimentos
  conversionRate: number; // %
  satisfaction: number; // 0-5
  status: "ok" | "warning" | "critical" | "none"; // none = sem dados ainda
  trend90d: number[]; // últimos 90 dias
  attendedLeads: Array<{ name: string; date: string; phone?: string; status?: string }>;
  budgetLeads: Array<{ name: string; date: string; phone?: string }>;
  convertedLeads: Array<{ name: string; budgetDate?: string; attendedDate?: string; phone?: string }>;
  lastUpdated: Date;
}

export interface SectorHealth {
  name: string; // Recepção, Dentistas, Comercial, Financeiro
  score: number; // 0-5
  status: "excellent" | "good" | "fair" | "poor";
  topIssues: string[];
  avgSatisfaction: number;
  lastUpdated: Date;
}

export interface WeeklyFocus {
  id: string;
  priority: string;
  rationale: string;
  owner?: string;
  targetMetric: string;
}

export interface RecommendedDecision {
  id: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  basedOnAlert?: string;
  estimatedOutcome: string;
  actionItems: string[];
}

export interface MPCWeeklyDentistSummary {
  dentistId: string;
  name: string;
  attended: number;
  target: number;
  deltaToTarget: number;
  avgDaily: number;
  trend: "up" | "down" | "stable";
  conversionRate: number;
  conversionTarget: number;
  conversionDelta: number;
  satisfaction: number;
  surveyCount: number;
  budgetCount?: number;
  convertedCount?: number;
  pendingBudgetCount?: number;
}

export interface MPCWeeklyReport {
  periodLabel: string;
  clinicAttended: number;
  clinicBudgets?: number;
  clinicConverted?: number;
  clinicPendingBudgets?: number;
  budgetConversionRate?: number;
  clinicCapacity: number;
  clinicUtilization: number;
  lowOccupancyDays: Array<{ date: string; attended: number; capacity: number }>;
  dentistSummaries: MPCWeeklyDentistSummary[];
  pendingBudgetPatients?: string[];
  receptionAvg: number;
  receptionComplaints: string[];
  outliers: string[];
  topPerformers: {
    productivity?: string;
    conversion?: string;
    satisfaction?: string;
  };
  concerningTrends: string[];
  managementActions: string[];
}

export interface MPCDashboardData {
  metrics: MPCMetrics;
  alerts: MPCAlert[];
  dentistPerformance: DentistPerformance[];
  sectorHealth: SectorHealth[];
  weeklyFocus: WeeklyFocus[];
  recommendedDecisions: RecommendedDecision[];
  weeklyReport: MPCWeeklyReport;
  generatedAt: Date;
}
