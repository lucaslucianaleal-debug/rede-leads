import React from "react";

export const PredictiveScoreCard: React.FC<{ leads: any[] }> = ({ leads }) => {
  // Simple predictive score: percent of leads with etapaLead including 'finalizado' or comparecimento
  const total = leads.length || 1;
  const positive = leads.filter((l) => l.comparecimento === "COMPARECEU" || (l.etapaLead || "").toLowerCase().includes("finalizado")).length;
  const score = Math.round((positive / total) * 100);
  return (
    <div className="bg-card rounded-lg p-4 flex flex-col items-center justify-center" style={{ minHeight: 160 }}>
      <div className="text-sm text-muted-foreground">Índice Preditivo de Conversão</div>
      <div className="text-4xl font-bold mt-2 text-foreground">{score}</div>
      <div className="text-xs text-muted-foreground mt-2">Probabilidade média de conversão (%) — heurístico inicial</div>
    </div>
  );
};

export default PredictiveScoreCard;
