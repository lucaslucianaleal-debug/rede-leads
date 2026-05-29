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

  const counts = alerts.reduce(
    (acc: any, a: any) => {
      acc.total++;
      if (a.level === 'high') acc.high++;
      if (a.level === 'medium') acc.medium++;
      if (a.level === 'low') acc.low++;
      return acc;
    },
    { total: 0, high: 0, medium: 0, low: 0 }
  );

  // Summary: leads em risco (heurística: agendados sem comparecimento)
  const leadsEmRisco = (leads || []).filter((l: any) => l.dataAgendamento && l.comparecimento !== 'COMPARECEU');
  const estimatedImpact = (leadsEmRisco.length * (useLeads().ticketAverage || 0)) || '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Alertas Estratégicos</h4>
          <div className="text-xs text-muted-foreground">{counts.total} alertas — Alto: {counts.high} • Médio: {counts.medium} • Baixo: {counts.low}</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 text-xs rounded bg-amber-600 text-white">Filtrar: Alta</button>
          <button className="px-3 py-1 text-xs rounded border">Exportar</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 bg-card p-3 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Leads em Risco Operacional</div>
              <div className="text-lg font-bold mt-1">{leadsEmRisco.length} leads</div>
              <div className="text-sm text-muted-foreground">Impacto estimado: {typeof estimatedImpact === 'number' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(estimatedImpact) : '—'}</div>
            </div>
            <div>
              <button onClick={() => { /* open detailed view placeholder */ }} className="px-3 py-2 bg-rose-600 text-white rounded">Ver lista</button>
            </div>
          </div>
        </div>

        <div className="bg-card p-3 rounded-lg shadow-sm">
          <div className="text-xs text-muted-foreground">Prioridade rápida</div>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Alta</div>
              <div className="text-sm text-rose-500 font-bold">{counts.high}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Média</div>
              <div className="text-sm text-amber-500 font-bold">{counts.medium}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Baixa</div>
              <div className="text-sm text-emerald-500 font-bold">{counts.low}</div>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default AlertsFeed;
