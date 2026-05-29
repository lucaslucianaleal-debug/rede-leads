import React from "react";
import React from "react";
import React, { useMemo } from "react";
import { Lead } from "@/types/crm";

function calcularRiscoNoShow(leads: Lead[]) {
  // Score de risco: alto se demorou responder, reagendou, veio de promotora, marcou longe, visualizou e sumiu, não confirmou
  return leads.filter((lead) => {
    if (!lead.dataAgendamento) return false;
    // Exemplo de regras simples
    let risco = 0;
    if (lead.respostaLead === "NÃO RESPONDEU") risco += 30;
    if (lead.historicoAgendamentos && lead.historicoAgendamentos.length > 1) risco += 20;
    if ((lead.fonteLead || "").toLowerCase().includes("promotora")) risco += 20;
    // Se agendamento for para mais de 7 dias à frente
    const [d, m, y] = lead.dataAgendamento.split("/");
    const agData = new Date(`${y}-${m}-${d}T00:00:00`);
    const hoje = new Date();
    const diffDias = (agData.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDias > 7) risco += 10;
    // Não confirmado (sem comparecimento)
    if (!lead.comparecimento || lead.comparecimento === "AGUARDANDO DATA") risco += 10;
    if (risco >= 50) return { ...lead, risco: "🔴 Alto" };
    if (risco >= 25) return { ...lead, risco: "🟠 Médio" };
    return { ...lead, risco: "🟢 Baixo" };
  }).map((lead) => {
    // Classifica
    let risco = 0;
    if (lead.respostaLead === "NÃO RESPONDEU") risco += 30;
    if (lead.historicoAgendamentos && lead.historicoAgendamentos.length > 1) risco += 20;
    if ((lead.fonteLead || "").toLowerCase().includes("promotora")) risco += 20;
    const [d, m, y] = lead.dataAgendamento.split("/");
    const agData = new Date(`${y}-${m}-${d}T00:00:00`);
    const hoje = new Date();
    const diffDias = (agData.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDias > 7) risco += 10;
    if (!lead.comparecimento || lead.comparecimento === "AGUARDANDO DATA") risco += 10;
    let riscoLabel = "🟢 Baixo";
    if (risco >= 50) riscoLabel = "🔴 Alto";
    else if (risco >= 25) riscoLabel = "🟠 Médio";
    return { ...lead, risco: riscoLabel };
  });
}

export function RiscoNoShowCard({ leads }: { leads: Lead[] }) {
  const agendados = useMemo(() => calcularRiscoNoShow(leads), [leads]);
  return (
    <div className="rounded-xl shadow bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 min-h-[120px] flex flex-col">
      <h3 className="font-bold text-lg mb-2 text-orange-700 dark:text-orange-400">Score de Risco de No-show</h3>
      <table className="w-full text-xs mt-2">
        <thead>
          <tr>
            <th className="text-left">Lead</th>
            <th>Data</th>
            <th>Risco</th>
          </tr>
        </thead>
        <tbody>
          {agendados.slice(0, 5).map((lead) => (
            <tr key={lead.id}>
              <td>{lead.nome}</td>
              <td>{lead.dataAgendamento}</td>
              <td>{lead.risco}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
