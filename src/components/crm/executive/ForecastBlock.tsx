import React from "react";

export const ForecastBlock: React.FC<{ leads: any[] }> = ({ leads }) => {
  // Simple placeholder: show counts as proxy for revenue until financial data exists
  const totalAgendados = leads.filter((l) => l.dataAgendamento).length;
  const totalCompareceram = leads.filter((l) => l.comparecimento === "COMPARECEU").length;
  const ticketAvg = totalCompareceram > 0 ? 120.0 : null; // placeholder
  const receitaPrevista = ticketAvg ? totalAgendados * ticketAvg : null;
  return (
    <div className="bg-card rounded-lg p-5 shadow-[0_10px_40px_rgba(16,24,40,0.06)]" style={{ minHeight: 200 }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Previsão de Faturamento</div>
          <div className="mt-2 text-3xl font-extrabold text-foreground">{receitaPrevista ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaPrevista) : 'R$ —'}</div>
          <div className="text-sm text-muted-foreground mt-1">Realizado vs Previsto • Cenários: pessimista / provável / otimista</div>
        </div>
        <div className="text-sm text-muted-foreground text-right">
          <div>Agendados: <span className="font-medium text-foreground">{totalAgendados}</span></div>
          <div>Compareceram: <span className="font-medium text-foreground">{totalCompareceram}</span></div>
          <div>Ticket médio: <span className="font-medium text-foreground">{ticketAvg ? `R$ ${ticketAvg.toFixed(2)}` : '—'}</span></div>
        </div>
      </div>

      <div className="mt-5 h-28 bg-gradient-to-b from-transparent to-slate-50 rounded-lg flex items-center justify-center text-sm text-muted-foreground">[Gráfico de previsão — banda de confiança e linhas de cenário]</div>
      <div className="mt-3 text-xs text-muted-foreground">Receita recuperável estimada e desperdício operacional são calculados a partir do ticket médio e taxa de comparecimento.</div>
    </div>
  );
};

export default ForecastBlock;
