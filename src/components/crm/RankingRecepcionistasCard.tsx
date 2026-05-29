import React, { useMemo } from "react";
import { Lead } from "@/types/crm";

// Calcula métricas por recepcionista/captador
function calcularRanking(leads: Lead[]) {
  // Agrupa por captador
  const stats: Record<string, {
    nome: string;
    total: number;
    respondeu: number;
    agendou: number;
    compareceu: number;
    fechou: number;
    tempoTotal: number;
    respostas: number;
  }> = {};

  leads.forEach((lead) => {
    const nome = lead.captador || "(Sem responsável)";
    if (!stats[nome]) {
      stats[nome] = {
        nome,
        total: 0,
        respondeu: 0,
        agendou: 0,
        compareceu: 0,
        fechou: 0,
        tempoTotal: 0,
        respostas: 0,
      };
    }
    stats[nome].total++;
    if (lead.respostaLead === "RESPONDEU") stats[nome].respondeu++;
    if (lead.dataAgendamento) stats[nome].agendou++;
    if (lead.comparecimento === "COMPARECEU") stats[nome].compareceu++;
    if (lead.etapaLead === "Finalizado") stats[nome].fechou++;
    // Exemplo: tempo de resposta fictício (pode ser aprimorado se houver campo real)
    if (lead.dataCriacao && lead.dataContato) {
      // dd/MM/yyyy
      const [dcD, dcM, dcY] = lead.dataCriacao.split("/");
      const [dtD, dtM, dtY] = lead.dataContato.split("/");
      const criacao = new Date(`${dcY}-${dcM}-${dcD}T00:00:00`);
      const contato = new Date(`${dtY}-${dtM}-${dtD}T00:00:00`);
      const diff = (contato.getTime() - criacao.getTime()) / (1000 * 60); // minutos
      if (!isNaN(diff) && diff >= 0) {
        stats[nome].tempoTotal += diff;
        stats[nome].respostas++;
      }
    }
  });

  // Calcula métricas finais
  const ranking = Object.values(stats).map((s) => ({
    ...s,
    taxaResposta: s.total > 0 ? ((s.respondeu / s.total) * 100).toFixed(1) : "0.0",
    taxaAgendamento: s.total > 0 ? ((s.agendou / s.total) * 100).toFixed(1) : "0.0",
    taxaComparecimento: s.agendou > 0 ? ((s.compareceu / s.agendou) * 100).toFixed(1) : "0.0",
    taxaFechamento: s.agendou > 0 ? ((s.fechou / s.agendou) * 100).toFixed(1) : "0.0",
    tempoMedio: s.respostas > 0 ? (s.tempoTotal / s.respostas).toFixed(1) : "-",
  }));
  // Ordena por taxa de fechamento
  ranking.sort((a, b) => Number(b.taxaFechamento) - Number(a.taxaFechamento));
  return ranking;
}

export function RankingRecepcionistasCard({ leads }: { leads: Lead[] }) {
  const ranking = useMemo(() => calcularRanking(leads), [leads]);
  return (
    <div className="rounded-xl shadow bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 min-h-[180px] flex flex-col">
      <h3 className="font-bold text-lg mb-2 text-blue-700 dark:text-blue-400">Ranking de Recepcionistas</h3>
      <table className="w-full text-xs mt-2">
        <thead>
          <tr>
            <th className="text-left">Nome</th>
            <th>Resp.</th>
            <th>Agend.</th>
            <th>Comp.</th>
            <th>Fech.</th>
            <th>Resp. (%)</th>
            <th>Agend. (%)</th>
            <th>Comp. (%)</th>
            <th>Fech. (%)</th>
            <th>Tempo Médio (min)</th>
          </tr>
        </thead>
        <tbody>
          {ranking.slice(0, 5).map((r, i) => (
            <tr key={r.nome} className={i === 0 ? "font-bold bg-green-50" : ""}>
              <td>{r.nome}</td>
              <td>{r.respondeu}</td>
              <td>{r.agendou}</td>
              <td>{r.compareceu}</td>
              <td>{r.fechou}</td>
              <td>{r.taxaResposta}%</td>
              <td>{r.taxaAgendamento}%</td>
              <td>{r.taxaComparecimento}%</td>
              <td>{r.taxaFechamento}%</td>
              <td>{r.tempoMedio}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
