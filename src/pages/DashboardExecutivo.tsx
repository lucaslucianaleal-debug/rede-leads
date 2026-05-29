import React from "react";
import { useLeads } from "@/hooks/useLeads";
import { ScoreLeadCard } from "@/components/crm/ScoreLeadCard";
import { LeadMorrendoCard } from "@/components/crm/LeadMorrendoCard";
import { RankingRecepcionistasCard } from "@/components/crm/RankingRecepcionistasCard";
import { PrevisaoFaturamentoCard } from "@/components/crm/PrevisaoFaturamentoCard";
import { IQFCard } from "@/components/crm/IQFCard";
import { RiscoNoShowCard } from "@/components/crm/RiscoNoShowCard";
import { CACCard } from "@/components/crm/CACCard";
import { ConsultoriaCard } from "@/components/crm/ConsultoriaCard";
import KPIExecutiveCard from "@/components/crm/executive/KPIExecutiveCard";
import AlertsFeed from "@/components/crm/executive/AlertsFeed";
import ForecastBlock from "@/components/crm/executive/ForecastBlock";
import PredictiveScoreCard from "@/components/crm/executive/PredictiveScoreCard";
import PerformanceBarCard from "@/components/crm/executive/PerformanceBarCard";
import SourcePerformanceCard from "@/components/crm/executive/SourcePerformanceCard";
import ActionCommandCard, { ActionCommand } from "@/components/crm/executive/ActionCommandCard";
import HeroOperationalBlock from "@/components/crm/executive/HeroOperationalBlock";

