import React, { useMemo, useState } from "react";
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
  const { updateLead, ticketAverage } = useLeads();
  const alerts = useMemo(() => generateAlertsFromLeads(leads), [leads]);

  const [filterLevel, setFilterLevel] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showList, setShowList] = useState(false);

  const applyFilter = (items: any[]) => {
    if (filterLevel === 'all') return items;
    return items.filter((i: any) => i.level === filterLevel);
  };

  const exportCSV = (items: any[]) => {
    const headers = ['id','level','title','reason','impact','timestamp','leadId'];
    const rows = items.map((r: any) => headers.map(h => `"${String(r[h] ?? '')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alerts_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
  const estimatedImpact = (leadsEmRisco.length * (ticketAverage || 0)) || '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Alertas Estratégicos</h4>
          <div className="text-xs text-muted-foreground">{counts.total} alertas — Alto: {counts.high} • Médio: {counts.medium} • Baixo: {counts.low}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFilterLevel(filterLevel === 'all' ? 'high' : filterLevel === 'high' ? 'medium' : filterLevel === 'medium' ? 'low' : 'all')} className="px-3 py-1 text-xs rounded bg-amber-600 text-white">Filtrar: {filterLevel === 'all' ? 'Tudo' : filterLevel === 'high' ? 'Alta' : filterLevel === 'medium' ? 'Média' : 'Baixa'}</button>
          <button onClick={() => exportCSV(alerts.slice(0, max))} className="px-3 py-1 text-xs rounded border">Exportar</button>
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
              <button onClick={() => setShowList(true)} className="px-3 py-2 bg-rose-600 text-white rounded">Ver lista</button>
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
        {applyFilter(alerts).length === 0 ? (
          <div className="p-4 rounded-lg bg-card text-muted-foreground">Nenhum alerta estratégico encontrado.</div>
        ) : (
          applyFilter(alerts).slice(0, max).map((a: any) => (
            <AlertItem
              key={a.id}
              alert={a}
              onAssign={async (alertId) => {
                try {
                  const target = alerts.find((x: any) => x.id === alertId);
                  if (!target) {
                    console.warn('Alert not found for assign', alertId);
                    return;
                  }
                  if (!updateLead) {
                    console.warn('updateLead not available');
                    return;
                  }
                  if (!target.leadId) {
                    console.warn('No leadId for alert', alertId);
                    return;
                  }
                  await updateLead(target.leadId, { alertAssigned: true, alertAssignedAt: new Date().toISOString() });
                  console.log('Alert assigned', alertId, target.leadId);
                } catch (e) {
                  console.error('assign failed', e);
                }
              }}
              onResolve={async (alertId) => {
                try {
                  const target = alerts.find((x: any) => x.id === alertId);
                  if (!target) {
                    console.warn('Alert not found for resolve', alertId);
                    return;
                  }
                  if (!updateLead) {
                    console.warn('updateLead not available');
                    return;
                  }
                  if (!target.leadId) {
                    console.warn('No leadId for alert', alertId);
                    return;
                  }
                  await updateLead(target.leadId, { alertResolved: true, alertResolvedAt: new Date().toISOString() });
                  console.log('Alert resolved', alertId, target.leadId);
                } catch (e) {
                  console.error('resolve failed', e);
                }
              }}
            />
          ))
        )}
      </div>

      {showList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-4xl bg-card p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Leads em Risco — Lista completa</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowList(false)} className="px-3 py-1 bg-muted rounded">Fechar</button>
              </div>
            </div>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-sm table-auto">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Agendamento</th>
                    <th>Impacto</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsEmRisco.map((l: any) => (
                    <tr key={l.id} className="border-b">
                      <td className="py-2">{l.nome}</td>
                      <td>{l.telefone}</td>
                      <td>{l.dataAgendamento}</td>
                      <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((ticketAverage || 0))}</td>
                      <td className="py-2">
                        <button onClick={async () => { try { await updateLead?.(l.id, { alertAssigned: true, alertAssignedAt: new Date().toISOString() }); } catch(e){console.error(e)} }} className="mr-2 px-2 py-1 bg-amber-600 text-white rounded">Atribuir</button>
                        <button onClick={async () => { try { await updateLead?.(l.id, { alertResolved: true, alertResolvedAt: new Date().toISOString() }); } catch(e){console.error(e)} }} className="px-2 py-1 border rounded">Resolver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertsFeed;
