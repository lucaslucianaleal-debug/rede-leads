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
    <div className="p-3 rounded-lg bg-white/60 backdrop-blur-sm border border-slate-200 flex items-start justify-between shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${severity.dot} shadow-sm`} />
          <div className="text-sm font-semibold text-foreground">{severity.label} • {alert.title}</div>
        </div>
        <div className="text-sm text-muted-foreground mt-2">{alert.reason}</div>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <div>Impacto estimado: <span className="font-medium text-foreground">{alert.impact ?? '—'}</span></div>
          <div>Urgência: <span className="font-medium">{alert.timestamp ? 'Alta' : 'Média'}</span></div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Recomendação: <span className="font-medium text-foreground">Entre em contato nas próximas 2h e confirme agendamento</span></div>
      </div>
      <div className="ml-4 flex flex-col gap-2">
        <button onClick={() => onAssign && onAssign(alert.id)} className="px-3 py-1 text-sm rounded bg-primary text-white shadow">Atribuir</button>
        <button onClick={() => onResolve && onResolve(alert.id)} className="px-3 py-1 text-sm rounded border">Resolver</button>
      </div>
    </div>
  );
};

export default AlertItem;
