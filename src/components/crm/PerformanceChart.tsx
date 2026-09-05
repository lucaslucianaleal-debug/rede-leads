import { ptBR } from "date-fns/locale";
import { eachDayOfInterval, format, subDays } from "date-fns";
import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { Lead } from "@/types/crm";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PerformanceChartProps {
  leads: Lead[];
  followUpGoal?: number;
  compact?: boolean;
}

type PeriodKey = "today" | "7d" | "15d" | "30d";
type MetricFormat = "number" | "percent";
type MetricTone = "green" | "amber" | "blue" | "orange" | "primary";

const META_ATENDIMENTOS = 40;
const META_AGENDAMENTOS = 10;
const META_REAGENDAMENTOS = 5;
const META_CONVERSAO = (META_AGENDAMENTOS / META_ATENDIMENTOS) * 100;

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string; days: number }> = [
  { key: "today", label: "Hoje", days: 1 },
  { key: "7d", label: "7 dias", days: 7 },
  { key: "15d", label: "15 dias", days: 15 },
  { key: "30d", label: "30 dias", days: 30 },
];

const TONE_STYLES: Record<MetricTone, { value: string; bar: string; shell: string }> = {
  green: {
    value: "text-green-600",
    bar: "bg-green-500",
    shell: "bg-gradient-to-br from-green-50 to-green-50/50 border-green-200/50",
  },
  amber: {
    value: "text-amber-700",
    bar: "bg-amber-500",
    shell: "bg-gradient-to-br from-amber-50 to-amber-50/50 border-amber-200/50",
  },
  blue: {
    value: "text-blue-600",
    bar: "bg-blue-500",
    shell: "bg-gradient-to-br from-blue-50 to-blue-50/50 border-blue-200/50",
  },
  orange: {
    value: "text-orange-600",
    bar: "bg-orange-500",
    shell: "bg-gradient-to-br from-orange-50 to-orange-50/50 border-orange-200/50",
  },
  primary: {
    value: "text-primary",
    bar: "bg-primary",
    shell: "bg-gradient-to-br from-primary/5 to-background border-primary/20",
  },
};

function isBusinessDay(day: Date) {
  const weekDay = day.getDay();
  return weekDay !== 0 && weekDay !== 6;
}

function formatMetric(value: number, formatType: MetricFormat) {
  if (formatType === "percent") {
    return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }
  return Math.round(value).toLocaleString("pt-BR");
}

function formatGap(value: number, formatType: MetricFormat) {
  const absolute = Math.abs(value);
  if (formatType === "percent") {
    return `${absolute.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
  }
  return Math.round(absolute).toLocaleString("pt-BR");
}

function metricStatus(current: number, goal: number) {
  if (goal <= 0) {
    return {
      progress: 0,
      percent: 0,
      label: "Sem meta",
      pillClass: "border-border bg-muted text-muted-foreground",
      deltaClass: "text-muted-foreground",
    };
  }

  const ratio = current / goal;
  const percent = Math.round(ratio * 100);

  if (ratio >= 1) {
    return {
      progress: 100,
      percent,
      label: "Na meta",
      pillClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      deltaClass: "text-emerald-700",
    };
  }

  if (ratio >= 0.85) {
    return {
      progress: Math.max(0, Math.min(ratio * 100, 100)),
      percent,
      label: "Atenção",
      pillClass: "border-amber-200 bg-amber-50 text-amber-700",
      deltaClass: "text-amber-700",
    };
  }

  return {
    progress: Math.max(0, Math.min(ratio * 100, 100)),
    percent,
    label: "Abaixo",
    pillClass: "border-red-200 bg-red-50 text-red-700",
    deltaClass: "text-red-700",
  };
}

interface PerformanceMetricCardProps {
  label: string;
  current: number;
  goal: number;
  tone: MetricTone;
  formatType?: MetricFormat;
  compact?: boolean;
}

function PerformanceMetricCard({
  label,
  current,
  goal,
  tone,
  formatType = "number",
  compact = false,
}: PerformanceMetricCardProps) {
  const styles = TONE_STYLES[tone];
  const status = metricStatus(current, goal);
  const gap = current - goal;
  const gapText = goal <= 0
    ? "Sem meta para o período"
    : gap >= 0
      ? `${formatGap(gap, formatType)} acima do ritmo`
      : `${formatGap(gap, formatType)} abaixo do ritmo`;

  return (
    <div
      className={`min-w-0 rounded-lg border ${
        compact ? "bg-background/70 p-3" : `${styles.shell} p-4`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${status.pillClass}`}>
          {status.label}
        </span>
      </div>

      <p className={`${compact ? "mt-1 text-xl" : "mt-2 text-2xl"} font-bold tabular-nums ${styles.value}`}>
        {formatMetric(current, formatType)}
      </p>

      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>Esperado: {formatMetric(goal, formatType)}</span>
        {goal > 0 && <span className="font-semibold">{status.percent}%</span>}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${styles.bar}`}
          style={{ width: `${status.progress}%` }}
        />
      </div>

      <p className={`mt-1.5 truncate text-[10px] font-semibold ${status.deltaClass}`}>
        {gapText}
      </p>
    </div>
  );
}

