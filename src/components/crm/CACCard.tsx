import React from "react";
import React from "react";
import React, { useMemo } from "react";
import { Lead } from "@/types/crm";

function calcularCAC(leads: Lead[]) {
  // Agrupa por procedimento e canal
  const stats: Record<string, { leads: number; fechou: number; ticket: number; custo: number; canal: string; procedimento: string }> = {};
  leads.forEach((lead) => {
    const canal = lead.fonteLead || "Outro";
    const procedimento = lead.servicoProcurado || "Outro";
    const key = `${procedimento}__${canal}`;
    if (!stats[key]) stats[key] = { leads: 0, fechou: 0, ticket: 200, custo: 0, canal, procedimento };
    stats[key].leads++;
    if (lead.etapaLead === "Finalizado") stats[key].fechou++;
    // Ticket médio fictício (pode ser dinâmico)
    // Custo fictício por lead (pode ser dinâmico por canal)
    stats[key].custo += 30; // Exemplo: R$30 por lead
  });
  // Calcula CAC
  const lista = Object.values(stats).map((s) => ({
    ...s,
    cac: s.fechou > 0 ? (s.custo / s.fechou).toFixed(2) : "-",
    ticketMedio: s.ticket,
  }));
  lista.sort((a, b) => (a.canal > b.canal ? 1 : -1));
  return lista;
}

export function CACCard({ leads }: { leads: Lead[] }) {
  const cac = useMemo(() => calcularCAC(leads), [leads]);
  return (
    <div className="rounded-xl shadow bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 min-h-[180px] flex flex-col">
      <h3 className="font-bold text-lg mb-2 text-pink-700 dark:text-pink-400">CAC Real por Procedimento/Canal</h3>
      <table className="w-full text-xs mt-2">
        <thead>
          <tr>
            <th className="text-left">Procedimento</th>
            <th>Canal</th>
            <th>Leads</th>
            <th>Fech.</th>
            <th>Ticket Médio</th>
            <th>CAC</th>
          </tr>
        </thead>
        <tbody>
          {cac.slice(0, 5).map((c) => (
            <tr key={c.procedimento + c.canal}>
              <td>{c.procedimento}</td>
              <td>{c.canal}</td>
              <td>{c.leads}</td>
              <td>{c.fechou}</td>
              <td>R$ {c.ticketMedio}</td>
              <td>{c.cac !== "-" ? `R$ ${c.cac}` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
