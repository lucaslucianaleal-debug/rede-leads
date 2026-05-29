import React, { useMemo } from "react";
import { Lead } from "@/types/crm";

function calcularPrevisao(leads: Lead[]) {
  // Faturamento previsto: leads agendados para o futuro * ticket médio (exemplo: 200)
  const ticketMedio = 200; // valor fictício, pode ser dinâmico
  const hoje = new Date();
  let agendados = 0;
  let comparecimentos = 0;
  let fechamentos = 0;
  leads.forEach((lead) => {
    if (lead.dataAgendamento) {
      // Considera agendamentos futuros
      const [d, m, y] = lead.dataAgendamento.split("/");
      const agData = new Date(`${y}-${m}-${d}T00:00:00`);
      if (agData >= hoje) agendados++;
    }
    if (lead.comparecimento === "COMPARECEU") comparecimentos++;
    if (lead.etapaLead === "Finalizado") fechamentos++;
  });
  const previsto = agendados * ticketMedio;
  const realizado = fechamentos * ticketMedio;
  const gargalo = agendados > comparecimentos ? "Comparecimento" : "Fechamento";
  return {
    previsto,
    realizado,
    agendados,
    comparecimentos,
    fechamentos,
    gargalo,
    ticketMedio,
  };
}

export function PrevisaoFaturamentoCard({ leads }: { leads: Lead[] }) {
  const prev = useMemo(() => calcularPrevisao(leads), [leads]);
  return (
    <div className="rounded-xl shadow bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 min-h-[180px] flex flex-col">
      <h3 className="font-bold text-lg mb-2 text-green-700 dark:text-green-400">Previsão de Faturamento</h3>
      <div className="mt-2 text-sm">
        <div>💰 Previsto: <b>R$ {prev.previsto.toLocaleString()}</b></div>
        <div>🎯 Realizado: <b>R$ {prev.realizado.toLocaleString()}</b></div>
        <div>📅 Agendados: {prev.agendados}</div>
        <div>✅ Comparecimentos: {prev.comparecimentos}</div>
        <div>🏆 Fechamentos: {prev.fechamentos}</div>
        <div>💡 Gargalo atual: <b>{prev.gargalo}</b></div>
        <div>💵 Ticket médio: R$ {prev.ticketMedio}</div>
      </div>
    </div>
  );
}
