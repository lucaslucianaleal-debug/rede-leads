import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lead } from "@/types/crm";
import { TrendingUp, TrendingDown, Minus, Target, Zap, BarChart2, AlertCircle, Lightbulb } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface ComparisonChartProps {
  leads: Lead[];
}

type MetricKey = "leads_novos" | "agendamentos" | "compareceu" | "nao_compareceu";

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: "leads_novos", label: "Leads Novos" },
  { key: "agendamentos", label: "Agendamentos" },
  { key: "compareceu", label: "Compareceu" },
  { key: "nao_compareceu", label: "Não Compareceu" },
];

// Metas mensais para tomada de decisão
const MONTHLY_GOALS = {
  leads_novos: 200,           // 200 leads novos/mês
  agendamentos: 80,           // 40% de conversão = 80 agendamentos dos 200 leads
  compareceu: 40,             // 50% de comparecimento dos 80 agendamentos
};

const LINE_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

function getAvailableMonths(n = 12): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(format(d, "MM/yyyy"));
  }
  return months;
}

function getMonthLabel(mmYYYY: string): string {
  const [mm, yyyy] = mmYYYY.split("/");
  const d = new Date(parseInt(yyyy), parseInt(mm) - 1, 1);
  return format(d, "MMM/yy", { locale: ptBR });
}

function getDaysInMonthStr(mmYYYY: string): number {
  const [mm, yyyy] = mmYYYY.split("/");
  return new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
}

function getDateField(lead: Lead, metric: MetricKey): string | undefined {
  switch (metric) {
    case "leads_novos":   return lead.dataCriacao;
    case "agendamentos":  return lead.dataAgendamentoCriado;
    case "compareceu":    return lead.dataAgendamento;
    case "nao_compareceu": return lead.dataAgendamento;
  }
}

function matchesMetric(lead: Lead, metric: MetricKey): boolean {
  if (metric === "compareceu")     return lead.comparecimento === "COMPARECEU";
  if (metric === "nao_compareceu") return lead.comparecimento === "NÃO COMPARECEU";
  return true;
}

// Conta leads para um mês inteiro (ou até um dia específico)
function countForMonth(
  leads: Lead[],
  metric: MetricKey,
  mmYYYY: string,
  upToDay?: number
): number {
  const [mm, yyyy] = mmYYYY.split("/");
  return leads.filter((lead) => {
    const dateField = getDateField(lead, metric);
    if (!dateField) return false;
    if (!matchesMetric(lead, metric)) return false;
    // formato dd/MM/yyyy
    const parts = dateField.split("/");
    if (parts.length < 3) return false;
    const d = parseInt(parts[0], 10);
    const m = parts[1];
    const y = parts[2].slice(0, 4);
    if (m !== mm || y !== yyyy) return false;
    if (upToDay !== undefined && d > upToDay) return false;
    return true;
  }).length;
}

// Conta por dia de um mês (retorna array[0..daysInMonth-1])
function dailyCountsForMonth(leads: Lead[], metric: MetricKey, mmYYYY: string): number[] {
  const daysInMonth = getDaysInMonthStr(mmYYYY);
  const [mm, yyyy] = mmYYYY.split("/");
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayStr = `${String(day).padStart(2, "0")}/${mm}/${yyyy}`;
    return leads.filter((lead) => {
      const dateField = getDateField(lead, metric);
      if (!dateField) return false;
      return dateField.startsWith(dayStr) && matchesMetric(lead, metric);
    }).length;
  });
}

// ─── Helper: Fonte breakdown para qualquer métrica ────────────────────────
function getSourceBreakdownForMetric(
  leads: Lead[],
  metric: MetricKey,
  mmYYYY: string,
  upToDay?: number
): { [key: string]: number } {
  const [mm, yyyy] = mmYYYY.split("/");
  const breakdown: { [key: string]: number } = {};

  leads
    .filter((lead) => {
      const dateField = getDateField(lead, metric);
      if (!dateField) return false;
      if (!matchesMetric(lead, metric)) return false;
      const parts = dateField.split("/");
      if (parts.length < 3) return false;
      const d = parseInt(parts[0], 10);
      const m = parts[1];
      const y = parts[2].slice(0, 4);
      if (m !== mm || y !== yyyy) return false;
      if (upToDay !== undefined && d > upToDay) return false;
      return true;
    })
    .forEach((lead) => {
      const fonte = lead.fonteLead || "Outro";
      breakdown[fonte] = (breakdown[fonte] || 0) + 1;
    });

  return breakdown;
}

