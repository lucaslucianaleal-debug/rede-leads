import React from "react";

export const PredictiveScoreCard: React.FC<{ leads: any[] }> = ({ leads }) => {
  // Simple predictive score: percent of leads with etapaLead including 'finalizado' or comparecimento
  const total = leads.length || 1;
  const positive = leads.filter((l) => l.comparecimento === "COMPARECEU" || (l.etapaLead || "").toLowerCase().includes("finalizado")).length;
  const score = Math.round((positive / total) * 100);
  return (
    <div className="bg-card rounded-lg p-4 flex flex-col items-center justify-center shadow-sm hover:shadow-md" style={{ minHeight: 180 }}>
      <div className="text-sm text-muted-foreground">Índice Preditivo de Conversão</div>
      <div className="mt-3 flex items-center gap-4">
        <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-emerald-100 to-emerald-50 flex items-center justify-center shadow-inner">
          <div className="text-3xl font-extrabold text-foreground">{score}</div>
        </div>
        <div className="text-left">
          <div className="text-sm font-semibold">Probabilidade média</div>
          <div className="text-xs text-muted-foreground mt-1">Heurístico inicial — exibe top 3 fatores explicativos</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">Recomendação: Priorizar leads com follow-up vencido e origem Online.</div>
    </div>
  );
};

export default PredictiveScoreCard;
