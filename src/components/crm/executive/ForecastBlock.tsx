import React from "react";

export const ForecastBlock: React.FC<{ leads: any[] }> = ({ leads }) => {
  // Simple placeholder: show counts as proxy for revenue until financial data exists
  const totalAgendados = leads.filter((l) => l.dataAgendamento).length;
  const totalCompareceram = leads.filter((l) => l.comparecimento === "COMPARECEU").length;
  const ticketAvg = totalCompareceram > 0 ? (120.0).toFixed(2) : "—"; // placeholder
  return (
    <div className="bg-card rounded-lg p-4" style={{ minHeight: 160 }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Previsão de Faturamento</div>
          <div className="text-2xl font-semibold mt-1">R$ — (dados financeiros ausentes)</div>
        </div>
        <div className="text-sm text-muted-foreground text-right">
          <div>Agendados: <span className="font-medium">{totalAgendados}</span></div>
          <div>Compareceram: <span className="font-medium">{totalCompareceram}</span></div>
          <div>Ticket médio: <span className="font-medium">{ticketAvg}</span></div>
        </div>
      </div>
      <div className="mt-4 text-xs text-muted-foreground">Gráfico de forecast será integrado com fonte financeira — atualmente exibe proxy operacional.</div>
    </div>
  );
};

export default ForecastBlock;