// ─── Helper: Status dos agendados (compareceu / aguardando / não veio) ─────
// Conta APENAS agendamentos até hoje (upToDay).
// Filtra por dataAgendamento (data da consulta), igual ao card "Compareceu".
function getAgendamentoStatusBreakdown(
  leads: Lead[],
  mmYYYY: string,
  upToDay?: number
): { compareceu: number; nao_compareceu: number; aguardando: number; total: number } {
  const [mm, yyyy] = mmYYYY.split("/");
  const agendados = leads.filter((lead) => {
    const dc = lead.dataAgendamento || "";
    const datePart = dc.split(" ")[0];
    const parts = datePart.split("/");
    if (parts.length < 3) return false;
    const d = parseInt(parts[0], 10);
    const m = parts[1];
    const y = parts[2].slice(0, 4);
    if (m !== mm || y !== yyyy) return false;
    if (upToDay !== undefined && d > upToDay) return false;
    return true;
  });
  return {
    compareceu: agendados.filter(l => l.comparecimento === "COMPARECEU").length,
    nao_compareceu: agendados.filter(l => l.comparecimento === "NÃO COMPARECEU").length,
    aguardando: agendados.filter(l => !l.comparecimento || l.comparecimento === "AGUARDANDO DATA").length,
    total: agendados.length,
  };
}

// ─── Helper: Funil de conversão por fonte ─────────────────────────────────
// Usa os mesmos campos de data que os cards para garantir consistência de números.
// leads      → dataCriacao no período
// agendamentos → dataAgendamentoCriado no período
// compareceu → dataAgendamento no período + comparecimento === "COMPARECEU"
function getConversionFunnelByFonte(
  leads: Lead[],
  periods: Array<{ mmYYYY: string; upToDay?: number }>
): Array<{ fonte: string; leads: number; agendamentos: number; compareceu: number; convRate: number; showRate: number }> {
  function inPeriod(dateStr: string | undefined, mm: string, yyyy: string, upToDay?: number): boolean {
    if (!dateStr) return false;
    const parts = dateStr.split("/");
    if (parts.length < 3) return false;
    const d = parseInt(parts[0], 10);
    if (parts[1] !== mm || parts[2].slice(0, 4) !== yyyy) return false;
    if (upToDay !== undefined && d > upToDay) return false;
    return true;
  }

  const fonteMap = new Map<string, { leads: number; agendamentos: number; compareceu: number }>();

  function inc(fonte: string, field: "leads" | "agendamentos" | "compareceu") {
    if (!fonteMap.has(fonte)) fonteMap.set(fonte, { leads: 0, agendamentos: 0, compareceu: 0 });
    fonteMap.get(fonte)![field]++;
  }

  for (const lead of leads) {
    const fonte = lead.fonteLead || "Outro";
    for (const { mmYYYY, upToDay } of periods) {
      const [mm, yyyy] = mmYYYY.split("/");
      if (inPeriod(lead.dataCriacao, mm, yyyy, upToDay))           inc(fonte, "leads");
      if (inPeriod(lead.dataAgendamentoCriado, mm, yyyy, upToDay)) inc(fonte, "agendamentos");
      if (lead.comparecimento === "COMPARECEU" && inPeriod(lead.dataAgendamento, mm, yyyy, upToDay)) inc(fonte, "compareceu");
    }
  }

  return Array.from(fonteMap.entries())
    .map(([fonte, v]) => ({
      fonte,
      leads: v.leads,
      agendamentos: v.agendamentos,
      compareceu: v.compareceu,
      convRate: v.leads > 0 ? Math.round((v.agendamentos / v.leads) * 100) : 0,
      showRate: v.agendamentos > 0 ? Math.round((v.compareceu / v.agendamentos) * 100) : 0,
    }))
    .sort((a, b) => b.leads - a.leads);
}