export default function DashboardExecutivo() {
  const { leads, lastSyncedAt, dataSource, ticketAverage } = useLeads();
  const [periodPreset, setPeriodPreset] = React.useState<string>("last_7");

  // Helpers para métricas no período selecionado
  const parseDMY = (s?: string) => {
    if (!s) return null;
    const parts = s.split('/');
    if (parts.length < 3) return null;
    const d = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const y = Number(parts[2].split(' ')[0]);
    return new Date(y, m, d);
  };

  const getPeriodRange = (preset: string) => {
    const end = new Date();
    let start = new Date();
    switch (preset) {
      case 'last_7':
        start.setDate(end.getDate() - 6);
        break;
      case 'last_30':
        start.setDate(end.getDate() - 29);
        break;
      case 'month_current':
        start = new Date(end.getFullYear(), end.getMonth(), 1);
        break;
      case 'month_prev':
        const prev = new Date(end.getFullYear(), end.getMonth() - 1, 1);
        start = new Date(prev.getFullYear(), prev.getMonth(), 1);
        end.setFullYear(prev.getFullYear(), prev.getMonth());
        end.setDate(new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate());
        break;
      default:
        start.setDate(end.getDate() - 6);
    }
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
    return { start, end };
  };

  const { start: periodStart, end: periodEnd } = getPeriodRange(periodPreset);

  const inRange = (d?: string) => {
    const date = parseDMY(d);
    if (!date) return false;
    return date >= periodStart && date <= periodEnd;
  };

  const totalLeads = leads.filter((l) => inRange(l.dataCriacao)).length;
  const agendados = leads.filter((l) => inRange(l.dataAgendamento)).length;
  const compareceram = leads.filter((l) => inRange(l.dataAgendamento) && l.comparecimento === "COMPARECEU").length;
  const followupsPend = leads.filter((l) => inRange(l.dataFollowUp) && l.comparecimento !== "COMPARECEU").length;
  const receitaPrevista = agendados * (ticketAverage || 0);

  // Sparkline: leads criados últimos 7 dias
  const sparkLast7 = (() => {
    const arr = Array.from({ length: 7 }).map(() => 0);
    const now = new Date();
    leads.forEach((l) => {
      const parts = (l.dataCriacao || "").split("/");
      if (parts.length === 3) {
        const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < 7) arr[6 - diff]++;
      }
    });
    return arr;
  })();

  const periodLabel = (() => {
    switch (periodPreset) {
      case 'last_7': return 'Últimos 7 dias';
      case 'last_30': return 'Últimos 30 dias';
      case 'month_current': return 'Mês atual';
      case 'month_prev': return 'Mês anterior';
      default: return 'Período selecionado';
    }
  })();

  // --- Action-Command Engine (placed after parseDMY so parseDMY is available) ---
  const getWALink = (telefone: string) => {
    const num = telefone ? telefone.replace(/\D/g, "") : "";
    return num.length >= 10 ? `https://wa.me/${num}` : undefined;
  };

  const hoje = new Date();
  const amanha = new Date();
  amanha.setDate(hoje.getDate() + 1);
  const isHojeOuAmanha = (d?: string) => {
    const date = parseDMY(d);
    if (!date) return false;
    return (
      date >= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) &&
      date <= new Date(amanha.getFullYear(), amanha.getMonth(), amanha.getDate(), 23, 59, 59, 999)
    );
  };

  const urgenteLeads = (leads || []).filter(
    (l) =>
      isHojeOuAmanha(l.dataAgendamento) &&
      ["FRIO", "NÃO RESPONDEU"].includes((l.status || "").toUpperCase()) &&
      l.comparecimento !== "COMPARECEU"
  );

  const prioritarioLeads = (leads || []).filter((l) => !l.captador || l.captador.trim() === "");

  const rotinaLeads = (leads || []).filter(
    (l) =>
      !l.dataAgendamento &&
      l.etapaLead && l.etapaLead.toLowerCase().includes("follow-up") &&
      l.comparecimento !== "COMPARECEU"
  );

  const actionCommands: ActionCommand[] = [];
  urgenteLeads.slice(0, 2).forEach((l) => {
    actionCommands.push({
      acao: `Recuperar lead para evitar perda de agendamento!`,
      cliente: l.nome,
      clienteLink: getWALink(l.telefone),
      motivo: `Lead agendado para hoje/amanhã com status ${l.status || "-"}.`,
      tempo: "Imediato",
      nivel: "URGENTE",
    });
  });
  prioritarioLeads.slice(0, 2).forEach((l) => {
    actionCommands.push({
      acao: `Atribuir responsável ao lead!`,
      cliente: l.nome,
      clienteLink: getWALink(l.telefone),
      motivo: `Lead sem responsável/captador definido.`,
      tempo: "Hoje",
      nivel: "PRIORITÁRIO",
    });
  });
  rotinaLeads.slice(0, 2).forEach((l) => {
    actionCommands.push({
      acao: `Realizar follow-up pendente`,
      cliente: l.nome,
      clienteLink: getWALink(l.telefone),
      motivo: `Lead está em etapa de follow-up sem agendamento.`,
      tempo: "Até o fim do dia",
      nivel: "ROTINA",
    });
  });

  return (
    <div className="space-y-6">
      {/* Hero Operational Block - Situation summary and decision prompts */}
      <HeroOperationalBlock leads={leads} ticketAverage={ticketAverage || 120} />

      {/* Action Command Cards - Top Priority */}
      {actionCommands.length > 0 && (
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2">Comandos de Ação Operacional</h3>
          <div className="flex flex-col gap-2">
            {actionCommands.map((cmd, idx) => (
              <ActionCommandCard key={cmd.nivel + cmd.cliente + idx} command={cmd} />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="text-sm text-muted-foreground">Período:</label>
          <select value={periodPreset} onChange={(e) => setPeriodPreset(e.target.value)} className="rounded px-2 py-1 border">
            <option value="last_7">Últimos 7 dias</option>
            <option value="last_30">Últimos 30 dias</option>
            <option value="month_current">Mês atual</option>
            <option value="month_prev">Mês anterior</option>
          </select>
          <div className="text-sm text-muted-foreground">{periodLabel}</div>
        </div>
        <div className="text-sm text-muted-foreground">Dados até: {lastSyncedAt ?? '—'} • Fonte: {dataSource ?? '—'}</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <KPIExecutiveCard title="Total de Leads" value={totalLeads} subtitle="Últimos 7 dias" sparkline={sparkLast7} />
        <KPIExecutiveCard title="Agendados" value={agendados} subtitle="Agendamentos" sparkline={sparkLast7} />
        <KPIExecutiveCard title="Compareceram" value={compareceram} subtitle="Comparecimento" sparkline={sparkLast7} />
        <KPIExecutiveCard title="Follow-ups Pend." value={followupsPend} subtitle="Ações pendentes" sparkline={sparkLast7} />
        <KPIExecutiveCard title="Receita Prevista" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaPrevista)} subtitle={periodLabel} sparkline={sparkLast7} />
        <KPIExecutiveCard title="CAC / ROI" value="—" subtitle="Dados de custo não informados" sparkline={sparkLast7} />
      </div>

      <div className="grid gap-6 md:gap-8 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Alertas Estratégicos</h3>
              <div className="text-sm text-muted-foreground">Prioridade: Alta → Baixa</div>
            </div>
            <div className="mt-3">
              <div className="bg-card p-4 rounded-lg">
                {/* Alerts feed */}
                <div>
                  {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                  {/* @ts-ignore */}
                  <AlertsFeed leads={leads} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Performance Operacional</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Use existing ranking as placeholder */}
              <div>
                <RankingRecepcionistasCard leads={leads} />
              </div>
              <div>
                <div className="space-y-3">
                  <PerformanceBarCard label="Tempo médio até primeiro contato (min)" value={30} max={120} />
                  <PerformanceBarCard label="Taxa de resposta 24h (%)" value={68} max={100} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Previsão de Faturamento</h3>
            <div className="mt-3"><ForecastBlock leads={leads} /></div>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold">Índice Preditivo</h3>
            <div className="mt-3"><PredictiveScoreCard leads={leads} /></div>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold">Performance por Fonte</h3>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <SourcePerformanceCard source="Online" cac={120} roi={150} conversion={4.5} />
              <SourcePerformanceCard source="Google" cac={180} roi={120} conversion={3.8} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
