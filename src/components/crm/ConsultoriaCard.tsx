import React, { useMemo } from "react";
import { Lead } from "@/types/crm";

function gerarConsultoria(leads: Lead[]) {
  const sugestoes: string[] = [];
  // Exemplo de sugestão automática
  const leadsSemConfirmacao = leads.filter(l => l.dataAgendamento && (!l.comparecimento || l.comparecimento === "AGUARDANDO DATA"));
  if (leadsSemConfirmacao.length > 10) {
    sugestoes.push("Teste: Envie confirmação de WhatsApp 2h antes do agendamento para reduzir no-show.");
  }
  const fontesQueda = (() => {
    // Detecta fonte com queda de conversão
    const fontes: Record<string, { total: number; fechou: number }> = {};
    leads.forEach((l) => {
      const fonte = l.fonteLead || "Outro";
      if (!fontes[fonte]) fontes[fonte] = { total: 0, fechou: 0 };
      fontes[fonte].total++;
      if (l.etapaLead === "Finalizado") fontes[fonte].fechou++;
    });
    return Object.entries(fontes)
      .filter(([_, d]) => d.total > 10 && d.fechou / d.total < 0.2)
      .map(([fonte]) => fonte);
  })();
  if (fontesQueda.length > 0) {
    sugestoes.push(`Diagnóstico: Fontes com queda de conversão: ${fontesQueda.join(", ")}`);
  }
  // Ação prioritária
  const leadsAltoRisco = leads.filter(l => l.dataAgendamento && l.respostaLead === "NÃO RESPONDEU");
  if (leadsAltoRisco.length > 5) {
    sugestoes.push("Ação: Priorize contato com leads de alto risco de no-show.");
  }
  if (sugestoes.length === 0) sugestoes.push("Nenhuma sugestão automática no momento. 🎉");
  return sugestoes;
}

export function ConsultoriaCard({ leads }: { leads: Lead[] }) {
  const sugestoes = useMemo(() => gerarConsultoria(leads), [leads]);
  return (
    <div className="rounded-xl shadow bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 min-h-[120px] flex flex-col">
      <h3 className="font-bold text-lg mb-2 text-cyan-700 dark:text-cyan-400">Consultoria Automática</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {sugestoes.map((s, i) => (
          <li key={i}>💡 {s}</li>
        ))}
      </ul>
    </div>
  );
}
