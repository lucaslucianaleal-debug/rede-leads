import React from "react";
import { MPCWeeklyReport } from "@/types/mpc";

type Props = {
  report: MPCWeeklyReport;
};

export default function MPCWeeklyReport({ report }: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Relatório Semanal MPC</h2>
          <p className="text-sm text-slate-500">Período: {report.periodLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Uso de Capacidade</p>
          <p className="text-2xl font-bold text-slate-900">{Math.round(report.clinicUtilization)}%</p>
        </div>
      </div>

      <div className="space-y-6 text-sm text-slate-700">
        <section>
          <h3 className="font-semibold text-slate-900 mb-2">1. A clínica operou dentro da capacidade esperada?</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Pacientes atendidos na semana: <strong>{report.clinicAttended}</strong></li>
            <li>Capacidade semanal estimada: <strong>{report.clinicCapacity}</strong></li>
            <li>Utilização da capacidade: <strong>{Math.round(report.clinicUtilization)}%</strong></li>
            <li>Ociosidade: <strong>{report.clinicUtilization < 80 ? "Sim, há margem ociosa" : "Baixa ociosidade"}</strong></li>
            <li>Dias de baixa ocupação: <strong>{report.lowOccupancyDays.length}</strong></li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">2 e 3. Volume e conversão por dentista</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-slate-200 rounded-lg text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">Dentista</th>
                  <th className="text-left px-3 py-2">Atendidos</th>
                  <th className="text-left px-3 py-2">Meta</th>
                  <th className="text-left px-3 py-2">Média diária</th>
                  <th className="text-left px-3 py-2">Tendência</th>
                  <th className="text-left px-3 py-2">Conversão</th>
                  <th className="text-left px-3 py-2">Meta conv.</th>
                </tr>
              </thead>
              <tbody>
                {report.dentistSummaries.map((d) => (
                  <tr key={d.dentistId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{d.name}</td>
                    <td className="px-3 py-2">{d.attended}</td>
                    <td className="px-3 py-2">{d.target}</td>
                    <td className="px-3 py-2">{d.avgDaily.toFixed(1)}</td>
                    <td className="px-3 py-2">
                      {d.trend === "up" ? "Crescimento" : d.trend === "down" ? "Queda" : "Estável"}
                    </td>
                    <td className="px-3 py-2">{d.conversionRate}%</td>
                    <td className="px-3 py-2">{d.conversionTarget}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">4 e 5. Satisfação por profissional e recepção</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Recepção: nota média <strong>{report.receptionAvg || 0}/5</strong></li>
            <li>Reclamações registradas na recepção: <strong>{report.receptionComplaints.length}</strong></li>
            <li>
              Principais comentários:
              {report.receptionComplaints.length === 0 ? " sem reclamações relevantes." : ""}
            </li>
          </ul>
          {report.receptionComplaints.length > 0 && (
            <ul className="list-disc pl-10 mt-2 space-y-1">
              {report.receptionComplaints.map((c, i) => (
                <li key={`${i}_${c.slice(0, 12)}`}>{c}</li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">6. Profissionais fora do padrão</h3>
          {report.outliers.length === 0 ? (
            <p className="text-emerald-700">Nenhum desvio crítico detectado nesta semana.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {report.outliers.map((item, idx) => (
                <li key={`${idx}_${item.slice(0, 12)}`}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">7. Melhor desempenho da semana</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Maior produtividade: <strong>{report.topPerformers.productivity || "N/A"}</strong></li>
            <li>Maior conversão: <strong>{report.topPerformers.conversion || "N/A"}</strong></li>
            <li>Melhor satisfação: <strong>{report.topPerformers.satisfaction || "N/A"}</strong></li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">8. Tendências preocupantes</h3>
          {report.concerningTrends.length === 0 ? (
            <p className="text-emerald-700">Sem tendência preocupante relevante no período.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {report.concerningTrends.map((item, idx) => (
                <li key={`${idx}_${item.slice(0, 12)}`}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">9. Ações recomendadas para gestão</h3>
          {report.managementActions.length === 0 ? (
            <p className="text-slate-600">Sem ação corretiva urgente no momento.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {report.managementActions.map((item, idx) => (
                <li key={`${idx}_${item.slice(0, 12)}`}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
