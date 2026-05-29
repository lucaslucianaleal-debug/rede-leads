import React from "react";

export type AlertLevel = "low" | "medium" | "high";

export type Alert = {
  id: string;
  level: AlertLevel;
  title: string;
  reason: string;
  impact?: string; // e.g. R$ 1.200
  timestamp?: string;
};

export const AlertItem: React.FC<{ alert: Alert; onResolve?: (id: string) => void; onAssign?: (id: string) => void }> = ({ alert, onResolve, onAssign }) => {
  const severity = alert.level === "high" ? { dot: 'bg-rose-500', label: 'Alto' } : alert.level === 'medium' ? { dot: 'bg-amber-500', label: 'Médio' } : { dot: 'bg-emerald-500', label: 'Baixo' };
  return (
    <div className="p-3 rounded-lg bg-card border border-slate-200 flex items-start justify-between shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex-1">
        <div className="flex items-start gap-3">
          <span className={`w-3 h-3 rounded-full ${severity.dot} shadow-sm mt-1`} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">{alert.title}</div>
              <div className="text-xs text-muted-foreground">{alert.timestamp ?? ''}</div>
            </div>
            <div className="text-sm text-muted-foreground mt-1">{alert.reason}</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="text-xs text-muted-foreground">Impacto:</div>
              <div className="text-xs font-medium text-foreground">{alert.impact ?? '—'}</div>
              <div className="ml-4 text-xs text-muted-foreground">Prioridade: <span className="font-semibold">{severity.label}</span></div>
            </div>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`${severity.dot} h-2`} style={{ width: alert.level === 'high' ? '90%' : alert.level === 'medium' ? '60%' : '30%' }} />
            </div>
          </div>
        </div>
      </div>
      <div className="ml-4 flex flex-col gap-2">
        <button onClick={() => onAssign && onAssign(alert.id)} className="px-3 py-1 text-sm rounded bg-amber-600 text-white shadow">Atribuir</button>
        <button onClick={() => onResolve && onResolve(alert.id)} className="px-3 py-1 text-sm rounded border">Resolver</button>
      </div>
    </div>
  );
};

export default AlertItem;
