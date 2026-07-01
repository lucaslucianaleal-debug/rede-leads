import { useMemo } from "react";
import { MPCStore } from "@/hooks/useMPCDataStore";
import {
  MPCDashboardData,
  MPCMetrics,
  MPCAlert,
  DentistPerformance,
  SectorHealth,
  WeeklyFocus,
  RecommendedDecision,
  AlertLevel,
} from "@/types/mpc";

// ════════════════════════════════════════════════════════════════
// Hook Principal: useMPCDashboardData
// Recebe o store diretamente — sem instância própria, sem problemas de sync
// ════════════════════════════════════════════════════════════════

export function useMPCDashboardData(store: MPCStore) {
  const dashboardData = useMemo(() => {
    const metrics = calculateMetrics(store);
    const alerts = generateAlerts(store, metrics);
    const dentistPerformance = calculateDentistPerformance(store);
    const sectorHealth = calculateSectorHealth(store);
    const weeklyFocus = generateWeeklyFocus(alerts, metrics);
    const recommendedDecisions = generateRecommendedDecisions(alerts, metrics);

    return {
      metrics,
      alerts,
      dentistPerformance,
      sectorHealth,
      weeklyFocus,
      recommendedDecisions,
      generatedAt: new Date(),
    } as MPCDashboardData;
  }, [store]);

  return {
    data: dashboardData,
    isLoading: false,
  };
}

// ════════════════════════════════════════════════════════════════
// Cálculo de Métricas
// ════════════════════════════════════════════════════════════════

function calculateMetrics(rawData: any): MPCMetrics {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const appointments = rawData.appointments || [];
  const surveys = rawData.surveys || [];
  const dentists = rawData.dentists || [];

  // Produção: pacientes atendidos hoje vs meta diária
  const attendedToday = appointments.filter((a: any) => {
    if (!a.attendedAt && !a.createdAt) return false;
    const att = new Date(a.attendedAt || a.createdAt || new Date());
    att.setHours(0, 0, 0, 0);
    return a.status === "attended" && att.getTime() === today.getTime();
  }).length;
  
  const productionMeta = dentists.reduce((sum: number, d: any) => sum + (d.dailyTarget || 10), 0);

  // Conversão: agendados → atendidos (taxa de conversão)
  const scheduled = appointments.filter((a: any) => a.status === "scheduled").length;
  const attended = appointments.filter((a: any) => a.status === "attended").length;
  const conversionRate = scheduled > 0 ? (attended / scheduled) * 100 : 100; // Se nenhum agendado, 100%

  // Comparecimento: confirmados que comparecem (taxa de comparecimento real)
  const confirmed = appointments.filter((a: any) => a.status === "confirmed").length;
  const attendedFromConfirmed = appointments.filter((a: any) => a.status === "confirmed" && a.status === "attended").length;
  const attendanceRate = confirmed > 0 ? (attendedFromConfirmed / confirmed) * 100 : 100;

  // Satisfação: média de surveys recentes (últimos 30 dias)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentSurveys = surveys.filter((s: any) => {
    const surveyDate = new Date(s.createdAt || new Date());
    return surveyDate >= thirtyDaysAgo;
  });
  
  const avgSatisfaction = recentSurveys.length > 0
    ? Math.round((recentSurveys.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / recentSurveys.length) * 10) / 10
    : 0;

  // Receita: ticket médio × atendimentos hoje
  const averageTicket = rawData.averageTicket || 500;
  const revenueToday = attendedToday * averageTicket;
  const revenueMeta = productionMeta * averageTicket;

  // Meta Geral: combinação ponderada
  const metaGeralPct = productionMeta > 0
    ? Math.min(100, (
        ((attendedToday / productionMeta) * 100) * 0.35 +
        (conversionRate || 0) * 0.25 +
        (attendanceRate || 100) * 0.20 +
        (avgSatisfaction > 0 ? (avgSatisfaction / 5) * 100 : 100) * 0.20
      ))
    : 0;

  return {
    producao: {
      total: attendedToday,
      meta: productionMeta || 1,
      percentualMeta: productionMeta > 0 ? (attendedToday / productionMeta) * 100 : 0,
      tendencia: 0,
    },
    conversao: {
      total: Math.round(conversionRate * 10) / 10,
      meta: 85,
      percentualMeta: (conversionRate / 85) * 100,
      tendencia: 0,
    },
    comparecimento: {
      total: Math.round(attendanceRate * 10) / 10,
      meta: 90,
      percentualMeta: (attendanceRate / 90) * 100,
      tendencia: 0,
    },
    satisfacao: {
      total: avgSatisfaction,
      meta: 4.5,
      percentualMeta: avgSatisfaction > 0 ? (avgSatisfaction / 4.5) * 100 : 0,
      tendencia: 0,
    },
    receita: {
      total: revenueToday,
      meta: revenueMeta || 1,
      percentualMeta: revenueMeta > 0 ? (revenueToday / revenueMeta) * 100 : 0,
      tendencia: 0,
    },
    metaGeral: Math.round(metaGeralPct * 10) / 10,
  };
}

