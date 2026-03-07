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
import { ProgressWithLabel } from "@/components/ui/progress-with-label";

interface PerformanceChartProps {
  leads: Lead[];
}

type PeriodKey = "today" | "7d" | "30d";

const META_ATENDIMENTOS = 40;
const META_AGENDAMENTOS = 15;

export function PerformanceChart({ leads }: PerformanceChartProps) {
  const [period, setPeriod] = useState<PeriodKey>("today");

  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;

  // Gera os dados por dia para o período selecionado
  // Se for "hoje", mostra apenas barras de progresso; se for período, mostra gráfico
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

      // Agendamentos: leads com dataAgendamento === EXATAMENTE nesse dia
      // (contabilizar apenas criados/atualizados nesse dia)
      const agendamentos = leads.filter((l) => {
        const da = l.dataAgendamento || "";
        return da.startsWith(dayStr);
      }).length;

      return {
        dia: format(day, days === 1 ? "'Hoje'" : days === 7 ? "EEE dd/MM" : "dd/MM", { locale: ptBR }),
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

  // Métricas do dia de hoje para as barras de progresso
  const todayStr = format(new Date(), "dd/MM/yyyy");
  const atendimentosHoje = leads.filter(
    (l) => l.dataCriacao === todayStr
  ).length + leads.filter(
    (l) => l.dataFollowUp === todayStr && l.etapaLead.startsWith("Follow-Up")
  ).length;
  // Agendamentos criados/atualizados HOJE (contabilizar vitórias do dia mesmo que comparecido)
  const agendamentosHoje = leads.filter((l) => {
    const da = l.dataAgendamento || "";
    return da.startsWith(todayStr);
  }).length;
  const taxaHoje =
    atendimentosHoje > 0
      ? ((agendamentosHoje / atendimentosHoje) * 100).toFixed(1)
      : "0.0";

  // Contagem de follow-ups concluídos hoje (para sincronizar com FollowUpQueue)
  const checksDoneToday = leads.filter(
    (l) => l.dataFollowUp === todayStr && l.etapaLead.startsWith("Follow-Up")
  ).length;

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
          {(["today", "7d", "30d"] as PeriodKey[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "today" ? "Hoje" : p === "7d" ? "7 dias" : "30 dias"}
            </button>
          ))}
        </div>
      </div>

      {/* Cards de resumo com barras de progresso */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {/* Atendimentos do período + Barra Hoje */}
        <div className="p-4 rounded-lg bg-gradient-to-br from-green-50 to-green-50/50 border border-green-200/50">
          <div className="mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Atendimentos
            </p>
            <p className="text-2xl font-bold text-green-600">{totalAtendimentos}</p>
            <p className="text-[10px] text-muted-foreground">Período: meta {META_ATENDIMENTOS}/dia</p>
          </div>
          <ProgressWithLabel
            label="Hoje"
            current={atendimentosHoje}
            goal={META_ATENDIMENTOS}
            variant="success"
          />
        </div>

        {/* Agendamentos do período + Barra Hoje + 🏆 */}
        <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-50/50 border border-blue-200/50">
          <div className="mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Agendamentos
            </p>
            <p className="text-2xl font-bold text-blue-600">{totalAgendamentos}</p>
            <p className="text-[10px] text-muted-foreground">Período: meta {META_AGENDAMENTOS}/dia</p>
          </div>
          <ProgressWithLabel
            label="Hoje"
            current={agendamentosHoje}
            goal={META_AGENDAMENTOS}
            variant="info"
            showTrophy={true}
          />
        </div>

        {/* Taxa de conversão do dia */}
        <div className="p-4 rounded-lg bg-gradient-to-br from-amber-50 to-amber-50/50 border border-amber-200/50">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Conversão Hoje
          </p>
          <p className="text-2xl font-bold text-amber-600">{taxaHoje}%</p>
          <p className="text-[10px] text-muted-foreground mt-3">
            {agendamentosHoje} agendamentos de {atendimentosHoje} atendimentos
          </p>
        </div>
      </div>

      {/* Gráfico - Mostrar apenas se não for "Hoje" */}
      {period !== "today" && (
        <>
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
        </>
      )}

      {period === "today" && (
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Progresso em tempo real das metas do dia
        </p>
      )}
    </div>
  );
}
