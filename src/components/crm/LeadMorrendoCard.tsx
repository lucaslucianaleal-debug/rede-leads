import React, { useMemo } from "react";
import { Lead } from "@/types/crm";

// Critérios de alerta de lead morrendo:
// - Lead estava quente e virou morno/frio nas últimas 12h
// - Lead visualizou e não respondeu
// - Lead sem interação há mais de 24h
function getLeadsMorrendo(leads: Lead[]) {
  const now = new Date();
  return leads.filter((lead) => {
    // Considera leads que não estão finalizados ou desistentes
    if (["Finalizado", "Desistência", "Fora da região"].includes(lead.etapaLead)) return false;
    // Lead estava quente e esfriou
    if (lead.status === "MORNO" || lead.status === "FRIO") {
      // Se o último follow-up foi nas últimas 12h
      if (lead.lastFollowUpDone) {
        const [d, m, y] = lead.lastFollowUpDone.split("/");
        const dt = new Date(`${y}-${m}-${d}T00:00:00`);
        const diff = (now.getTime() - dt.getTime()) / (1000 * 60 * 60);
        if (diff <= 12) return true;
      }
    }
    // Lead visualizou e não respondeu
    if (lead.respostaLead === "NÃO RESPONDEU" && lead.status !== "FRIO") {
      return true;
    }
    // Lead sem interação há mais de 24h
    if (lead.lastFollowUpDone) {
      const [d, m, y] = lead.lastFollowUpDone.split("/");
      const dt = new Date(`${y}-${m}-${d}T00:00:00`);
      const diff = (now.getTime() - dt.getTime()) / (1000 * 60 * 60);
      if (diff > 24) return true;
    }
    return false;
  });
}

export function LeadMorrendoCard({ leads }: { leads: Lead[] }) {
  const morrendo = useMemo(() => getLeadsMorrendo(leads), [leads]);
  return (
    <div className="rounded-xl shadow bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 min-h-[120px] flex flex-col">
      <h3 className="font-bold text-lg mb-2 text-yellow-700 dark:text-yellow-400">Alerta de Lead Morrendo</h3>
      {morrendo.length === 0 ? (
        <p>Nenhum lead em risco no momento 🎉</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {morrendo.slice(0, 5).map((lead) => (
            <li key={lead.id}>
              ⚠️ <strong>{lead.nome}</strong> — {lead.status === "FRIO" ? "Esfriou recentemente" : "Sem resposta"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
