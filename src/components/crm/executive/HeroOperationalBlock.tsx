import React from "react";
import { Lead } from "@/types/crm";

export default function HeroOperationalBlock({ leads, ticketAverage, onPrioritize }: { leads: Lead[]; ticketAverage: number; onPrioritize?: () => void }) {
  // upcoming 7 days
  const now = new Date();
  const inNextDays = (d?: string, days = 7) => {
    if (!d) return false;
    const parts = d.split("/");
    if (parts.length < 3) return false;
    const dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    const max = new Date(now);
    max.setDate(now.getDate() + days);
    return dt >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && dt <= max;
  };

  const agendadosProx7 = leads.filter((l) => l.dataAgendamento && inNextDays(l.dataAgendamento, 7));
  const agendadosNaoConfirmados = agendadosProx7.filter((l) => l.comparecimento !== "COMPARECEU");

  // Estimate risk probability per lead by status/response
  const riskForLead = (l: Lead) => {
    let p = 0.25;
    const st = (l.status || "").toUpperCase();
    if (st === "FRIO") p = 0.6;
    else if (st === "MORNO") p = 0.35;
    else if (st === "QUENTE") p = 0.12;
    const resp = (l.respostaLead || "").toUpperCase();
    if (resp === "NÃO RESPONDEU" || resp === "NAO RESPONDEU") p += 0.2;
    if (l.followUpCount && l.followUpCount > 3) p += 0.1;
    return Math.min(1, p);
  };

  const receitaEmRisco = agendadosNaoConfirmados.reduce((s, l) => s + ticketAverage * riskForLead(l), 0);

  // Recoverable revenue: followups pendentes (simple proxy)
  const followupsPendentes = leads.filter((l) => l.dataFollowUp && l.comparecimento !== "COMPARECEU").length;
  const receitaRecuperavel = followupsPendentes * ticketAverage * 0.6; // assume 60% recovery if acted

  // Leads sem captador
  const semResponsavel = leads.filter((l) => !l.captador || l.captador.trim() === "").length;

  // Determine main bottleneck
  const buckets = [
    { key: 'Comparecimento', count: agendadosNaoConfirmados.length },
    { key: 'Follow-ups', count: followupsPendentes },
    { key: 'Sem responsável', count: semResponsavel },
  ];
  buckets.sort((a, b) => b.count - a.count);
  const bottleneck = buckets[0];

  const recommendedAction = bottleneck.key === 'Comparecimento'
    ? 'Reforçar confirmações 2h antes e priorizar mensagens via WhatsApp.'
    : bottleneck.key === 'Follow-ups'
      ? 'Priorizar follow-ups D1–D3 nas próximas 2h (lista operacional).' 
      : 'Auto-atribuir leads sem responsável e distribuir por carga.';

  // Confidence heuristic
  const confidence = ((): 'Alta' | 'Média' | 'Baixa' => {
    if (agendadosProx7.length >= 8 || followupsPendentes >= 10) return 'Alta';
    if (agendadosProx7.length >= 4 || followupsPendentes >= 5) return 'Média';
    return 'Baixa';
  })();

  return (
    <div className="bg-card p-6 rounded-xl shadow-md">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground">Situação Operacional Hoje</div>
            <div className="ml-2 px-2 py-1 rounded text-xs font-semibold bg-rose-600 text-white">{bottleneck.key}</div>
            <div className="ml-4 text-xs text-muted-foreground">Impacto</div>
            <div className="ml-2 text-lg font-extrabold text-foreground">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaEmRisco)}</div>
          </div>

          <h2 className="text-3xl md:text-4xl font-extrabold mt-3 leading-tight">{recommendedAction}</h2>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="col-span-1 p-4 bg-white/5 rounded-lg">
              <div className="text-xs text-muted-foreground">Receita em Risco</div>
              <div className="text-xl font-semibold mt-1">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaEmRisco)}</div>
              <div className="text-xs text-muted-foreground mt-1">agendados próximos 7 dias: {agendadosProx7.length}</div>
            </div>
            <div className="col-span-1 p-4 bg-white/5 rounded-lg">
              <div className="text-xs text-muted-foreground">Receita Recuperável</div>
              <div className="text-xl font-semibold mt-1">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaRecuperavel)}</div>
              <div className="text-xs text-muted-foreground mt-1">follow-ups pendentes: {followupsPendentes}</div>
            </div>
            <div className="col-span-1 p-4 bg-white/5 rounded-lg">
              <div className="text-xs text-muted-foreground">Melhor Canal</div>
              <div className="text-xl font-semibold mt-1">Online</div>
              <div className="text-xs text-muted-foreground mt-1">eficiência +28%</div>
            </div>
            <div className="col-span-1 p-4 bg-white/5 rounded-lg">
              <div className="text-xs text-muted-foreground">Impacto & Ação</div>
              <div className="text-xl font-semibold mt-1">{recommendedAction}</div>
              <div className="text-xs text-muted-foreground mt-1">Impacto estimado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaRecuperavel)}</div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-80 p-4 bg-gradient-to-br from-white/5 to-white/3 rounded-lg flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Gargalo atual</div>
              <div className="text-2xl font-bold mt-1">{bottleneck.key}</div>
            </div>
            <div className={`px-2 py-1 rounded-full text-sm font-semibold ${confidence === 'Alta' ? 'bg-emerald-600 text-white' : confidence === 'Média' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'}`}>{confidence} confiança</div>
          </div>
          <div className="text-sm text-muted-foreground">Quantidade: <span className="font-semibold text-foreground">{bottleneck.count}</span></div>
          <div className="mt-4">
            <button onClick={() => onPrioritize && onPrioritize()} className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold shadow">Priorizar agora</button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Ação recomendada automaticamente — revise antes de executar.</div>
        </div>
      </div>
    </div>
  );
}
