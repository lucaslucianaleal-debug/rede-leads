import React from "react";
import { Lead } from "@/types/crm";

export default function HeroOperationalBlock({ leads, ticketAverage }: { leads: Lead[]; ticketAverage: number }) {
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

  return (
    <div className="bg-card p-5 rounded-xl shadow-md">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <div className="text-sm text-muted-foreground">Situação Operacional Hoje</div>
          <h2 className="text-2xl font-bold mt-1">{bottleneck.key} — prioridade operacional</h2>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="col-span-1 p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-muted-foreground">Receita em Risco</div>
              <div className="text-lg font-semibold mt-1">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaEmRisco)}</div>
              <div className="text-xs text-muted-foreground">agendados próximos 7 dias: {agendadosProx7.length}</div>
            </div>
            <div className="col-span-1 p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-muted-foreground">Receita Recuperável</div>
              <div className="text-lg font-semibold mt-1">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaRecuperavel)}</div>
              <div className="text-xs text-muted-foreground">follow-ups pendentes: {followupsPendentes}</div>
            </div>
            <div className="col-span-1 p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-muted-foreground">Melhor Canal</div>
              <div className="text-lg font-semibold mt-1">Online</div>
              <div className="text-xs text-muted-foreground">eficiência +{/* placeholder */}28%</div>
            </div>
            <div className="col-span-1 p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-muted-foreground">Ação Recomendada</div>
              <div className="text-lg font-semibold mt-1">{recommendedAction}</div>
              <div className="text-xs text-muted-foreground">Impacto estimado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaRecuperavel)}</div>
            </div>
          </div>
        </div>
        <div className="w-full md:w-64 p-3 bg-gradient-to-br from-white/5 to-white/3 rounded-lg">
          <div className="text-xs text-muted-foreground">Gargalo atual</div>
          <div className="text-xl font-bold mt-2">{bottleneck.key}</div>
          <div className="text-sm text-muted-foreground mt-1">Quantidade: {bottleneck.count}</div>
          <div className="mt-3">
            <button className="px-3 py-2 bg-primary text-white rounded">Abrir ação operacional</button>
          </div>
        </div>
      </div>
    </div>
  );
}
