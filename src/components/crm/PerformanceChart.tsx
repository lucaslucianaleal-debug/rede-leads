import { ptBR } from "date-fns/locale";
import { subDays, eachDayOfInterval, format } from "date-fns";
import { useMemo, useState } from "react";
import { Activity, TrendingUp } from "lucide-react";
import { Lead } from "@/types/crm";
import { ProgressWithLabel } from "@/components/ui/progress-with-label";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer
} from "recharts";

interface PerformanceChartProps {
  leads: Lead[];
}

type PeriodKey = "today" | "7d" | "30d";

const META_ATENDIMENTOS = 40;
const META_AGENDAMENTOS = 10;
const META_REAGENDAMENTOS = 5;

export function PerformanceChart({ leads }: PerformanceChartProps) {
  const [period, setPeriod] = useState<PeriodKey>("today");

  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;

  // Gera os dados por dia para o período selecionado
  // Se for "hoje", mostra apenas barras de progresso; se for período, mostra gráfico
  const { chartData, totalAtendimentos, totalAgendamentos, totalReagendamentos } = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const start = subDays(today, days - 1);
    start.setHours(0, 0, 0, 0);

    const interval = eachDayOfInterval({ start, end: today });

    const data = interval.map((day) => {
      const dayStr = format(day, "dd/MM/yyyy");

      // Seguir mesma lógica do relatório diário:
      // - Novos leads = dataContato
      // - Follow-ups realizados = dataFollowUp
      // - Agendamentos feitos = subset de follow-ups com dataAgendamento e agendamento >= follow-up
      const newLeads = leads.filter((l) => {
        if ((l as any)._deleted) return false;
        const dc = l.dataContato || "";
        return dc.startsWith(dayStr);
      });

      const followUpsDone = leads.filter((l) => {
        if ((l as any)._deleted) return false;
        const df = l.lastFollowUpDone || "";
        return df.startsWith(dayStr);
      });

      // Agendamentos: contar apenas agendamentos CRIADOS nesse dia (dataAgendamentoCriado)
      const appointmentsMade = leads.filter((l) => {
        if ((l as any)._deleted) return false;
        const dac = l.dataAgendamentoCriado || "";
        return dac.startsWith(dayStr);
      });

      // Reagendamentos: contar alterações de agendamento feitas nesse dia
      const reschedulesMade = leads.filter((l) => {
        if ((l as any)._deleted) return false;
        const daa = l.dataAgendamentoAlterado || "";
        return daa.startsWith(dayStr);
      });

      // Deduplicar com prioridade: agendamento > followup > novo
      const seen = new Set<string>();
      const allDetails: Lead[] = [] as any;
      for (const l of [...appointmentsMade, ...reschedulesMade, ...followUpsDone, ...newLeads]) {
        if (!seen.has(l.id)) { seen.add(l.id); allDetails.push(l); }
      }

      const atendimentos = allDetails.length;
      const agendamentos = appointmentsMade.length;
      const reagendamentos = reschedulesMade.length;

      return {
        dia: format(day, days === 1 ? "'Hoje'" : days === 7 ? "EEE dd/MM" : "dd/MM", { locale: ptBR }),
        Atendimentos: atendimentos,
        Agendamentos: agendamentos,
        Reagendamentos: reagendamentos,
      };
    });

    const totalAt = data.reduce((acc, d) => acc + d.Atendimentos, 0);
    const totalAg = data.reduce((acc, d) => acc + d.Agendamentos, 0);
    const totalRes = data.reduce((acc, d) => acc + d.Reagendamentos, 0);

    return { chartData: data, totalAtendimentos: totalAt, totalAgendamentos: totalAg, totalReagendamentos: totalRes };
  }, [leads, days]);

  // Taxa de conversão do período
  const taxaConversao =
    totalAtendimentos > 0
      ? ((totalAgendamentos / totalAtendimentos) * 100).toFixed(1)
      : "0.0";

  // Métricas do dia de hoje para as barras de progresso
  const todayStr = format(new Date(), "dd/MM/yyyy");
  const newLeadsToday = leads.filter((l) => !(l as any)._deleted && (l.dataContato || "").startsWith(todayStr));
  const followUpsDoneToday = leads.filter((l) => !(l as any)._deleted && (l.lastFollowUpDone || "").startsWith(todayStr));
  const appointmentsMadeToday = leads.filter((l) => !(l as any)._deleted && (l.dataAgendamentoCriado || "").startsWith(todayStr));
  const reschedulesToday = leads.filter((l) => !(l as any)._deleted && (l.dataAgendamentoAlterado || "").startsWith(todayStr));
  // IDs for debugging
  const newLeadsTodayIds = newLeadsToday.map(l => `${l.id}:${l.nome}`).slice(0, 20);
  const followUpsDoneTodayIds = followUpsDoneToday.map(l => `${l.id}:${l.nome}`).slice(0, 20);
  const appointmentsMadeTodayIds = appointmentsMadeToday.map(l => `${l.id}:${l.nome}`).slice(0, 20);
  const reschedulesTodayIds = reschedulesToday.map(l => `${l.id}:${l.nome}`).slice(0, 20);
  const seenToday = new Set<string>();
  const allToday: Lead[] = [] as any;
  for (const l of [...appointmentsMadeToday, ...reschedulesToday, ...followUpsDoneToday, ...newLeadsToday]) {
    if (!seenToday.has(l.id)) { seenToday.add(l.id); allToday.push(l); }
  }
  const atendimentosHoje = allToday.length;
  const agendamentosHoje = appointmentsMadeToday.length;
  const reagendamentosHoje = reschedulesToday.length;
  const taxaHoje =
    atendimentosHoje > 0
      ? ((agendamentosHoje / atendimentosHoje) * 100).toFixed(1)
      : "0.0";

  // Contagem de follow-ups concluídos hoje (para sincronizar com FollowUpQueue)
  const checksDoneToday = followUpsDoneToday.length;

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

      {/* Debug: mostrar detalhamento apenas em localhost */}
      {typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost' && (
        <div className="mt-3 p-3 rounded-md bg-muted/40 text-xs">
          <strong>DEBUG (localhost):</strong>
          <div>newLeadsToday: {newLeadsToday.length} — ids: {newLeadsTodayIds.join(', ')}</div>
          <div>followUpsDoneToday: {followUpsDoneToday.length} — ids: {followUpsDoneTodayIds.join(', ')}</div>
          <div>appointmentsMadeToday: {appointmentsMadeToday.length} — ids: {appointmentsMadeTodayIds.join(', ')}</div>
          <div>reschedulesToday: {reschedulesToday.length} — ids: {reschedulesTodayIds.join(', ')}</div>
          <div className="mt-2">Atendimentos hoje (deduplicados): {atendimentosHoje} — exemplos: {allToday.slice(0,10).map(l=>l.id+':'+l.nome).join(', ')}</div>
        </div>
      )}

      {/* Cards de resumo com barras de progresso */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {/* Atendimentos do período + Barra Hoje */}
        <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-br from-green-50 to-green-50/50 border border-green-200/50">
          <div className="mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Atendimentos
            </p>
            <p className="text-xl sm:text-2xl font-bold text-green-600">{totalAtendimentos}</p>
            <p className="text-[10px] text-muted-foreground">Meta {META_ATENDIMENTOS}/dia</p>
          </div>
          <ProgressWithLabel
            label="Hoje"
            current={atendimentosHoje}
            goal={META_ATENDIMENTOS}
            variant="success"
          />
        </div>

        {/* Agendamentos do período + Barra Hoje + 🏆 */}
        <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-50/50 border border-blue-200/50">
          <div className="mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Agendamentos
            </p>
            <p className="text-xl sm:text-2xl font-bold text-blue-600">{totalAgendamentos}</p>
            <p className="text-[10px] text-muted-foreground">Meta {META_AGENDAMENTOS}/dia</p>
          </div>
          <ProgressWithLabel
            label="Hoje"
            current={agendamentosHoje}
            goal={META_AGENDAMENTOS}
            variant="info"
            showTrophy={true}
          />
        </div>

        {/* Reagendamentos do período + Barra Hoje */}
        <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-br from-amber-50 to-amber-50/50 border border-amber-200/50">
          <div className="mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Reagendamentos
            </p>
            <p className="text-xl sm:text-2xl font-bold text-amber-600">{totalReagendamentos}</p>
            <p className="text-[10px] text-muted-foreground">Reagendamentos no período</p>
          </div>
          <ProgressWithLabel
            label="Hoje"
            current={reagendamentosHoje}
            goal={META_REAGENDAMENTOS}
            variant="warning"
          />
        </div>

        {/* Taxa de conversão do dia */}
        <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-br from-amber-50 to-amber-50/50 border border-amber-200/50">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Conversão Hoje
          </p>
          <p className="text-xl sm:text-2xl font-bold text-amber-600">{taxaHoje}%</p>
          <p className="text-[10px] text-muted-foreground mt-3">
            {agendamentosHoje} agend. / {atendimentosHoje} atend.
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
                stroke="#2563eb"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{ value: `Meta ${META_AGENDAMENTOS}`, fontSize: 9, fill: "#2563eb", position: "insideTopRight" }}
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
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#2563eb" }}
                activeDot={{ r: 5 }}
              />

                  {/* Linha 3: Reagendamentos */}
                  <Line
                    type="monotone"
                    dataKey="Reagendamentos"
                    stroke="hsl(var(--warning))"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "hsl(var(--warning))" }}
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