// Calcular tendência (queda/crescimento %) entre 3 meses
function calculateTrend(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const [current, prev] = vals;
  if (prev === 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

export function ComparisonChart({ leads }: ComparisonChartProps) {
  const availableMonths = useMemo(() => getAvailableMonths(12), []);
  const currentMonthStr = availableMonths[0]; // "MM/yyyy" do mês atual
  const today = new Date();
  const todayDay = today.getDate(); // ex: 13

  const [metric, setMetric] = useState<MetricKey>("leads_novos");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([
    availableMonths[0],
    availableMonths[1],
  ]);

  function toggleMonth(month: string) {
    setSelectedMonths((prev) => {
      if (prev.includes(month)) {
        if (prev.length <= 1) return prev;
        return prev.filter((m) => m !== month);
      }
      if (prev.length >= 5) return prev;
      return [...prev, month];
    });
  }

  // Dados do gráfico por dia
  const chartData = useMemo(() => {
    const maxDays = Math.max(...selectedMonths.map((m) => getDaysInMonthStr(m)));
    return Array.from({ length: maxDays }, (_, i) => {
      const day = i + 1;
      const point: Record<string, number | string | null> = { dia: day };
      for (const month of selectedMonths) {
        const [mm, yyyy] = month.split("/");
        const dayStr = `${String(day).padStart(2, "0")}/${mm}/${yyyy}`;
        const daysInMonth = getDaysInMonthStr(month);
        const isCurrentMonth = month === currentMonthStr;
        // não renderiza dias futuros do mês atual
        if (isCurrentMonth && day > todayDay) {
          point[month] = null;
        } else if (day > daysInMonth) {
          point[month] = null;
        } else {
          point[month] = leads.filter((lead) => {
            const dateField = getDateField(lead, metric);
            if (!dateField) return false;
            return dateField.startsWith(dayStr) && matchesMetric(lead, metric);
          }).length;
        }
      }
      return point;
    });
  }, [leads, metric, selectedMonths, currentMonthStr, todayDay]);

  // Analytics completos por mês
  const analytics = useMemo(() => {
    return selectedMonths.map((month) => {
      const isCurrentMonth = month === currentMonthStr;
      const daysInMonth = getDaysInMonthStr(month);
      const effectiveDays = isCurrentMonth ? todayDay : daysInMonth;

      const total = countForMonth(leads, metric, month);
      const totalUpToToday = countForMonth(leads, metric, month, effectiveDays);
      const dailyCounts = dailyCountsForMonth(leads, metric, month);

      // Para comparação justa, contar sempre até o dia 13 (ou dia atual se for mês atual)
      const totalUpToSameDay = countForMonth(leads, metric, month, todayDay);

      // Projeção: só faz sentido para mês atual
      const projection = isCurrentMonth && todayDay > 0
        ? Math.round((totalUpToToday / todayDay) * daysInMonth)
        : null;

      // Melhor e pior dia (apenas dias com dados, dentro dos dias efetivos)
      const daysWithData = dailyCounts
        .slice(0, effectiveDays)
        .map((count, i) => ({ day: i + 1, count }))
        .filter((d) => d.count > 0);

      const bestDay = daysWithData.length > 0
        ? daysWithData.reduce((a, b) => (a.count >= b.count ? a : b))
        : null;
      const worstDay = daysWithData.length > 0
        ? daysWithData.reduce((a, b) => (a.count <= b.count ? a : b))
        : null;

      // Taxa de conversão: apenas para leads_novos
      let conversionRate: number | null = null;
      if (metric === "leads_novos" && total > 0) {
        const agendados = leads.filter((lead) => {
          const dataCriacao = lead.dataCriacao || "";
          const [mm, yyyy] = month.split("/");
          if (!dataCriacao.includes(`/${mm}/${yyyy}`)) return false;
          return !!lead.dataAgendamentoCriado;
        }).length;
        conversionRate = Math.round((agendados / total) * 100);
      }

      return {
        month,
        isCurrentMonth,
        total,
        totalUpToToday,
        totalUpToSameDay,
        projection,
        bestDay,
        worstDay,
        conversionRate,
        daysInMonth,
        effectiveDays,
      };
    });
  }, [leads, metric, selectedMonths, currentMonthStr, todayDay]);

  // Variação vs mês anterior na seleção
  const variations = useMemo(() => {
    return analytics.map((curr, idx) => {
      if (idx === analytics.length - 1) return null; // último não tem anterior
      const prev = analytics[idx + 1];
      // Para comparação justa: mês atual vs "até o mesmo dia" dos outros
      const currVal = curr.isCurrentMonth ? curr.totalUpToToday : curr.total;
      const prevVal = curr.isCurrentMonth ? (prev.totalUpToSameDay ?? prev.total) : prev.total;
      if (prevVal === 0) return null;
      const diff = currVal - prevVal;
      const pct = Math.round((diff / prevVal) * 100);
      return { diff, pct };
    });
  }, [analytics]);

  // Média dos meses selecionados (para 3+) - comparação justa até o mesmo dia
  const avgAcrossMonths = useMemo(() => {
    if (selectedMonths.length < 3) return null;
    // Pega totalUpToSameDay (até dia 13 de cada mês), ou totalUpToToday para o atual
    const vals = analytics.map((a) => a.totalUpToSameDay ?? a.totalUpToToday);
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [analytics]);

  // Mês atual em relação à posição no mês
  const currentMonthAnalytics = analytics.find((a) => a.isCurrentMonth);

  // Funil de conversão por fonte — agrega TODOS os meses selecionados
  const funnelPeriods = useMemo(() =>
    selectedMonths.map((mmYYYY) => ({
      mmYYYY,
      upToDay: mmYYYY === currentMonthStr ? todayDay : undefined,
    })),
  [selectedMonths, currentMonthStr, todayDay]);

  const funnelLabel = useMemo(() => {
    if (selectedMonths.length === 1) {
      return `${getMonthLabel(selectedMonths[0])} · até dia ${todayDay}`;
    }
    const sorted = [...selectedMonths].reverse();
    return `${getMonthLabel(sorted[0])} → ${getMonthLabel(sorted[sorted.length - 1])} · acumulado`;
  }, [selectedMonths, todayDay]);

  const funnelByFonte = useMemo(() => {
    return getConversionFunnelByFonte(leads, funnelPeriods);
  }, [leads, funnelPeriods]);

// Insights automáticos de diagnóstico com ações concretas
    const diagnosticoInsights = useMemo(() => {
      const insights: { type: "good" | "bad" | "tip"; text: string }[] = [];
      const significant = funnelByFonte.filter(f => f.leads >= 2);
      if (significant.length === 0) return insights;

      // Melhor taxa de conversão L→A (melhor canal)
      const bestConv = [...significant].sort((a, b) => b.convRate - a.convRate)[0];
      if (bestConv.convRate >= 70) {
        insights.push({ type: "good", text: `${bestConv.fonte}: ${bestConv.convRate}% conversão — aumentar investimento aqui` });
      }

      // Melhor taxa de comparecimento (qualidade de lead)
      const withAppts = significant.filter(f => f.agendamentos >= 2);
      if (withAppts.length > 0) {
        const bestShow = [...withAppts].sort((a, b) => b.showRate - a.showRate)[0];
        if (bestShow.showRate >= 60) {
          insights.push({ type: "good", text: `${bestShow.fonte}: ${bestShow.showRate}% comparecimento — leads de alta qualidade` });
        }
        const worstShow = [...withAppts].sort((a, b) => a.showRate - b.showRate)[0];
        if (worstShow.showRate < 40) {
          insights.push({ type: "bad", text: `${worstShow.fonte}: ${worstShow.showRate}% comparecimento — reforçar lembretes e confirmação` });
        }
      }

      // Alto volume mas baixa conversão (diagnóstico de funil)
      const highVolLowConv = significant.filter(f => f.leads >= 5 && f.convRate < 40);
      if (highVolLowConv.length > 0) {
        const row = highVolLowConv[0];
        const gap = Math.round((40 - row.convRate) * row.leads / 100);
        insights.push({ type: "tip", text: `${row.fonte}: ${row.leads} leads mas só ${row.convRate}% agendamentos — revisar copy/timing (ganho: ~${gap} agend se 40%)` });
      }

      // Fontes sem agendamento (aviso)
      const noAppts = funnelByFonte.filter(f => f.agendamentos === 0 && f.leads >= 1);
      if (noAppts.length > 0) {
        insights.push({ type: "bad", text: `${noAppts.map(f => f.fonte).join(", ")}: sem agendamentos — revisar redirecionamento ou valor da oferta` });
      }

      // Taxa geral do mês
      const totalLeads = funnelByFonte.reduce((s, f) => s + f.leads, 0);
      const totalAgend = funnelByFonte.reduce((s, f) => s + f.agendamentos, 0);
      const totalComp = funnelByFonte.reduce((s, f) => s + f.compareceu, 0);
      if (totalLeads > 0) {
        const gConv = Math.round((totalAgend / totalLeads) * 100);
        const gShow = totalAgend > 0 ? Math.round((totalComp / totalAgend) * 100) : 0;
        const statusText = gConv >= 40 && gShow >= 50 ? "excelente" : gConv >= 30 && gShow >= 35 ? "dentro do alvo" : "precisa melhorar";
        insights.push({
          type: gConv >= 40 && gShow >= 50 ? "good" : gConv < 25 || gShow < 30 ? "bad" : "tip",
          text: `Funil geral ${statusText}: ${gConv}% leads→agendamento, ${gShow}% agendamento→compareceu`
      });
    }

    return insights;
  }, [funnelByFonte]);

  return (
    <div className="bg-[#1C1C1E] rounded-xl border border-gray-800 p-6 mt-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp className="w-5 h-5 text-indigo-400" />
        <h3 className="text-white font-semibold text-base">Comparação de Períodos</h3>
      </div>

      {/* Controles */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:flex-wrap">
        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Métrica</p>
          <div className="flex gap-2 flex-wrap">
            {METRIC_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMetric(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  metric === opt.key
                    ? "bg-indigo-500 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
            Meses para comparar{" "}
            <span className="normal-case text-gray-600">(máx. 5)</span>
          </p>
          <div className="flex gap-2 flex-wrap">
            {availableMonths.slice(0, 8).map((month) => {
              const selected = selectedMonths.includes(month);
              const colorIdx = selectedMonths.indexOf(month);
              return (
                <button
                  key={month}
                  onClick={() => toggleMonth(month)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    selected
                      ? "text-white border-transparent"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 border-gray-700"
                  }`}
                  style={
                    selected
                      ? {
                          backgroundColor: LINE_COLORS[colorIdx],
                          borderColor: LINE_COLORS[colorIdx],
                        }
                      : {}
                  }
                >
                  {getMonthLabel(month)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d2d30" />
          <XAxis
            dataKey="dia"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            interval={1}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#f9fafb",
              fontSize: "12px",
            }}
            labelFormatter={(val) => `Dia ${val}`}
            formatter={(value, name) => [value, getMonthLabel(name as string)]}
          />
          <Legend
            formatter={(value) => getMonthLabel(value as string)}
            wrapperStyle={{ color: "#9ca3af", fontSize: "12px" }}
          />
          {/* Linha vertical no dia atual */}
          <ReferenceLine
            x={todayDay}
            stroke="#4b5563"
            strokeDasharray="4 4"
            label={{ value: "Hoje", fill: "#6b7280", fontSize: 10, position: "top" }}
          />
          {selectedMonths.map((month, idx) => (
            <Line
              key={month}
              type="monotone"
              dataKey={month}
              stroke={LINE_COLORS[idx % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Cards de análise por mês */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
        {analytics.map((a, idx) => {
          const variation = variations[idx];
          const color = LINE_COLORS[idx % LINE_COLORS.length];
          // Comparação justa: até mesmo dia (dia 13 do mês atual ou do outro mês)
          const displayVal = a.totalUpToSameDay ?? a.totalUpToToday;

          return (
            <div
              key={a.month}
              className="bg-gray-900 rounded-lg p-3 border border-gray-800"
              style={{ borderLeftColor: color, borderLeftWidth: 3 }}
            >
              {/* Cabeçalho: Mês + Realizado */}
              <div className="mb-2">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-semibold text-white uppercase tracking-wide">
                    {getMonthLabel(a.month)} <span className="text-[10px] text-indigo-400 normal-case">(até dia {todayDay})</span>
                  </span>
                  <span className="text-2xl font-bold text-white">{displayVal}</span>
                </div>
              </div>

              {/* Seção: Realizado / Meta período + Barra */}
              {metric === "leads_novos" || metric === "agendamentos" || metric === "compareceu" ? (
                <div className="mb-3 pb-3 border-b border-gray-700">
                  {(() => {
                    const goal = MONTHLY_GOALS[metric];
                    const daysInMonth = a.daysInMonth;
                    const projectedGoal = Math.round((goal / daysInMonth) * todayDay);
                    const progress = Math.min((displayVal / projectedGoal) * 100, 100);
                    const isBelow = displayVal < projectedGoal * 0.9;

                    return (
                      <div>
                        {/* Linha: Realizado / Meta + Progresso % */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400">
                            Realizado: <strong className="text-white">{displayVal}</strong> / <strong>{projectedGoal}</strong> <span className="text-indigo-400">(até dia {todayDay})</span>
                          </span>
                          <span className={`text-sm font-bold ${progress >= 100 ? "text-emerald-400" : isBelow ? "text-red-400" : "text-amber-400"}`}>
                            {Math.round(progress)}%
                          </span>
                        </div>
                        {/* Barra de progresso */}
                        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-2.5">
                          <div
                            className={`h-full transition-all ${progress >= 100 ? "bg-emerald-500" : isBelow ? "bg-red-500" : "bg-amber-500"}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        {/* Divisor visual */}
                        <div className="h-px bg-gray-800 mb-2"></div>
                        {/* Linha: Meta mês + Projeção */}
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Meta mês: <strong className="text-gray-300">{goal}</strong></span>
                          <span>Projeção: <strong className="text-gray-300">~{a.projection ?? Math.round((displayVal / todayDay) * daysInMonth)}</strong></span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {/* Breakdown por fonte - para todas as métricas exceto nao_compareceu */}
              {metric !== "nao_compareceu" && (
                <div className="mt-3 pt-2.5 pb-2.5">
                  <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-widest opacity-75">📊 Fonte:</p>
                  {(() => {
                    const breakdown = getSourceBreakdownForMetric(leads, metric, a.month, todayDay);
                    const sorted = Object.entries(breakdown)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4);
                    if (sorted.length === 0) return <p className="text-xs text-gray-600 px-1">Sem dados</p>;
                    return (
                      <div className="space-y-1.5">
                        {sorted.map(([fonte, count]) => (
                          <div key={fonte} className="flex justify-between items-center px-1">
                            <span className="text-xs text-gray-400">{fonte}</span>
                            <span className="text-base font-bold text-teal-400">{count}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Status dos agendados (apenas métrica agendamentos) */}
              {metric === "agendamentos" && (
                <div className="mt-2 pt-2.5 border-t border-gray-800">
                  {(() => {
                    const st = getAgendamentoStatusBreakdown(leads, a.month, todayDay);
                    if (st.total === 0) return null;
                    const compPct = Math.round((st.compareceu / st.total) * 100);
                    const naoPct = Math.round((st.nao_compareceu / st.total) * 100);
                    const agPct = 100 - compPct - naoPct;
                    return (
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Status dos agendados:</p>
                        <div className="flex h-2 rounded-full overflow-hidden mb-2 gap-px bg-gray-800">
                          {st.compareceu > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${compPct}%` }} title={`Compareceu: ${st.compareceu}`} />}
                          {st.aguardando > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${agPct}%` }} title={`Aguardando: ${st.aguardando}`} />}
                          {st.nao_compareceu > 0 && <div className="bg-red-500 transition-all" style={{ width: `${naoPct}%` }} title={`Não veio: ${st.nao_compareceu}`} />}
                        </div>
                        <div className="flex gap-3 text-xs flex-wrap">
                          <span className="text-emerald-400">✔ <strong>{st.compareceu}</strong> compareceu</span>
                          <span className="text-amber-400">⏳ <strong>{st.aguardando}</strong> aguardando</span>
                          <span className="text-red-400">✘ <strong>{st.nao_compareceu}</strong> não veio</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Variação vs mês anterior na lista */}
              {variation && (
                <div className="flex items-center gap-1 mb-1.5">
                  {/* Lógica invertida para "Não Compareceu": mais = ruim (vermelho) */}
                  {metric === "nao_compareceu"
                    ? variation.diff > 0
                      ? <TrendingUp className="w-3 h-3 text-red-400" />
                      : variation.diff < 0
                      ? <TrendingDown className="w-3 h-3 text-emerald-400" />
                      : <Minus className="w-3 h-3 text-gray-500" />
                    : variation.diff > 0
                    ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                    : variation.diff < 0
                    ? <TrendingDown className="w-3 h-3 text-red-400" />
                    : <Minus className="w-3 h-3 text-gray-500" />
                  }
                  <span
                    className={`text-xs font-medium ${
                      metric === "nao_compareceu"
                        ? variation.diff > 0
                          ? "text-red-400"
                          : variation.diff < 0
                          ? "text-emerald-400"
                          : "text-gray-500"
                        : variation.diff > 0
                        ? "text-emerald-400"
                        : variation.diff < 0
                        ? "text-red-400"
                        : "text-gray-500"
                    }`}
                  >
                    {variation.diff > 0 ? "+" : ""}
                    {variation.diff} ({variation.pct > 0 ? "+" : ""}
                    {variation.pct}%) vs {getMonthLabel(analytics[idx + 1]?.month ?? "")}
                  </span>
                </div>
              )}

              {/* Projeção para fim do mês (só mês atual) */}
              {a.projection !== null && (
                <div className="flex items-center gap-1 mb-1.5">
                  <Target className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-amber-400">
                    Projeção fim do mês: ~<strong>{a.projection}</strong>
                  </span>
                </div>
              )}

              {/* Ritmo no dia atual comparado com os outros meses */}
              {a.totalUpToSameDay !== null && (
                <div className="flex items-center gap-1 mb-1.5">
                  <Zap className="w-3 h-3 text-sky-400" />
                  <span className="text-xs text-sky-400">
                    Até dia {todayDay}: <strong>{a.totalUpToSameDay}</strong>
                    {currentMonthAnalytics && (
                      <>
                        {" "}
                        {metric === "nao_compareceu"
                          ? currentMonthAnalytics.totalUpToToday < a.totalUpToSameDay
                            ? <span className="text-emerald-400">
                                ({currentMonthAnalytics.totalUpToToday - a.totalUpToSameDay} melhor)
                              </span>
                            : currentMonthAnalytics.totalUpToToday > a.totalUpToSameDay
                            ? <span className="text-red-400">
                                (+{currentMonthAnalytics.totalUpToToday - a.totalUpToSameDay} pior)
                              </span>
                            : <span className="text-gray-500">(igual)</span>
                          : currentMonthAnalytics.totalUpToToday > a.totalUpToSameDay
                          ? <span className="text-emerald-400">
                              (+{currentMonthAnalytics.totalUpToToday - a.totalUpToSameDay} acima)
                            </span>
                          : currentMonthAnalytics.totalUpToToday < a.totalUpToSameDay
                          ? <span className="text-red-400">
                              ({currentMonthAnalytics.totalUpToToday - a.totalUpToSameDay} abaixo)
                            </span>
                          : <span className="text-gray-500">(igual)</span>
                        }
                      </>
                    )}
                  </span>
                </div>
              )}

              {/* Melhor e pior dia */}
              {a.bestDay && (
                <div className="flex items-center gap-2 mb-1">
                  <BarChart2 className="w-3 h-3 text-gray-500" />
                  <span className="text-xs text-gray-500">
                    Pico: dia {a.bestDay.day} ({a.bestDay.count})
                    {a.worstDay && a.worstDay.day !== a.bestDay.day && (
                      <> · Mín: dia {a.worstDay.day} ({a.worstDay.count})</>
                    )}
                  </span>
                </div>
              )}

              {/* Taxa de conversão (leads_novos) */}
              {a.conversionRate !== null && (
                <div className="mt-1 mb-1.5">
                  <span className="text-xs text-purple-400">
                    Conversão para agendamento:{" "}
                    <strong>{a.conversionRate}%</strong>
                  </span>
                </div>
              )}

              {/* Alerta de tendência (queda > 10%) */}
              {a.isCurrentMonth && (
                (() => {
                  const trend = calculateTrend([displayVal, variations[0]?.diff ? displayVal + variations[0].diff : null].filter(Boolean) as number[]);
                  const comparingWithPrev = variations[0];
                  if (comparingWithPrev && metric !== "nao_compareceu" && comparingWithPrev.pct < -10) {
                    return (
                      <div className="mt-1.5 p-2 bg-red-950 rounded border border-red-800">
                        <div className="flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                          <span className="text-xs text-red-300">
                            <strong>⚠️ Queda de {Math.abs(comparingWithPrev.pct)}%</strong> vs mês anterior
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()
              )}

              {/* Recomendação de ação (para mês atual apenas) */}
              {a.isCurrentMonth && metric === "leads_novos" && (
                (() => {
                  const goal = MONTHLY_GOALS.leads_novos;
                  const projectedGoal = Math.round((goal / a.daysInMonth) * todayDay);
                  const gap = projectedGoal - displayVal;

                  if (gap > 0 && gap <= projectedGoal * 0.3) {
                    const breakdown = getSourceBreakdown(leads, a.month, todayDay);
                    const topSource = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[1]?.[0];

                    return (
                      <div className="mt-1.5 p-2 bg-amber-950 rounded border border-amber-800">
                        <div className="flex items-center gap-1">
                          <Lightbulb className="w-3 h-3 text-amber-400 shrink-0" />
                          <span className="text-xs text-amber-300">
                            <strong>+{gap} leads faltam</strong>. Reforce{" "}
                            {topSource ? topSource : "outras fontes"}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()
              )}
            </div>
          );
        })}
      </div>

      {/* Linha de insights globais (3+ meses) */}
      {avgAcrossMonths !== null && currentMonthAnalytics && (
        <div className="mt-4 flex items-center gap-2 bg-gray-900 rounded-lg px-4 py-2.5 border border-gray-800 flex-wrap">
          <BarChart2 className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-xs text-gray-400">
            Média dos {selectedMonths.length} meses selecionados:{" "}
            <strong className="text-white">{avgAcrossMonths}</strong>
          </span>
          <span className="mx-1 text-gray-700">·</span>
          <span className="text-xs">
            {metric === "nao_compareceu"
              ? currentMonthAnalytics.totalUpToToday <= avgAcrossMonths
                ? <span className="text-emerald-400 font-medium">↓ Mês atual abaixo da média (melhor) ({currentMonthAnalytics.totalUpToToday - avgAcrossMonths})</span>
                : <span className="text-red-400 font-medium">↑ Mês atual acima da média (pior) (+{currentMonthAnalytics.totalUpToToday - avgAcrossMonths})</span>
              : currentMonthAnalytics.totalUpToToday >= avgAcrossMonths
              ? <span className="text-emerald-400 font-medium">↑ Mês atual acima da média (+{currentMonthAnalytics.totalUpToToday - avgAcrossMonths})</span>
              : <span className="text-red-400 font-medium">↓ Mês atual abaixo da média ({currentMonthAnalytics.totalUpToToday - avgAcrossMonths})</span>
            }
          </span>
          {currentMonthAnalytics.projection !== null && (
            <>
              <span className="mx-1 text-gray-700">·</span>
              <span className="text-xs text-amber-400">
                Projeção de fechamento: <strong>~{currentMonthAnalytics.projection}</strong>
                {metric === "nao_compareceu"
                  ? currentMonthAnalytics.projection <= avgAcrossMonths
                    ? <span className="text-emerald-400 ml-1">(abaixo da média - melhor)</span>
                    : <span className="text-red-400 ml-1">(acima da média - pior)</span>
                  : currentMonthAnalytics.projection >= avgAcrossMonths
                  ? <span className="text-emerald-400 ml-1">(acima da média)</span>
                  : <span className="text-red-400 ml-1">(abaixo da média)</span>
                }
              </span>
            </>
          )}
        </div>
      )}

      {/* ═══ Diagnóstico: Funil de Conversão por Fonte ═══ */}
      {funnelByFonte.length > 0 && (
        <div className="mt-5 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 flex-wrap">
            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
            <h4 className="text-sm font-semibold text-white">Diagnóstico — Funil por Fonte</h4>
            <span className="text-xs text-gray-500">
              {funnelLabel}
            </span>
          </div>

          {/* Tabela do funil */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800 bg-gray-950/50">
                  <th className="text-left px-4 py-2.5 font-medium">Fonte</th>
                  <th className="text-center px-3 py-2.5 font-medium">
                    ✨ Leads
                    <span className="block text-[9px] font-normal text-gray-600">novos</span>
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium">
                    📞 Agend.
                    <span className="block text-[9px] font-normal text-gray-600">marcados</span>
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium">
                    ✔ Comp.
                    <span className="block text-[9px] font-normal text-gray-600">vieram</span>
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium">
                    Conversão
                    <span className="block text-[9px] font-normal text-gray-600">leads→agend</span>
                  </th>
                  <th className="text-center px-3 py-2.5 font-medium">
                    Compareceu
                    <span className="block text-[9px] font-normal text-gray-600">agend→virou</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnelByFonte.map((row) => (
                  <tr key={row.fonte} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-300 font-medium">{row.fonte}</td>
                    <td className="text-center px-3 py-2.5 text-white font-bold">{row.leads}</td>
                    <td className="text-center px-3 py-2.5 text-blue-400 font-bold">{row.agendamentos}</td>
                    <td className="text-center px-3 py-2.5 text-emerald-400 font-bold">{row.compareceu}</td>
                    <td className="text-center px-3 py-2.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${row.convRate >= 60 ? "bg-emerald-900 text-emerald-300" : row.convRate >= 35 ? "bg-amber-900 text-amber-300" : "bg-red-900 text-red-300"}`}>
                        {row.convRate}%
                      </span>
                    </td>
                    <td className="text-center px-3 py-2.5">
                      {row.agendamentos === 0 ? (
                        <span className="text-gray-600 text-[10px] font-bold">—</span>
                      ) : (
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${row.showRate >= 60 ? "bg-emerald-900 text-emerald-300" : row.showRate >= 40 ? "bg-amber-900 text-amber-300" : "bg-red-900 text-red-300"}`}>
                          {row.showRate}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totais */}
              {funnelByFonte.length > 1 && (() => {
                const tL = funnelByFonte.reduce((s, f) => s + f.leads, 0);
                const tA = funnelByFonte.reduce((s, f) => s + f.agendamentos, 0);
                const tC = funnelByFonte.reduce((s, f) => s + f.compareceu, 0);
                const tConv = tL > 0 ? Math.round((tA / tL) * 100) : 0;
                const tShow = tA > 0 ? Math.round((tC / tA) * 100) : 0;
                return (
                  <tfoot>
                    <tr className="bg-gray-800/50 text-gray-300 font-semibold">
                      <td className="px-4 py-2 text-gray-400 text-xs uppercase">Total</td>
                      <td className="text-center px-3 py-2 text-white">{tL}</td>
                      <td className="text-center px-3 py-2 text-blue-400">{tA}</td>
                      <td className="text-center px-3 py-2 text-emerald-400">{tC}</td>
                      <td className="text-center px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${tConv >= 60 ? "bg-emerald-900 text-emerald-300" : tConv >= 35 ? "bg-amber-900 text-amber-300" : "bg-red-900 text-red-300"}`}>
                          {tConv}%
                        </span>
                      </td>
                      <td className="text-center px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${tShow >= 50 ? "bg-emerald-900 text-emerald-300" : tShow >= 30 ? "bg-amber-900 text-amber-300" : "bg-red-900 text-red-300"}`}>
                          {tShow}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>

          {/* Ranking de ROI */}
          {funnelByFonte.length > 1 && (() => {
            const ranked = [...funnelByFonte].sort((a, b) => {
              const roiA = a.convRate >= 60 && a.showRate >= 60 ? 3 : a.convRate >= 40 && a.showRate >= 40 ? 2 : 1;
              const roiB = b.convRate >= 60 && b.showRate >= 60 ? 3 : b.convRate >= 40 && b.showRate >= 40 ? 2 : 1;
              return roiB - roiA || b.leads - a.leads;
            }).slice(0, 3);
            return (
              <div className="px-4 py-3 border-t border-gray-800 bg-gradient-to-r from-emerald-950/30 to-amber-950/30">
                <p className="text-xs font-bold text-gray-400 uppercase mb-2.5">🎯 Ranking de eficiência (ROI)</p>
                <div className="space-y-2">
                  {ranked.map((row, idx) => (
                    <div key={row.fonte} className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-amber-400 w-4">{idx + 1}️⃣</span>
                      <span className="text-gray-300 flex-1">
                        <strong>{row.fonte}</strong> — {row.leads} leads
                      </span>
                      <span className="text-emerald-400 font-bold">
                        {row.convRate}% conv
                      </span>
                      <span className="text-blue-400 font-bold">
                        {row.agendamentos > 0 ? `${row.showRate}% comp` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Insights automáticos com ações */}
          {diagnosticoInsights.length > 0 && (
            <div className="px-4 py-3 space-y-2.5 border-t border-gray-800 bg-gray-950/30">
              <p className="text-xs font-bold text-gray-400 uppercase">💡 Recomendações</p>
              {diagnosticoInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 shrink-0 text-sm leading-none">
                    {insight.type === "good" ? "✅" : insight.type === "bad" ? "⚠️" : "💡"}
                  </span>
                  <span className={`leading-relaxed flex-1 ${insight.type === "good" ? "text-emerald-400" : insight.type === "bad" ? "text-red-400" : "text-amber-400"}`}>
                    {insight.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
