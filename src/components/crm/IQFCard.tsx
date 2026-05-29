import React from "react";
import React, { useMemo } from "react";
import { Lead } from "@/types/crm";

function calcularIQF(leads: Lead[]) {
  // Agrupa por fonte
  const fontes: Record<string, { leads: number; agendados: number; compareceu: number; fechou: number }> = {};
  leads.forEach((lead) => {
    const fonte = lead.fonteLead || "Outro";
    if (!fontes[fonte]) fontes[fonte] = { leads: 0, agendados: 0, compareceu: 0, fechou: 0 };
    fontes[fonte].leads++;
    if (lead.dataAgendamento) fontes[fonte].agendados++;
    if (lead.comparecimento === "COMPARECEU") fontes[fonte].compareceu++;
    if (lead.etapaLead === "Finalizado") fontes[fonte].fechou++;
  });
  // Calcula IQF (exemplo: média ponderada das taxas)
  const lista = Object.entries(fontes).map(([fonte, d]) => {
    const taxaAgendamento = d.leads > 0 ? d.agendados / d.leads : 0;
    const taxaComparecimento = d.agendados > 0 ? d.compareceu / d.agendados : 0;
    const taxaFechamento = d.agendados > 0 ? d.fechou / d.agendados : 0;
    // IQF: 40% agendamento + 30% comparecimento + 30% fechamento
    const iqf = Math.round((taxaAgendamento * 40 + taxaComparecimento * 30 + taxaFechamento * 30) * 100);
    return {
      fonte,
      leads: d.leads,
      agendados: d.agendados,
      compareceu: d.compareceu,
      fechou: d.fechou,
      taxaAgendamento: (taxaAgendamento * 100).toFixed(1),
      taxaComparecimento: (taxaComparecimento * 100).toFixed(1),
      taxaFechamento: (taxaFechamento * 100).toFixed(1),
      iqf,
    };
  });
  lista.sort((a, b) => b.iqf - a.iqf);
  return lista;
}

export function IQFCard({ leads }: { leads: Lead[] }) {
  const fontes = useMemo(() => calcularIQF(leads), [leads]);
  return (
    <div className="rounded-xl shadow bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 min-h-[180px] flex flex-col">
      <h3 className="font-bold text-lg mb-2 text-purple-700 dark:text-purple-400">IQF - Qualidade da Fonte</h3>
      <table className="w-full text-xs mt-2">
        <thead>
          <tr>
            <th className="text-left">Fonte</th>
            <th>IQF</th>
            <th>Agend.</th>
            <th>Comp.</th>
            <th>Fech.</th>
            <th>Agend. (%)</th>
            <th>Comp. (%)</th>
            <th>Fech. (%)</th>
          </tr>
        </thead>
        <tbody>
          {fontes.slice(0, 5).map((f) => (
            <tr key={f.fonte}>
              <td>{f.fonte}</td>
              <td><b>{f.iqf}</b></td>
              <td>{f.agendados}</td>
              <td>{f.compareceu}</td>
              <td>{f.fechou}</td>
              <td>{f.taxaAgendamento}%</td>
              <td>{f.taxaComparecimento}%</td>
              <td>{f.taxaFechamento}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
