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
  MPCWeeklyReport,
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
    const weeklyReport = generateWeeklyReport(store, dentistPerformance, sectorHealth);

    return {
      metrics,
      alerts,
      dentistPerformance,
      sectorHealth,
      weeklyFocus,
      recommendedDecisions,
      weeklyReport,
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
  const budgets = rawData.budgets || [];
  const surveys = rawData.surveys || [];
  const dentists = rawData.dentists || [];

  const normalize = (v: string) =>
    (v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const entityKey = (dentistId: string, patientId?: string, patientName?: string) => {
    if (patientId) return `${dentistId}::id::${patientId}`;
    return `${dentistId}::name::${normalize(patientName || "")}`;
  };

  const isOperationalStatus = (status?: string) =>
    status === "attended" || status === "scheduled" || status === "confirmed";

  const isToday = (value?: string) => {
    if (!value) return false;
    const dt = new Date(value);
    dt.setHours(0, 0, 0, 0);
    return dt.getTime() === today.getTime();
  };

  // Produção: atendimentos totais = atendimentos operacionais + avaliações (orçamentos)
  const operationalToday = appointments.filter((a: any) => {
    if (!a.attendedAt && !a.createdAt) return false;
    return isOperationalStatus(a.status) && isToday(a.attendedAt || a.createdAt);
  }).length;

  const budgetsToday = budgets.filter((b: any) => isToday(b.budgetAt || b.createdAt)).length;
  const totalAttendanceToday = operationalToday + budgetsToday;

  // Receita segue baseada em atendimentos concluídos
  const attendedToday = appointments.filter((a: any) => {
    if (!a.attendedAt && !a.createdAt) return false;
    const att = new Date(a.attendedAt || a.createdAt || new Date());
    att.setHours(0, 0, 0, 0);
    return a.status === "attended" && att.getTime() === today.getTime();
  }).length;
  
  const productionMeta = dentists.reduce((sum: number, d: any) => sum + (d.dailyTarget || 10), 0);

  // Conversão real: orçamento -> atendimento (deduplicado por dentista + paciente)
  const budgetSet = new Set<string>();
  budgets.forEach((b: any) => {
    budgetSet.add(entityKey(b.dentistId, b.patientId, b.patientName));
  });

  const convertedSet = new Set<string>();
  appointments
    .filter((a: any) => a.status === "attended")
    .forEach((a: any) => {
      const k = entityKey(a.dentistId, a.patientId, a.patientName);
      if (budgetSet.has(k)) convertedSet.add(k);
    });

  const conversionRate = budgetSet.size > 0 ? (convertedSet.size / budgetSet.size) * 100 : 0;

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
        ((totalAttendanceToday / productionMeta) * 100) * 0.35 +
        (conversionRate || 0) * 0.35 +
        (avgSatisfaction > 0 ? (avgSatisfaction / 5) * 100 : 100) * 0.30
      ))
    : 0;

  return {
    producao: {
      total: totalAttendanceToday,
      meta: productionMeta || 1,
      percentualMeta: productionMeta > 0 ? (totalAttendanceToday / productionMeta) * 100 : 0,
      tendencia: 0,
    },
    conversao: {
      total: Math.round(conversionRate * 10) / 10,
      meta: 85,
      percentualMeta: (conversionRate / 85) * 100,
      tendencia: 0,
    },
    comparecimento: {
      total: 0,
      meta: 0,
      percentualMeta: 0,
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
      impact: `${Math.round(100 - metrics.conversao.total)}% dos orçamentos ainda não converteram em atendimento`,
      suggestedAction: "Reforçar follow-up comercial dos orçamentos pendentes",
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
      probableCause: "Combinação de baixo volume operacional, conversão e satisfação",
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
  const budgets = rawData.budgets || [];
  const surveys = rawData.surveys || [];

  const normalize = (v: string) =>
    (v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const entityKey = (dentistId: string, patientId?: string, patientName?: string) => {
    if (patientId) return `${dentistId}::id::${patientId}`;
    return `${dentistId}::name::${normalize(patientName || "")}`;
  };

  const isOperationalStatus = (status?: string) =>
    status === "attended" || status === "scheduled" || status === "confirmed";

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);

  const inRange = (value: string | undefined, start?: Date) => {
    const d = new Date(value || 0);
    if (!start) return false;
    return d >= start;
  };

  return dentists.map((d: any) => {
    const dentistAppts = appointments.filter((a: any) => a.dentistId === d.id);
    const dentistBudgets = budgets.filter((b: any) => b.dentistId === d.id);
    const productionAppts = dentistAppts.filter((a: any) => isOperationalStatus(a.status));
    const attendedAppts = dentistAppts.filter((a: any) => a.status === "attended");

    // Contagens por período
    const totalAttended = productionAppts.length + dentistBudgets.length;

    const todayAttended = productionAppts.filter((a: any) => {
      const d = a.attendedAt || a.createdAt || "";
      return d.startsWith(todayStr);
    }).length + dentistBudgets.filter((b: any) => String(b.budgetAt || b.createdAt || "").startsWith(todayStr)).length;

    const weekAttended = productionAppts.filter((a: any) => {
      return inRange(a.attendedAt || a.createdAt, weekAgo);
    }).length + dentistBudgets.filter((b: any) => inRange(b.budgetAt || b.createdAt, weekAgo)).length;

    const monthAttended = productionAppts.filter((a: any) => {
      return inRange(a.attendedAt || a.createdAt, monthAgo);
    }).length + dentistBudgets.filter((b: any) => inRange(b.budgetAt || b.createdAt, monthAgo)).length;

    const budgetMap = new Map<string, any>();
    dentistBudgets.forEach((b: any) => {
      const k = entityKey(d.id, b.patientId, b.patientName);
      if (!budgetMap.has(k)) budgetMap.set(k, b);
    });

    const attendedMap = new Map<string, any>();
    attendedAppts.forEach((a: any) => {
      const k = entityKey(d.id, a.patientId, a.patientName);
      if (!attendedMap.has(k)) attendedMap.set(k, a);
    });

    const convertedLeads = Array.from(attendedMap.entries())
      .filter(([k]) => budgetMap.has(k))
      .map(([k, a]) => {
        const b = budgetMap.get(k);
        return {
          name: a.patientName || b?.patientName || "Sem nome",
          budgetDate: String(b?.budgetAt || "").slice(0, 10),
          attendedDate: String(a?.attendedAt || "").slice(0, 10),
          phone: a.patientPhone || b?.patientPhone,
        };
      });

    const conversionRate = budgetMap.size > 0
      ? (convertedLeads.length / budgetMap.size) * 100
      : 0;

    const attendedLeads = productionAppts
      .map((a: any) => ({
        name: a.patientName || "Sem nome",
        date: String(a.attendedAt || a.createdAt || "").slice(0, 10),
        phone: a.patientPhone,
        status: a.status,
      }))
      .concat(
        dentistBudgets.map((b: any) => ({
          name: b.patientName || "Sem nome",
          date: String(b.budgetAt || b.createdAt || "").slice(0, 10),
          phone: b.patientPhone,
          status: "budget",
        }))
      )
      .sort((x: any, y: any) => (y.date || "").localeCompare(x.date || ""));

    const budgetLeads = dentistBudgets
      .map((b: any) => ({
        name: b.patientName || "Sem nome",
        date: String(b.budgetAt || "").slice(0, 10),
        phone: b.patientPhone,
      }))
      .sort((x: any, y: any) => (y.date || "").localeCompare(x.date || ""));

    // Satisfação média de toda a clínica (surveys não têm dentistId)
    const avgSatisfaction = surveys.length > 0
      ? Math.round((surveys.reduce((s: number, sv: any) => s + (sv.score || 0), 0) / surveys.length) * 10) / 10
      : 0;

    // Trend 90d — conta atendimentos totais (operacional + orçamentos)
    const trend90d = Array.from({ length: 90 }, (_, i) => {
      const target = new Date(now);
      target.setDate(target.getDate() - (89 - i));
      const dateStr = target.toISOString().split("T")[0];
      const opCount = productionAppts.filter((a: any) =>
        (a.attendedAt || a.createdAt || "").startsWith(dateStr)
      ).length;
      const budgetCount = dentistBudgets.filter((b: any) =>
        (b.budgetAt || b.createdAt || "").startsWith(dateStr)
      ).length;
      return opCount + budgetCount;
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
      attendedLeads,
      budgetLeads,
      convertedLeads,
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

function generateWeeklyReport(
  rawData: any,
  dentistPerformance: DentistPerformance[],
  sectorHealth: SectorHealth[]
): MPCWeeklyReport {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(weekStart);

  const appointments = rawData.appointments || [];
  const budgets = rawData.budgets || [];
  const surveys = rawData.surveys || [];
  const dentists = rawData.dentists || [];

  const normalize = (v: string) =>
    (v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const entityKey = (dentistId: string, patientId?: string, patientName?: string) => {
    if (patientId) return `${dentistId}::id::${patientId}`;
    return `${dentistId}::name::${normalize(patientName || "")}`;
  };

  const isOperationalStatus = (status?: string) =>
    status === "attended" || status === "scheduled" || status === "confirmed";

  const attendedWeek = appointments.filter((a: any) => {
    if (!isOperationalStatus(a.status)) return false;
    const dt = new Date(a.attendedAt || a.createdAt || 0);
    return dt >= weekStart && dt <= now;
  });

  const attendedPrevWeek = appointments.filter((a: any) => {
    if (!isOperationalStatus(a.status)) return false;
    const dt = new Date(a.attendedAt || a.createdAt || 0);
    return dt >= prevWeekStart && dt < prevWeekEnd;
  });

  const clinicAttended = attendedWeek.length;
  const dailyClinicCapacity = dentists.reduce((sum: number, d: any) => sum + (d.dailyTarget || 10), 0);
  const clinicCapacity = dailyClinicCapacity * 7;
  const clinicUtilization = clinicCapacity > 0 ? (clinicAttended / clinicCapacity) * 100 : 0;

  const lowOccupancyDays = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + idx);
    const dateStr = d.toISOString().split("T")[0];
    const attended = attendedWeek.filter((a: any) =>
      String(a.attendedAt || a.createdAt || "").startsWith(dateStr)
    ).length;
    return {
      date: dateStr,
      attended,
      capacity: dailyClinicCapacity,
    };
  }).filter((d) => d.capacity > 0 && d.attended < Math.ceil(d.capacity * 0.6));

  const conversionTarget = 85;
  const dentistSummaries = dentistPerformance.map((d) => {
    const weekTarget = (d.dailyTarget || 10) * 7;

    const dentistApptsWeek = appointments.filter((a: any) => {
      const dt = new Date(a.attendedAt || a.createdAt || 0);
      return a.dentistId === d.id && dt >= weekStart && dt <= now;
    });
    const dentistOperationalWeek = dentistApptsWeek.filter((a: any) => isOperationalStatus(a.status)).length;

    const dentistBudgetsWeek = budgets.filter((b: any) => {
      const dt = new Date(b.budgetAt || b.createdAt || 0);
      return b.dentistId === d.id && dt >= weekStart && dt <= now;
    });

    const dentistBudgetSet = new Set<string>();
    dentistBudgetsWeek.forEach((b: any) => {
      dentistBudgetSet.add(entityKey(d.id, b.patientId, b.patientName));
    });

    const dentistConvertedSet = new Set<string>();
    dentistApptsWeek
      .filter((a: any) => a.status === "attended")
      .forEach((a: any) => {
        const key = entityKey(d.id, a.patientId, a.patientName);
        if (dentistBudgetSet.has(key)) dentistConvertedSet.add(key);
      });

    const conversionRate = dentistBudgetSet.size > 0
      ? (dentistConvertedSet.size / dentistBudgetSet.size) * 100
      : 0;

    const dentistApptsPrevWeek = appointments.filter((a: any) => {
      const dt = new Date(a.attendedAt || a.createdAt || 0);
      return a.dentistId === d.id && isOperationalStatus(a.status) && dt >= prevWeekStart && dt < prevWeekEnd;
    }).length;

    const trend: "up" | "down" | "stable" =
      dentistOperationalWeek > dentistApptsPrevWeek
        ? "up"
        : dentistOperationalWeek < dentistApptsPrevWeek
        ? "down"
        : "stable";

    const dentistSurveys = surveys.filter((s: any) => {
      if (!s.leadId) return false;
      return attendedWeek.some((a: any) => a.dentistId === d.id && a.patientId === s.leadId);
    });
    const satisfaction = dentistSurveys.length > 0
      ? dentistSurveys.reduce((acc: number, s: any) => acc + (s.score || 0), 0) / dentistSurveys.length
      : 0;

    return {
      dentistId: d.id,
      name: d.name,
      attended: dentistOperationalWeek,
      target: weekTarget,
      deltaToTarget: dentistOperationalWeek - weekTarget,
      avgDaily: dentistOperationalWeek / 7,
      trend,
      conversionRate: Math.round(conversionRate * 10) / 10,
      conversionTarget,
      conversionDelta: Math.round((conversionRate - conversionTarget) * 10) / 10,
      satisfaction: Math.round(satisfaction * 10) / 10,
      surveyCount: dentistSurveys.length,
      budgetCount: dentistBudgetSet.size,
      convertedCount: dentistConvertedSet.size,
      pendingBudgetCount: Math.max(0, dentistBudgetSet.size - dentistConvertedSet.size),
    };
  });

  const receptionSurveys = surveys.filter((s: any) => {
    if (s.sector !== "reception") return false;
    const dt = new Date(s.createdAt || 0);
    return dt >= weekStart && dt <= now;
  });

  const receptionAvg = receptionSurveys.length > 0
    ? receptionSurveys.reduce((acc: number, s: any) => acc + (s.score || 0), 0) / receptionSurveys.length
    : 0;

  const receptionComplaints = receptionSurveys
    .filter((s: any) => (s.score || 0) <= 3 && s.comment)
    .map((s: any) => String(s.comment))
    .slice(0, 5);

  const outliers: string[] = [];
  dentistSummaries.forEach((d) => {
    if (d.deltaToTarget < 0) outliers.push(`${d.name} abaixo da meta de atendimentos (${d.attended}/${d.target}).`);
    if (d.conversionDelta < 0) outliers.push(`${d.name} com conversão abaixo da meta (${d.conversionRate}% vs ${d.conversionTarget}%).`);
    if (d.surveyCount > 0 && d.satisfaction < 4) outliers.push(`${d.name} com satisfação baixa (${d.satisfaction}/5).`);
  });

  if (receptionSurveys.length > 0 && receptionAvg < 4) {
    outliers.push(`Recepção abaixo do padrão de satisfação (${Math.round(receptionAvg * 10) / 10}/5).`);
  }

  const productivityWinner = [...dentistSummaries].sort((a, b) => b.attended - a.attended)[0];
  const conversionWinner = [...dentistSummaries].sort((a, b) => b.conversionRate - a.conversionRate)[0];
  const satisfactionWinner = [...dentistSummaries]
    .filter((d) => d.surveyCount > 0)
    .sort((a, b) => b.satisfaction - a.satisfaction)[0];

  const currentWeekConvBase = budgets.filter((b: any) => {
    const dt = new Date(b.budgetAt || b.createdAt || 0);
    return dt >= weekStart && dt <= now;
  });
  const prevWeekConvBase = budgets.filter((b: any) => {
    const dt = new Date(b.budgetAt || b.createdAt || 0);
    return dt >= prevWeekStart && dt < prevWeekEnd;
  });
  const weekBudgetSet = new Set<string>();
  currentWeekConvBase.forEach((b: any) => weekBudgetSet.add(entityKey(b.dentistId, b.patientId, b.patientName)));
  const weekConvertedSet = new Set<string>();
  attendedWeek
    .filter((a: any) => a.status === "attended")
    .forEach((a: any) => {
      const key = entityKey(a.dentistId, a.patientId, a.patientName);
      if (weekBudgetSet.has(key)) weekConvertedSet.add(key);
    });

  const prevWeekBudgetSet = new Set<string>();
  prevWeekConvBase.forEach((b: any) => prevWeekBudgetSet.add(entityKey(b.dentistId, b.patientId, b.patientName)));
  const prevWeekAttended = appointments.filter((a: any) => {
    if (a.status !== "attended") return false;
    const dt = new Date(a.attendedAt || a.createdAt || 0);
    return dt >= prevWeekStart && dt < prevWeekEnd;
  });
  const prevWeekConvertedSet = new Set<string>();
  prevWeekAttended.forEach((a: any) => {
    const key = entityKey(a.dentistId, a.patientId, a.patientName);
    if (prevWeekBudgetSet.has(key)) prevWeekConvertedSet.add(key);
  });

  const currentWeekConv = weekBudgetSet.size > 0 ? (weekConvertedSet.size / weekBudgetSet.size) * 100 : 0;
  const prevWeekConv = prevWeekBudgetSet.size > 0 ? (prevWeekConvertedSet.size / prevWeekBudgetSet.size) * 100 : 0;

  const currentWeekSatSurveys = surveys.filter((s: any) => {
    const dt = new Date(s.createdAt || 0);
    return dt >= weekStart && dt <= now;
  });
  const prevWeekSatSurveys = surveys.filter((s: any) => {
    const dt = new Date(s.createdAt || 0);
    return dt >= prevWeekStart && dt < prevWeekEnd;
  });
  const currentWeekSat = currentWeekSatSurveys.length > 0
    ? currentWeekSatSurveys.reduce((acc: number, s: any) => acc + (s.score || 0), 0) / currentWeekSatSurveys.length
    : 0;
  const prevWeekSat = prevWeekSatSurveys.length > 0
    ? prevWeekSatSurveys.reduce((acc: number, s: any) => acc + (s.score || 0), 0) / prevWeekSatSurveys.length
    : 0;

  const concerningTrends: string[] = [];
  if (attendedPrevWeek.length > 0 && clinicAttended < attendedPrevWeek.length) {
    concerningTrends.push(`Produtividade semanal caiu de ${attendedPrevWeek.length} para ${clinicAttended} atendimentos.`);
  }
  if (prevWeekConv > 0 && currentWeekConv < prevWeekConv) {
    concerningTrends.push(`Conversão semanal caiu de ${Math.round(prevWeekConv)}% para ${Math.round(currentWeekConv)}%.`);
  }
  if (prevWeekSat > 0 && currentWeekSat < prevWeekSat) {
    concerningTrends.push(`Satisfação média caiu de ${prevWeekSat.toFixed(1)} para ${currentWeekSat.toFixed(1)}.`);
  }

  const managementActions: string[] = [];
  dentistSummaries
    .filter((d) => d.deltaToTarget < 0)
    .slice(0, 2)
    .forEach((d) => managementActions.push(`Reavaliar agenda de ${d.name} devido ao volume abaixo da meta.`));
  dentistSummaries
    .filter((d) => d.conversionDelta < 0)
    .slice(0, 2)
    .forEach((d) => managementActions.push(`Acompanhar conversão de ${d.name}, abaixo da meta semanal.`));
  if (receptionAvg > 0 && receptionAvg < 4) {
    managementActions.push("Revisar fluxo da recepção e reforçar protocolo de acolhimento.");
  }
  if (satisfactionWinner) {
    managementActions.push(`Manter e replicar as práticas de ${satisfactionWinner.name}, destaque em satisfação.`);
  }

  const fmt = (d: Date) => d.toLocaleDateString("pt-BR");
  const periodLabel = `${fmt(weekStart)} a ${fmt(now)}`;

  return {
    periodLabel,
    clinicAttended,
    clinicCapacity,
    clinicUtilization: Math.round(clinicUtilization * 10) / 10,
    lowOccupancyDays,
    dentistSummaries,
    receptionAvg: Math.round(receptionAvg * 10) / 10,
    receptionComplaints,
    outliers,
    topPerformers: {
      productivity: productivityWinner ? `${productivityWinner.name} (${productivityWinner.attended} atendimentos)` : undefined,
      conversion: conversionWinner ? `${conversionWinner.name} (${conversionWinner.conversionRate}%)` : undefined,
      satisfaction: satisfactionWinner ? `${satisfactionWinner.name} (${satisfactionWinner.satisfaction}/5)` : undefined,
    },
    concerningTrends,
    managementActions,
  };
}