// ════════════════════════════════════════════════════════════════
// Geração de Alertas MPC
// ════════════════════════════════════════════════════════════════

function generateAlerts(rawData: any, metrics: MPCMetrics): MPCAlert[] {
  const alerts: MPCAlert[] = [];

  // Não gerar alertas se dados estão zerados (configuração inicial)
  if (!rawData.dentists || rawData.dentists.length === 0) {
    alerts.push({
      id: "alert_setup_required",
      level: "low",
      title: "Configure os dentistas para começar",
      probableCause: "Nenhum dentista foi cadastrado",
      impact: "Não será possível registrar atendimentos",
      suggestedAction: "Clique em 'Editar Dados' e adicione seus dentistas",
      affectedEntity: "Setup",
      timestamp: new Date(),
    });
    return alerts;
  }

  // Alert 1: Produção abaixo de 75% da meta
  if (metrics.producao.meta > 0 && metrics.producao.percentualMeta < 75) {
    alerts.push({
      id: "alert_producao_baixa",
      level: metrics.producao.percentualMeta < 50 ? "critical" : "medium",
      title: "Produção abaixo da meta",
      probableCause:
        metrics.producao.percentualMeta < 50
          ? "Múltiplas vagas não preenchidas ou ausência de dentista"
          : "Agendas subutilizadas ou cancelamentos de última hora",
      impact: `Perda estimada de R$ ${Math.round((metrics.producao.meta - metrics.producao.total) * 500)}`,
      suggestedAction: "Revisar disponibilidade de agendas e contatar leads em lista de espera",
      affectedEntity: "Clínica",
      timestamp: new Date(),
    });
  }

  // Alert 2: Conversão abaixo de 75% da meta
  if (metrics.conversao.percentualMeta > 0 && metrics.conversao.percentualMeta < 75) {
    alerts.push({
      id: "alert_conversao_baixa",
      level: "medium",
      title: "Taxa de conversão fora do padrão",
      probableCause: "Possível aumento em desistências ou agendamentos com muito antecedência",
      impact: `${Math.round(100 - metrics.conversao.total)}% dos agendados não comparecendo`,
      suggestedAction: "Aumentar frequência de lembretes e confirmar agendamentos",
      affectedEntity: "Comercial",
      timestamp: new Date(),
    });
  }

  // Alert 3: Comparecimento abaixo de 85%
  if (metrics.comparecimento.percentualMeta > 0 && metrics.comparecimento.percentualMeta < 85) {
    alerts.push({
      id: "alert_comparecimento_baixo",
      level: metrics.comparecimento.percentualMeta < 70 ? "critical" : "medium",
      title: `Taxa de no-show alta (${Math.round(100 - metrics.comparecimento.total)}%)`,
      probableCause: "Confirmações inefetivas ou falha no lembrete",
      impact: `Receita em risco: R$ ${Math.round((metrics.comparecimento.meta - metrics.comparecimento.total) * 100 * 500)}`,
      suggestedAction: "Implementar confirmação 24h antes e WhatsApp com vídeo/mapas",
      affectedEntity: "Recepção",
      timestamp: new Date(),
    });
  }

  // Alert 4: Satisfação abaixo de 4.0
  if (metrics.satisfacao.total > 0 && metrics.satisfacao.total < 4.0) {
    alerts.push({
      id: "alert_satisfacao_baixa",
      level: "critical",
      title: "Satisfação crítica do cliente",
      probableCause: "Problemas na recepção, clínica ou ortodontia. Verificar surveys.",
      impact: "Risco de desistência e reclamações boca-a-boca negativas",
      suggestedAction: "Auditar feedback de pacientes e treinar equipe",
      affectedEntity: "Recepção/Clínica",
      timestamp: new Date(),
    });
  }

  // Alert 5: Receita abaixo da meta
  if (metrics.receita.meta > 0 && metrics.receita.percentualMeta < 80) {
    alerts.push({
      id: "alert_receita_baixa",
      level: "critical",
      title: "Receita do dia abaixo da meta",
      probableCause: "Combinação de baixa produção, conversão e comparecimento",
      impact: `Deficit de R$ ${Math.round(metrics.receita.meta - metrics.receita.total)}`,
      suggestedAction: "Revisar performance diária e executar ações corretivas",
      affectedEntity: "Financeiro",
      timestamp: new Date(),
    });
  }

  return alerts.sort((a, b) => {
    const levelOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return levelOrder[a.level as "critical" | "high" | "medium" | "low"] - levelOrder[b.level as "critical" | "high" | "medium" | "low"];
  });
}

