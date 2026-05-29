import React, { useMemo } from "react";
import AlertItem, { Alert } from "./AlertItem";
import { useLeads } from "@/hooks/useLeads";

type AlertsFeedProps = {
  leads: any[];
  max?: number;
};

// heurística simples para gerar alerts a partir dos leads
function generateAlertsFromLeads(leads: any[]): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date();
  leads.forEach((l: any, idx: number) => {
    // Lead sem contato por mais de 30 dias
    const created = l.dataCriacao ? (() => {
      const parts = l.dataCriacao.split('/');
      if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      return null;
    })() : null;
    if (created) {
      const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 30 && (!l.lastFollowUpDone || l.lastFollowUpDone === "")) {
        alerts.push({
          id: `stale_${idx}`,
          leadId: l.id,
          level: "medium",
          title: `Lead sem contato há ${diffDays} dias: ${l.nome}`,
          reason: `Criado em ${l.dataCriacao} — sem follow-up registrado.`,
          impact: "—",
          timestamp: l.dataCriacao,
        } as any);
      }
    }

    // Agendado e sem comparecimento previsto (no-show risk)
    if (l.dataAgendamento && l.comparecimento !== "COMPARECEU") {
      alerts.push({
        id: `appt_${idx}`,
        leadId: l.id,
        level: "low",
        title: `Agendamento sem confirmação: ${l.nome}`,
        reason: `Agendado em ${l.dataAgendamento} — status: ${l.comparecimento || 'Pendente'}`,
        impact: "—",
        timestamp: l.dataAgendamento,
      } as any);
    }
  });
  // Sort high level first (we only have medium/low in heuristic)
  return alerts.slice(0, 50);
}

export const AlertsFeed: React.FC<AlertsFeedProps> = ({ leads, max = 6 }) => {
  const { updateLead } = useLeads();
  const alerts = useMemo(() => generateAlertsFromLeads(leads), [leads]);

  return (
    <div className="space-y-3">
      {alerts.length === 0 ? (
        <div className="p-4 rounded-lg bg-card text-muted-foreground">Nenhum alerta estratégico encontrado.</div>
      ) : (
        alerts.slice(0, max).map((a: any) => (
          <AlertItem
            key={a.id}
            alert={a}
            onAssign={async (id) => {
              try {
                if (a.leadId) {
                  await updateLead(a.leadId, { alertAssigned: true, alertAssignedAt: new Date().toISOString() });
                }
              } catch (e) {
                console.error('assign failed', e);
              }
            }}
            onResolve={async (id) => {
              try {
                if (a.leadId) {
                  await updateLead(a.leadId, { alertResolved: true, alertResolvedAt: new Date().toISOString() });
                }
              } catch (e) {
                console.error('resolve failed', e);
              }
            }}
          />
        ))
      )}
    </div>
  );
};

export default AlertsFeed;
