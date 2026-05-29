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

export default function DashboardExecutivo() {
  const { leads } = useLeads();

  // Helpers para métricas básicas (fallbacks quando dados financeiros não disponíveis)
  const totalLeads = leads.length;
  const agendados = leads.filter((l) => (l.dataAgendamento || "").trim() !== "").length;
  const compareceram = leads.filter((l) => l.comparecimento === "COMPARECEU").length;
  const followupsPend = leads.filter((l) => (l.etapaLead || "").toLowerCase().includes("follow-up") && l.comparecimento !== "COMPARECEU").length;

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <KPIExecutiveCard title="Total de Leads" value={totalLeads} subtitle="Últimos 7 dias" sparkline={sparkLast7} />
        <KPIExecutiveCard title="Agendados" value={agendados} subtitle="Agendamentos" sparkline={sparkLast7} />
        <KPIExecutiveCard title="Compareceram" value={compareceram} subtitle="Comparecimento" sparkline={sparkLast7} />
        <KPIExecutiveCard title="Follow-ups Pend." value={followupsPend} subtitle="Ações pendentes" sparkline={sparkLast7} />
        <KPIExecutiveCard title="Receita Prevista" value="—" subtitle="Dados financeiros indisponíveis" sparkline={sparkLast7} />
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