export function PerformanceChart({ leads, followUpGoal = 20, compact = false }: PerformanceChartProps) {
  const [period, setPeriod] = useState<PeriodKey>("today");
  const selectedPeriod = PERIOD_OPTIONS.find((item) => item.key === period) || PERIOD_OPTIONS[0];
  const days = selectedPeriod.days;

  const activeLeads = useMemo(() => leads.filter((lead) => !lead._deleted), [leads]);

  const {
    chartData,
    totalAtendimentos,
    totalAgendamentos,
    totalReagendamentos,
    totalFollowUps,
    businessDays,
  } = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const start = subDays(today, days - 1);
    start.setHours(0, 0, 0, 0);

    const interval = eachDayOfInterval({ start, end: today });
    const usefulDays = interval.filter(isBusinessDay).length;

    const data = interval.map((day) => {
      const dayStr = format(day, "dd/MM/yyyy");

      const newLeads = activeLeads.filter((lead) => (lead.dataContato || "").startsWith(dayStr));
      const followUpsDone = activeLeads.filter((lead) => (lead.lastFollowUpDone || "").startsWith(dayStr));
      const appointmentsMade = activeLeads.filter((lead) => (lead.dataAgendamentoCriado || "").startsWith(dayStr));
      const reschedulesMade = activeLeads.filter((lead) => (lead.dataAgendamentoAlterado || "").startsWith(dayStr));

      const seen = new Set<string>();
      const allDetails: Lead[] = [];
      for (const lead of [...appointmentsMade, ...reschedulesMade, ...followUpsDone, ...newLeads]) {
        if (!seen.has(lead.id)) {
          seen.add(lead.id);
          allDetails.push(lead);
        }
      }

      return {
        dia: format(
          day,
          days === 1 ? "'Hoje'" : days === 7 ? "EEE dd/MM" : "dd/MM",
          { locale: ptBR },
        ),
        Atendimentos: allDetails.length,
        FollowUps: followUpsDone.length,
        Agendamentos: appointmentsMade.length,
        Reagendamentos: reschedulesMade.length,
      };
    });

    return {
      chartData: data,
      totalAtendimentos: data.reduce((acc, item) => acc + item.Atendimentos, 0),
      totalFollowUps: data.reduce((acc, item) => acc + item.FollowUps, 0),
      totalAgendamentos: data.reduce((acc, item) => acc + item.Agendamentos, 0),
      totalReagendamentos: data.reduce((acc, item) => acc + item.Reagendamentos, 0),
      businessDays: usefulDays,
    };
  }, [activeLeads, days]);

  const taxaConversao = totalAtendimentos > 0
    ? (totalAgendamentos / totalAtendimentos) * 100
    : 0;

  const metaAtendimentosPeriodo = META_ATENDIMENTOS * businessDays;
  const metaFollowUpsPeriodo = followUpGoal * businessDays;
  const metaAgendamentosPeriodo = META_AGENDAMENTOS * businessDays;
  const metaReagendamentosPeriodo = META_REAGENDAMENTOS * businessDays;

  const metrics: Array<PerformanceMetricCardProps> = [
    {
      label: "Atendimentos",
      current: totalAtendimentos,
      goal: metaAtendimentosPeriodo,
      tone: "green",
    },
    {
      label: "Follow-ups",
      current: totalFollowUps,
      goal: metaFollowUpsPeriodo,
      tone: "amber",
    },
    {
      label: "Agendamentos",
      current: totalAgendamentos,
      goal: metaAgendamentosPeriodo,
      tone: "blue",
    },
    {
      label: "Reagendamentos",
      current: totalReagendamentos,
      goal: metaReagendamentosPeriodo,
      tone: "orange",
    },
    {
      label: "Conversão",
      current: taxaConversao,
      goal: META_CONVERSAO,
      tone: "primary",
      formatType: "percent",
    },
  ];

  return (
    <div className={`glass-card rounded-xl ${compact ? "p-4" : "p-5"}`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className={`flex items-center gap-2 font-heading font-semibold ${compact ? "text-base" : "text-lg"}`}>
            <Activity className="h-5 w-5 text-primary" />
            Performance
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Meta do período calculada por {businessDays} {businessDays === 1 ? "dia útil" : "dias úteis"} • segunda a sexta
          </p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {PERIOD_OPTIONS.map((item) => (
            <button
              key={item.key}
              onClick={() => setPeriod(item.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                period === item.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`mb-5 grid grid-cols-2 gap-3 ${compact ? "sm:grid-cols-5" : "lg:grid-cols-5"}`}>
        {metrics.map((metric) => (
          <PerformanceMetricCard key={metric.label} {...metric} compact={compact} />
        ))}
      </div>

      {period !== "today" && (
        <>
          <ResponsiveContainer width="100%" height={compact ? 210 : 220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="dia"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />

              <ReferenceLine
                y={META_ATENDIMENTOS}
                stroke="hsl(var(--primary))"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{
                  value: `Meta ${META_ATENDIMENTOS}`,
                  fontSize: 9,
                  fill: "hsl(var(--primary))",
                  position: "insideTopRight",
                }}
              />
              <ReferenceLine
                y={META_AGENDAMENTOS}
                stroke="#2563eb"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{
                  value: `Meta ${META_AGENDAMENTOS}`,
                  fontSize: 9,
                  fill: "#2563eb",
                  position: "insideTopRight",
                }}
              />

              <Line
                type="monotone"
                dataKey="Atendimentos"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="FollowUps"
                stroke="hsl(var(--warning))"
                strokeWidth={2.2}
                dot={{ r: 3, fill: "hsl(var(--warning))" }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Agendamentos"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#2563eb" }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Reagendamentos"
                stroke="hsl(var(--warning))"
                strokeWidth={2.5}
                strokeDasharray="5 4"
                dot={{ r: 3, fill: "hsl(var(--warning))" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>

          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Atendimentos = contatos únicos trabalhados no dia &nbsp;|&nbsp; Follow-ups = ações concluídas &nbsp;|&nbsp; Agendamentos = consultas criadas
          </p>
        </>
      )}

      {period === "today" && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          Progresso em tempo real das metas do dia
        </p>
      )}
    </div>
  );
}