// ════════════════════════════════════════════════════════════════
// Performance por Dentista
// ════════════════════════════════════════════════════════════════

function calculateDentistPerformance(rawData: any): DentistPerformance[] {
  const dentists = rawData.dentists || [];
  const appointments = rawData.appointments || [];
  const surveys = rawData.surveys || [];

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);

  return dentists.map((d: any) => {
    const dentistAppts = appointments.filter((a: any) => a.dentistId === d.id);
    const attendedAppts = dentistAppts.filter((a: any) => a.status === "attended");
    const scheduledCount = dentistAppts.filter((a: any) => a.status === "scheduled").length;

    // Contagens por período
    const totalAttended = attendedAppts.length;

    const todayAttended = attendedAppts.filter((a: any) => {
      const d = a.attendedAt || a.createdAt || "";
      return d.startsWith(todayStr);
    }).length;

    const weekAttended = attendedAppts.filter((a: any) => {
      const d = new Date(a.attendedAt || a.createdAt || 0);
      return d >= weekAgo;
    }).length;

    const monthAttended = attendedAppts.filter((a: any) => {
      const d = new Date(a.attendedAt || a.createdAt || 0);
      return d >= monthAgo;
    }).length;

    const conversionRate = scheduledCount > 0
      ? (totalAttended / (scheduledCount + totalAttended)) * 100
      : totalAttended > 0 ? 100 : 0;

    // Satisfação média de toda a clínica (surveys não têm dentistId)
    const avgSatisfaction = surveys.length > 0
      ? Math.round((surveys.reduce((s: number, sv: any) => s + (sv.score || 0), 0) / surveys.length) * 10) / 10
      : 0;

    // Trend 90d — conta atendidos por dia
    const trend90d = Array.from({ length: 90 }, (_, i) => {
      const target = new Date(now);
      target.setDate(target.getDate() - (89 - i));
      const dateStr = target.toISOString().split("T")[0];
      return attendedAppts.filter((a: any) =>
        (a.attendedAt || a.createdAt || "").startsWith(dateStr)
      ).length;
    });

    const dailyTarget = d.dailyTarget || 10;

    // Status: "none" se nunca teve atendimento; caso contrário baseado em hoje vs meta
    const status: "ok" | "warning" | "critical" | "none" =
      totalAttended === 0
        ? "none"
        : todayAttended >= dailyTarget
        ? "ok"
        : todayAttended >= Math.ceil(dailyTarget * 0.6)
        ? "warning"
        : "critical";

    return {
      id: d.id,
      name: d.name,
      specialty: d.specialty || "",
      dailyTarget,
      todayAttended,
      weekAttended,
      monthAttended,
      totalAttended,
      conversionRate: Math.round(conversionRate * 10) / 10,
      satisfaction: avgSatisfaction,
      status,
      trend90d,
      lastUpdated: new Date(),
    };
  });
}

// ════════════════════════════════════════════════════════════════
// Saúde dos Setores
// ════════════════════════════════════════════════════════════════

