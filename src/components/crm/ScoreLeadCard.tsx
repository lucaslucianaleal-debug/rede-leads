import React, { useMemo } from "react";
import { Lead } from "@/types/crm";

// Função simples de score (exemplo inicial)
function calcularScore(lead: Lead) {
  // Score de comparecimento: começa em 50, soma pontos por status/quente, subtrai se demorou responder, etc.
  let scoreComparecimento = 50;
  if (lead.status === "QUENTE") scoreComparecimento += 30;
  if (lead.status === "MORNO") scoreComparecimento += 10;
  if (lead.status === "FRIO") scoreComparecimento -= 10;
  if (lead.respostaLead === "NÃO RESPONDEU") scoreComparecimento -= 20;
  if (lead.historicoAgendamentos && lead.historicoAgendamentos.length > 1) scoreComparecimento -= 10;
  // Simples: quanto mais follow-ups, menor score
  scoreComparecimento -= lead.followUpCount * 2;
  if (scoreComparecimento > 100) scoreComparecimento = 100;
  if (scoreComparecimento < 0) scoreComparecimento = 0;

  // Score de fechamento: status quente + agendado + compareceu
  let scoreFechamento = 30;
  if (lead.status === "QUENTE") scoreFechamento += 30;
  if (lead.dataAgendamento) scoreFechamento += 20;
  if (lead.comparecimento === "COMPARECEU") scoreFechamento += 20;
  if (scoreFechamento > 100) scoreFechamento = 100;

  // Score de sumiço: quanto mais tempo sem resposta, maior
  let scoreSumico = 0;
  if (lead.respostaLead === "NÃO RESPONDEU") scoreSumico += 30;
  if (lead.status === "FRIO") scoreSumico += 20;
  if (lead.followUpCount > 3) scoreSumico += 10;
  if (scoreSumico > 100) scoreSumico = 100;

  return {
    comparecimento: scoreComparecimento,
    fechamento: scoreFechamento,
    sumico: scoreSumico,
  };
}

export function ScoreLeadCard({ leads }: { leads: Lead[] }) {
  // Exibe os 5 primeiros leads ordenados por data de criação
  const topLeads = useMemo(() => {
    return [...leads]
      .sort((a, b) => (a.dataCriacao > b.dataCriacao ? -1 : 1))
      .slice(0, 5);
  }, [leads]);

  return (
    <div className="rounded-xl shadow bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 min-h-[180px] flex flex-col">
      <h3 className="font-bold text-lg mb-2 text-primary">Score Automático de Lead</h3>
      <table className="w-full text-xs mt-2">
        <thead>
          <tr>
            <th className="text-left">Lead</th>
            <th>Comparecimento</th>
            <th>Fechamento</th>
            <th>Sumiço</th>
          </tr>
        </thead>
        <tbody>
          {topLeads.map((lead) => {
            const score = calcularScore(lead);
            return (
              <tr key={lead.id}>
                <td>{lead.nome}</td>
                <td>{score.comparecimento}% {score.comparecimento > 70 ? "🟢" : score.comparecimento > 40 ? "🟡" : "🔴"}</td>
                <td>{score.fechamento}% {score.fechamento > 70 ? "🟢" : score.fechamento > 40 ? "🟡" : "🔴"}</td>
                <td>{score.sumico}% {score.sumico > 70 ? "🔴" : score.sumico > 40 ? "🟠" : "🟢"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
