import { useMemo, useState } from "react";
import { Lead } from "@/types/crm";
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
import { format, subDays, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, CalendarCheck, TrendingUp } from "lucide-react";

interface PerformanceChartProps {
  leads: Lead[];
}

type PeriodKey = "7d" | "30d";

const META_ATENDIMENTOS = 40;
const META_AGENDAMENTOS = 15;

export function PerformanceChart({ leads }: PerformanceChartProps) {
  const [period, setPeriod] = useState<PeriodKey>("7d");

  const days = period === "7d" ? 7 : 30;

  // Gera os dados por dia para o período selecionado
  const { chartData, totalAtendimentos, totalAgendamentos } = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const start = subDays(today, days - 1);
    start.setHours(0, 0, 0, 0);

    const interval = eachDayOfInterval({ start, end: today });

    const data = interval.map((day) => {
      const dayStr = format(day, "dd/MM/yyyy");

      // Atendimentos: leads criados nesse dia + follow-ups feitos nesse dia
      const leadsNovos = leads.filter((l) => l.dataCriacao === dayStr).length;
      const followUpsDone = leads.filter(
        (l) => l.dataFollowUp === dayStr && l.etapaLead.startsWith("Follow-Up")
      ).length;
      const atendimentos = leadsNovos + followUpsDone;

      // Agendamentos: leads criados OU follow-ups feitos nesse dia QUE têm agendamento futuro marcado
      const agendamentos = leads.filter((l) => {
        const criadoHoje = l.dataCriacao === dayStr;
        const followupHoje = l.dataFollowUp === dayStr;
        const temAgendamento = !!l.dataAgendamento && l.dataAgendamento.trim() !== "";
        return (criadoHoje || followupHoje) && temAgendamento;
      }).length;

      return {
        dia: format(day, days === 7 ? "EEE dd/MM" : "dd/MM", { locale: ptBR }),
        Atendimentos: atendimentos,
        Agendamentos: agendamentos,
      };
    });

    const totalAt = data.reduce((acc, d) => acc + d.Atendimentos, 0);
    const totalAg = data.reduce((acc, d) => acc + d.Agendamentos, 0);

    return { chartData: data, totalAtendimentos: totalAt, totalAgendamentos: totalAg };
  }, [leads, days]);

  // Taxa de conversão do período
  const taxaConversao =
    totalAtendimentos > 0
      ? ((totalAgendamentos / totalAtendimentos) * 100).toFixed(1)
      : "0.0";

  // Taxa de conversão apenas do dia de hoje
  const todayStr = format(new Date(), "dd/MM/yyyy");
  const atendimentosHoje = leads.filter(
    (l) => l.dataCriacao === todayStr
  ).length + leads.filter(
    (l) => l.dataFollowUp === todayStr && l.etapaLead.startsWith("Follow-Up")
  ).length;
  const agendamentosHoje = leads.filter((l) => {
    const criadoHoje = l.dataCriacao === todayStr;
    const followupHoje = l.dataFollowUp === todayStr;
    const temAg = !!l.dataAgendamento && l.dataAgendamento.trim() !== "";
    return (criadoHoje || followupHoje) && temAg;
  }).length;
  const taxaHoje =
    atendimentosHoje > 0
      ? ((agendamentosHoje / atendimentosHoje) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="glass-card rounded-xl p-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-semibold text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Performance
        </h3>
        {/* Seletor de período */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["7d", "30d"] as PeriodKey[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "7d" ? "7 dias" : "30 dias"}
            </button>
          ))}
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {/* Atendimentos do período */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1">
            Atendimentos
          </p>
          <p className="text-2xl font-bold text-primary">{totalAtendimentos}</p>
          <p className="text-[10px] text-muted-foreground">Meta: {META_ATENDIMENTOS}/dia</p>
        </div>

        {/* Agendamentos do período */}
        <div className="p-3 rounded-lg bg-success/5 border border-success/20">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1">
            Agendamentos
          </p>
          <p className="text-2xl font-bold text-success">{totalAgendamentos}</p>
          <p className="text-[10px] text-muted-foreground">Meta: {META_AGENDAMENTOS}/dia</p>
        </div>

        {/* Taxa de conversão do dia */}
        <div className="p-3 rounded-lg bg-warning/5 border border-warning/20">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Conversão Hoje
          </p>
          <p className="text-2xl font-bold text-warning">{taxaHoje}%</p>
          <p className="text-[10px] text-muted-foreground">
            {agendamentosHoje}/{atendimentosHoje} hoje
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={220}>
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
          <Legend
            wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
          />

          {/* Linhas de referência (metas diárias) */}
          <ReferenceLine
            y={META_ATENDIMENTOS}
            stroke="hsl(var(--primary))"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{ value: `Meta ${META_ATENDIMENTOS}`, fontSize: 9, fill: "hsl(var(--primary))", position: "insideTopRight" }}
          />
          <ReferenceLine
            y={META_AGENDAMENTOS}
            stroke="hsl(var(--success))"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{ value: `Meta ${META_AGENDAMENTOS}`, fontSize: 9, fill: "hsl(var(--success))", position: "insideTopRight" }}
          />

          {/* Linha 1: Atendimentos */}
          <Line
            type="monotone"
            dataKey="Atendimentos"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "hsl(var(--primary))" }}
            activeDot={{ r: 5 }}
          />

          {/* Linha 2: Agendamentos */}
          <Line
            type="monotone"
            dataKey="Agendamentos"
            stroke="hsl(var(--success))"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "hsl(var(--success))" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legenda de métricas */}
      <p className="text-[10px] text-muted-foreground mt-2 text-center">
        Atendimentos = Novos leads + Follow-ups do dia &nbsp;|&nbsp; Agendamentos = Leads com consulta agendada
      </p>
    </div>
  );
}