function calculateSectorHealth(rawData: any): SectorHealth[] {
  const surveys = rawData.surveys || [];
  
  const sectors = [
    { name: "Recepção", key: "reception" },
    { name: "Clínica", key: "clinic" },
    { name: "Ortodontia", key: "ortho" },
    { name: "Comercial", key: "sales" },
  ];

  return sectors.map((sector) => {
    const sectorSurveys = surveys.filter((s: any) => s.sector === sector.key);
    const avgSat = sectorSurveys.length > 0
      ? sectorSurveys.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / sectorSurveys.length
      : 0;

    const topIssues: string[] = [];
    if (avgSat < 3.5) topIssues.push("Qualidade de atendimento baixa");
    if (avgSat < 3.0) topIssues.push("Risco iminente de reclamações");

    return {
      name: sector.name,
      score: avgSat,
      status:
        avgSat >= 4.5
          ? "excellent"
          : avgSat >= 4.0
            ? "good"
            : avgSat >= 3.5
              ? "fair"
              : "poor",
      topIssues,
      avgSatisfaction: avgSat,
      lastUpdated: new Date(),
    };
  });
}

// ════════════════════════════════════════════════════════════════
// Foco da Semana
// ════════════════════════════════════════════════════════════════

function generateWeeklyFocus(alerts: MPCAlert[], metrics: MPCMetrics): WeeklyFocus[] {
  const focus: WeeklyFocus[] = [];

  // Prioridade 1: Critical alerts
  alerts
    .filter((a) => a.level === "critical")
    .slice(0, 2)
    .forEach((alert) => {
      focus.push({
        id: `focus_${alert.id}`,
        priority: alert.title,
        rationale: alert.suggestedAction,
        targetMetric: alert.affectedEntity,
      });
    });

  // Prioridade 2: Overall meta improvement
  if (metrics.metaGeral < 90) {
    focus.push({
      id: "focus_meta_geral",
      priority: "Aumentar performance geral",
      rationale: "Meta geral está em 75%. Necessário executar ações em paralelo.",
      targetMetric: "Métrica geral",
    });
  }

  return focus;
}

// ════════════════════════════════════════════════════════════════
// Recomendações de Decisão
// ════════════════════════════════════════════════════════════════

function generateRecommendedDecisions(
  alerts: MPCAlert[],
  metrics: MPCMetrics
): RecommendedDecision[] {
  const decisions: RecommendedDecision[] = [];

  // Decisão 1: Baseada em alert de produção
  const prodAlert = alerts.find((a) => a.id === "alert_producao_baixa");
  if (prodAlert) {
    decisions.push({
      id: "decision_producao",
      title: "Redistribuir agenda e ativar lista de espera",
      description:
        "Aumentar produção de 65% para 85% da meta em 3 dias mediante reativação de leads em espera.",
      impact: "high",
      basedOnAlert: prodAlert.id,
      estimatedOutcome: `+R$ ${Math.round(5000)}`,
      actionItems: [
        "Contatar 15-20 leads em lista de espera",
        "Oferecer 20% de desconto para agendamentos hoje",
        "Redistribuir agenda entre dentistas ociosos",
      ],
    });
  }

  // Decisão 2: Baseada em comparecimento
  const noShowAlert = alerts.find((a) => a.id === "alert_comparecimento_baixo");
  if (noShowAlert) {
    decisions.push({
      id: "decision_noshow",
      title: "Implementar protocolo de confirmação automática",
      description:
        "Reduzir no-show de 20% para 10% em 7 dias com automação de confirmação por WhatsApp.",
      impact: "high",
      basedOnAlert: noShowAlert.id,
      estimatedOutcome: `+R$ ${Math.round(3000)}`,
      actionItems: [
        "Ativar confirmação WhatsApp 24h antes",
        "Treinar recepção em técnica de confirmação",
        "Criar fluxo de recall para os que não confirmarem",
      ],
    });
  }

  // Decisão 3: Baseada em satisfação
  const satAlert = alerts.find((a) => a.id === "alert_satisfacao_baixa");
  if (satAlert) {
    decisions.push({
      id: "decision_satisfacao",
      title: "Auditoria de qualidade nos setores com baixa satisfação",
      description: "Identificar causa-raiz da baixa satisfação e executar treinamento.",
      impact: "medium",
      basedOnAlert: satAlert.id,
      estimatedOutcome: "Retenção de clientes",
      actionItems: [
        "Entrevistar 5-10 pacientes insatisfeitos",
        "Documentar problemas recorrentes",
        "Planejar treinamento específico da equipe",
      ],
    });
  }

  return decisions;
}

// ════════════════════════════════════════════════════════════════
// Dados Mock para Desenvolvimento
// ════════════════════════════════════════════════════════════════

function getMockMPCData() {
  // Retornar estrutura zerada para edição manual
  return {
    appointments: [],
    surveys: [],
    dentists: [],
    averageTicket: 0,
  };
}
