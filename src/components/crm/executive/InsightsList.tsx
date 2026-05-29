import React from "react";

export const InsightsList: React.FC<{ insights: { id: string; title: string; impact?: string; summary?: string }[] }> = ({ insights }) => {
  if (!insights || insights.length === 0) return <div className="bg-card p-4 rounded-lg text-muted-foreground">Nenhum insight no momento.</div>;
  return (
    <div className="grid grid-cols-1 gap-3">
      {insights.map((i) => (
        <div key={i.id} className="bg-card p-3 rounded-lg flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">{i.title}</div>
            <div className="text-xs text-muted-foreground mt-1">{i.summary}</div>
          </div>
          <div className="ml-4 text-right">
            <div className="text-sm">Impacto: <span className="font-medium">{i.impact ?? '—'}</span></div>
            <button className="mt-2 px-3 py-1 rounded bg-primary text-white">Ação</button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default InsightsList;
