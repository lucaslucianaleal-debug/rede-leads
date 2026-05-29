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
  const color = alert.level === "high" ? "bg-rose-50 text-rose-700" : alert.level === "medium" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700";
  return (
    <div className={`p-3 rounded-lg border ${color} flex items-start justify-between`}>
      <div className="flex-1">
        <div className="text-xs font-semibold">{alert.title}</div>
        <div className="text-sm text-muted-foreground mt-1">{alert.reason}</div>
        <div className="text-xs text-muted-foreground mt-2">Impacto estimado: <span className="font-medium">{alert.impact ?? '—'}</span></div>
      </div>
      <div className="ml-4 flex flex-col gap-2">
        <button onClick={() => onAssign && onAssign(alert.id)} className="px-3 py-1 text-sm rounded bg-primary text-white">Atribuir</button>
        <button onClick={() => onResolve && onResolve(alert.id)} className="px-3 py-1 text-sm rounded border">Resolver</button>
      </div>
    </div>
  );
};

export default AlertItem;
