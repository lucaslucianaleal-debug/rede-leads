import React, { useMemo, useState } from "react";
import { MPCWeeklyReport as MPCWeeklyReportType } from "@/types/mpc";
import { MPCStore } from "@/hooks/useMPCDataStore";

type Props = {
  report: MPCWeeklyReportType;
  store: MPCStore;
};

type PeriodPreset = "7d" | "30d" | "month" | "custom";

function fmtBR(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

function toIsoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function getRangeFromPreset(preset: PeriodPreset, customStart: string, customEnd: string) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (preset === "custom" && customStart && customEnd) {
    const start = new Date(`${customStart}T00:00:00`);
    const customRangeEnd = new Date(`${customEnd}T23:59:59`);
    return { start, end: customRangeEnd };
  }

  if (preset === "30d") {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { start, end };
  }

  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function daysBetweenInclusive(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
}

function generateReportByRange(store: MPCStore, start: Date, end: Date): MPCWeeklyReportType {
  const days = daysBetweenInclusive(start, end);
  const prevEnd = new Date(start);
  prevEnd.setMilliseconds(-1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  prevStart.setHours(0, 0, 0, 0);

  const appointments = store.appointments || [];
  const budgets = store.budgets || [];
  const surveys = store.surveys || [];
  const dentists = store.dentists || [];

  const inRange = (dt: Date, a: Date, b: Date) => dt >= a && dt <= b;
  const normalize = (v: string) =>
    (v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const entityKey = (dentistId: string, patientId?: string, patientName?: string) => {
    if (patientId) return `${dentistId}::id::${patientId}`;
    return `${dentistId}::name::${normalize(patientName || "")}`;
  };

  const dayKey = (isoLike?: string) => String(isoLike || "").slice(0, 10);

  const attendedCurrent = appointments.filter((a: any) => {
    if (a.status !== "attended") return false;
    const dt = new Date(a.attendedAt || 0);
    return inRange(dt, start, end);
  });

  const budgetsCurrent = budgets.filter((b: any) => {
    const dt = new Date(b.budgetAt || 0);
    return inRange(dt, start, end);
  });

  const attendedPrev = appointments.filter((a: any) => {
    if (a.status !== "attended") return false;
    const dt = new Date(a.attendedAt || 0);
    return inRange(dt, prevStart, prevEnd);
  });

  const budgetsPrev = budgets.filter((b: any) => {
    const dt = new Date(b.budgetAt || 0);
    return inRange(dt, prevStart, prevEnd);
  });

  // Regra de negócio: orçamento também conta como atendimento.
  // Para não duplicar, dedup por dentista + paciente + dia.
  const clinicAttendanceSet = new Set<string>();
  attendedCurrent.forEach((a: any) => {
    clinicAttendanceSet.add(`${entityKey(a.dentistId, a.patientId, a.patientName)}::${dayKey(a.attendedAt)}`);
  });
  budgetsCurrent.forEach((b: any) => {
    clinicAttendanceSet.add(`${entityKey(b.dentistId, b.patientId, b.patientName)}::${dayKey(b.budgetAt)}`);
  });

  const clinicAttended = clinicAttendanceSet.size;
  const clinicBudgets = budgetsCurrent.length;
  const dailyCapacity = dentists.reduce((sum, d) => sum + (d.dailyTarget || 10), 0);
  const clinicCapacity = dailyCapacity * days;
  const clinicUtilization = clinicCapacity > 0 ? (clinicAttended / clinicCapacity) * 100 : 0;

  const lowOccupancyDays = Array.from({ length: days }, (_, idx) => {
    const d = new Date(start);
    d.setDate(start.getDate() + idx);
    const dateStr = toIsoDate(d);
    const daySet = new Set<string>();
    attendedCurrent
      .filter((a: any) => String(a.attendedAt || "").startsWith(dateStr))
      .forEach((a: any) => daySet.add(entityKey(a.dentistId, a.patientId, a.patientName)));
    budgetsCurrent
      .filter((b: any) => String(b.budgetAt || "").startsWith(dateStr))
      .forEach((b: any) => daySet.add(entityKey(b.dentistId, b.patientId, b.patientName)));
    const attended = daySet.size;
    return { date: dateStr, attended, capacity: dailyCapacity };
  }).filter((day) => day.capacity > 0 && day.attended < Math.ceil(day.capacity * 0.6));

  const conversionTarget = 85;
  const dentistSummaries = dentists.map((d: any) => {
    const dentistCurrent = appointments.filter((a: any) => {
      const dt = new Date(a.attendedAt || 0);
      return a.dentistId === d.id && inRange(dt, start, end);
    });
    const dentistPrevAttended = appointments.filter((a: any) => {
      const dt = new Date(a.attendedAt || 0);
      return a.dentistId === d.id && a.status === "attended" && inRange(dt, prevStart, prevEnd);
    }).length;

    const attendedOnly = dentistCurrent.filter((a: any) => a.status === "attended");
    const dentistBudgetsCurrent = budgetsCurrent.filter((b: any) => b.dentistId === d.id);

    const attendedSet = new Set<string>();
    attendedOnly.forEach((a: any) => {
      attendedSet.add(entityKey(d.id, a.patientId, a.patientName));
    });
    dentistBudgetsCurrent.forEach((b: any) => {
      attendedSet.add(entityKey(d.id, b.patientId, b.patientName));
    });

    const attended = attendedSet.size;
    const scheduledOrConfirmed = dentistCurrent.filter((a: any) => a.status === "scheduled" || a.status === "confirmed").length;
    const budgetSet = new Set<string>();
    dentistBudgetsCurrent.forEach((b: any) => {
      budgetSet.add(entityKey(d.id, b.patientId, b.patientName));
    });
    const convertedSet = new Set<string>();
    attendedOnly.forEach((a: any) => {
      const k = entityKey(d.id, a.patientId, a.patientName);
      if (budgetSet.has(k)) convertedSet.add(k);
    });

    const budgetCount = budgetSet.size;
    const convertedCount = convertedSet.size;
    const pendingBudgetCount = Math.max(0, budgetCount - convertedCount);
    const conversionRate = budgetCount > 0 ? (convertedCount / budgetCount) * 100 : 0;
    const target = (d.dailyTarget || 10) * days;

    const trend: "up" | "down" | "stable" =
      attended > dentistPrevAttended ? "up" : attended < dentistPrevAttended ? "down" : "stable";

    const dentistSurveys = surveys.filter((s: any) => {
      if (!s.leadId) return false;
      const sdt = new Date(s.createdAt || 0);
      if (!inRange(sdt, start, end)) return false;
      return attendedCurrent.some((a: any) => a.dentistId === d.id && a.patientId === s.leadId);
    });

    const satisfaction = dentistSurveys.length > 0
      ? dentistSurveys.reduce((acc: number, s: any) => acc + (s.score || 0), 0) / dentistSurveys.length
      : 0;

    return {
      dentistId: d.id,
      name: d.name,
      attended,
      target,
      deltaToTarget: attended - target,
      avgDaily: attended / days,
      trend,
      conversionRate: Math.round(conversionRate * 10) / 10,
      conversionTarget,
      conversionDelta: Math.round((conversionRate - conversionTarget) * 10) / 10,
      satisfaction: Math.round(satisfaction * 10) / 10,
      surveyCount: dentistSurveys.length,
      budgetCount,
      convertedCount,
      pendingBudgetCount,
    };
  });

  const receptionSurveys = surveys.filter((s: any) => {
    if (s.sector !== "reception") return false;
    const dt = new Date(s.createdAt || 0);
    return inRange(dt, start, end);
  });

  const receptionAvg = receptionSurveys.length > 0
    ? receptionSurveys.reduce((acc: number, s: any) => acc + (s.score || 0), 0) / receptionSurveys.length
    : 0;

  const receptionComplaints = receptionSurveys
    .filter((s: any) => (s.score || 0) <= 3 && s.comment)
    .map((s: any) => String(s.comment))
    .slice(0, 5);

  const outliers: string[] = [];
  dentistSummaries.forEach((d) => {
    if (d.deltaToTarget < 0) outliers.push(`${d.name} abaixo da meta de atendimentos (${d.attended}/${d.target}).`);
    if (d.conversionDelta < 0) outliers.push(`${d.name} com conversão abaixo da meta (${d.conversionRate}% vs ${d.conversionTarget}%).`);
    if (d.surveyCount > 0 && d.satisfaction < 4) outliers.push(`${d.name} com satisfação baixa (${d.satisfaction}/5).`);
  });
  if (receptionAvg > 0 && receptionAvg < 4) outliers.push(`Recepção abaixo do padrão (${Math.round(receptionAvg * 10) / 10}/5).`);

  const productivityWinner = [...dentistSummaries].sort((a, b) => b.attended - a.attended)[0];
  const conversionWinner = [...dentistSummaries].sort((a, b) => b.conversionRate - a.conversionRate)[0];
  const satisfactionWinner = [...dentistSummaries].filter((d) => d.surveyCount > 0).sort((a, b) => b.satisfaction - a.satisfaction)[0];

  const convCurrent = dentistSummaries.length > 0
    ? dentistSummaries.reduce((acc, d) => acc + d.conversionRate, 0) / dentistSummaries.length
    : 0;
  const convPrevByDentist = dentists.map((d: any) => {
    const dbPrev = budgetsPrev.filter((b: any) => b.dentistId === d.id);
    const daPrev = attendedPrev.filter((a: any) => a.dentistId === d.id);
    const bSet = new Set<string>();
    dbPrev.forEach((b: any) => bSet.add(entityKey(d.id, b.patientId, b.patientName)));
    const cSet = new Set<string>();
    daPrev.forEach((a: any) => {
      const k = entityKey(d.id, a.patientId, a.patientName);
      if (bSet.has(k)) cSet.add(k);
    });
    return bSet.size > 0 ? (cSet.size / bSet.size) * 100 : 0;
  });
  const convPrev = convPrevByDentist.length > 0
    ? convPrevByDentist.reduce((acc, v) => acc + v, 0) / convPrevByDentist.length
    : 0;

  const satCurrentBase = surveys.filter((s: any) => inRange(new Date(s.createdAt || 0), start, end));
  const satPrevBase = surveys.filter((s: any) => inRange(new Date(s.createdAt || 0), prevStart, prevEnd));
  const satCurrent = satCurrentBase.length > 0 ? satCurrentBase.reduce((acc: number, s: any) => acc + (s.score || 0), 0) / satCurrentBase.length : 0;
  const satPrev = satPrevBase.length > 0 ? satPrevBase.reduce((acc: number, s: any) => acc + (s.score || 0), 0) / satPrevBase.length : 0;

  const concerningTrends: string[] = [];
  if (attendedPrev.length > 0 && clinicAttended < attendedPrev.length) {
    concerningTrends.push(`Produtividade caiu de ${attendedPrev.length} para ${clinicAttended} atendimentos no período.`);
  }
  if (convPrev > 0 && convCurrent < convPrev) {
    concerningTrends.push(`Conversão caiu de ${Math.round(convPrev)}% para ${Math.round(convCurrent)}%.`);
  }
  if (satPrev > 0 && satCurrent < satPrev) {
    concerningTrends.push(`Satisfação média caiu de ${satPrev.toFixed(1)} para ${satCurrent.toFixed(1)}.`);
  }

  const managementActions: string[] = [];
  dentistSummaries.filter((d) => d.deltaToTarget < 0).slice(0, 2).forEach((d) => {
    managementActions.push(`Reavaliar agenda de ${d.name}, abaixo da meta de atendimentos.`);
  });
  dentistSummaries.filter((d) => d.conversionDelta < 0).slice(0, 2).forEach((d) => {
    managementActions.push(`Acompanhar conversão de ${d.name}, abaixo da meta no período.`);
  });
  if (receptionAvg > 0 && receptionAvg < 4) {
    managementActions.push("Revisar processo de recepção e reforçar padrão de acolhimento.");
  }
  if (satisfactionWinner) {
    managementActions.push(`Manter e replicar as práticas de ${satisfactionWinner.name}, destaque em satisfação.`);
  }

  const allBudgetSet = new Set<string>();
  budgetsCurrent.forEach((b: any) => allBudgetSet.add(entityKey(b.dentistId, b.patientId, b.patientName)));
  const allConvertedSet = new Set<string>();
  attendedCurrent.forEach((a: any) => {
    const k = entityKey(a.dentistId, a.patientId, a.patientName);
    if (allBudgetSet.has(k)) allConvertedSet.add(k);
  });
  const pendingBudgetPatients = budgetsCurrent
    .filter((b: any) => !allConvertedSet.has(entityKey(b.dentistId, b.patientId, b.patientName)))
    .map((b: any) => String(b.patientName || ""))
    .filter(Boolean)
    .slice(0, 20);
  const clinicConverted = allConvertedSet.size;
  const clinicPendingBudgets = Math.max(0, allBudgetSet.size - allConvertedSet.size);
  const budgetConversionRate = allBudgetSet.size > 0 ? (allConvertedSet.size / allBudgetSet.size) * 100 : 0;

  return {
    periodLabel: `${fmtBR(start)} a ${fmtBR(end)}`,
    clinicAttended,
    clinicBudgets,
    clinicConverted,
    clinicPendingBudgets,
    budgetConversionRate: Math.round(budgetConversionRate * 10) / 10,
    clinicCapacity,
    clinicUtilization: Math.round(clinicUtilization * 10) / 10,
    lowOccupancyDays,
    dentistSummaries,
    pendingBudgetPatients,
    receptionAvg: Math.round(receptionAvg * 10) / 10,
    receptionComplaints,
    outliers,
    topPerformers: {
      productivity: productivityWinner ? `${productivityWinner.name} (${productivityWinner.attended} atendimentos)` : undefined,
      conversion: conversionWinner ? `${conversionWinner.name} (${conversionWinner.conversionRate}%)` : undefined,
      satisfaction: satisfactionWinner ? `${satisfactionWinner.name} (${satisfactionWinner.satisfaction}/5)` : undefined,
    },
    concerningTrends,
    managementActions,
  };
}

function downloadTextReport(report: MPCWeeklyReportType) {
  const lines: string[] = [];
  lines.push("RELATORIO MPC");
  lines.push(`Periodo: ${report.periodLabel}`);
  lines.push("");
  lines.push("1) Capacidade da clinica");
  lines.push(`- Atendidos: ${report.clinicAttended}`);
  lines.push(`- Orcamentos: ${report.clinicBudgets ?? 0}`);
  lines.push(`- Convertidos (orcamento -> atendimento): ${report.clinicConverted ?? 0}`);
  lines.push(`- Conversao de orcamentos: ${Math.round(report.budgetConversionRate ?? 0)}%`);
  lines.push(`- Capacidade: ${report.clinicCapacity}`);
  lines.push(`- Utilizacao: ${Math.round(report.clinicUtilization)}%`);
  lines.push(`- Dias de baixa ocupacao: ${report.lowOccupancyDays.length}`);
  lines.push("");
  lines.push("2/3) Volume e conversao por dentista");
  report.dentistSummaries.forEach((d) => {
    lines.push(`- ${d.name}: atendidos=${d.attended}, meta=${d.target}, orcamentos=${d.budgetCount ?? 0}, convertidos=${d.convertedCount ?? 0}, conversao=${d.conversionRate}%`);
  });
  lines.push("");
  lines.push("4/5) Satisfacao e recepcao");
  lines.push(`- Recepcao media: ${report.receptionAvg}/5`);
  lines.push(`- Reclamações recepcao: ${report.receptionComplaints.length}`);
  report.receptionComplaints.forEach((c) => lines.push(`  * ${c}`));
  lines.push("");
  lines.push("6) Fora do padrao");
  (report.outliers.length ? report.outliers : ["Sem desvios criticos"]).forEach((x) => lines.push(`- ${x}`));
  lines.push("");
  lines.push("7) Melhores da semana");
  lines.push(`- Produtividade: ${report.topPerformers.productivity || "N/A"}`);
  lines.push(`- Conversao: ${report.topPerformers.conversion || "N/A"}`);
  lines.push(`- Satisfacao: ${report.topPerformers.satisfaction || "N/A"}`);
  lines.push("");
  lines.push("8) Tendencias preocupantes");
  (report.concerningTrends.length ? report.concerningTrends : ["Sem tendencia preocupante"]).forEach((x) => lines.push(`- ${x}`));
  lines.push("");
  lines.push("9) Acoes da gestao");
  (report.managementActions.length ? report.managementActions : ["Sem acao urgente no periodo"]).forEach((x) => lines.push(`- ${x}`));
  lines.push("");
  lines.push("Pendentes de conversao (amostra)");
  (report.pendingBudgetPatients && report.pendingBudgetPatients.length > 0 ? report.pendingBudgetPatients : ["Sem pendencias relevantes"]).forEach((x) => lines.push(`- ${x}`));

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-mpc-${report.periodLabel.replace(/\s+/g, "-").replace(/\//g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function MPCWeeklyReport({ report, store }: Props) {
  const [preset, setPreset] = useState<PeriodPreset>("7d");
  const todayIso = toIsoDate(new Date());
  const [customStart, setCustomStart] = useState(todayIso);
  const [customEnd, setCustomEnd] = useState(todayIso);

  const { start, end } = useMemo(
    () => getRangeFromPreset(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const filteredReport = useMemo(() => {
    if (preset === "7d" && !store?.appointments?.length && !store?.dentists?.length) {
      return report;
    }
    return generateReportByRange(store, start, end);
  }, [store, start, end, report, preset]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Relatório Semanal MPC</h2>
          <p className="text-sm text-slate-500">Período: {filteredReport.periodLabel}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Uso de Capacidade</p>
            <p className="text-2xl font-bold text-slate-900">{Math.round(filteredReport.clinicUtilization)}%</p>
          </div>
          <button
            type="button"
            onClick={() => downloadTextReport(filteredReport)}
            className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            Exportar relatório
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Período</label>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="month">Mês atual</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>

        {preset === "custom" && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data inicial</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data final</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </>
        )}
      </div>

      <div className="space-y-6 text-sm text-slate-700">
        <section>
          <h3 className="font-semibold text-slate-900 mb-2">1. A clínica operou dentro da capacidade esperada?</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Pacientes atendidos no período: <strong>{filteredReport.clinicAttended}</strong></li>
            <li>Orçamentos no período: <strong>{filteredReport.clinicBudgets ?? 0}</strong></li>
            <li>Convertidos (orçamento → atendimento): <strong>{filteredReport.clinicConverted ?? 0}</strong></li>
            <li>Taxa de conversão dos orçamentos: <strong>{Math.round(filteredReport.budgetConversionRate ?? 0)}%</strong></li>
            <li>Capacidade estimada no período: <strong>{filteredReport.clinicCapacity}</strong></li>
            <li>Utilização da capacidade: <strong>{Math.round(filteredReport.clinicUtilization)}%</strong></li>
            <li>Ociosidade: <strong>{filteredReport.clinicUtilization < 80 ? "Sim, há margem ociosa" : "Baixa ociosidade"}</strong></li>
            <li>Dias de baixa ocupação: <strong>{filteredReport.lowOccupancyDays.length}</strong></li>
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
                  <th className="text-left px-3 py-2">Orçamentos</th>
                  <th className="text-left px-3 py-2">Convertidos</th>
                  <th className="text-left px-3 py-2">Conversão</th>
                  <th className="text-left px-3 py-2">Meta conv.</th>
                </tr>
              </thead>
              <tbody>
                {filteredReport.dentistSummaries.map((d) => (
                  <tr key={d.dentistId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{d.name}</td>
                    <td className="px-3 py-2">{d.attended}</td>
                    <td className="px-3 py-2">{d.target}</td>
                    <td className="px-3 py-2">{d.avgDaily.toFixed(1)}</td>
                    <td className="px-3 py-2">
                      {d.trend === "up" ? "Crescimento" : d.trend === "down" ? "Queda" : "Estável"}
                    </td>
                    <td className="px-3 py-2">{d.budgetCount ?? 0}</td>
                    <td className="px-3 py-2">{d.convertedCount ?? 0}</td>
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
            <li>Recepção: nota média <strong>{filteredReport.receptionAvg || 0}/5</strong></li>
            <li>Reclamações registradas na recepção: <strong>{filteredReport.receptionComplaints.length}</strong></li>
            <li>
              Principais comentários:
              {filteredReport.receptionComplaints.length === 0 ? " sem reclamações relevantes." : ""}
            </li>
          </ul>
          {filteredReport.receptionComplaints.length > 0 && (
            <ul className="list-disc pl-10 mt-2 space-y-1">
              {filteredReport.receptionComplaints.map((c, i) => (
                <li key={`${i}_${c.slice(0, 12)}`}>{c}</li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">6. Profissionais fora do padrão</h3>
          {filteredReport.outliers.length === 0 ? (
            <p className="text-emerald-700">Nenhum desvio crítico detectado nesta semana.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {filteredReport.outliers.map((item, idx) => (
                <li key={`${idx}_${item.slice(0, 12)}`}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">7. Melhor desempenho da semana</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Maior produtividade: <strong>{filteredReport.topPerformers.productivity || "N/A"}</strong></li>
            <li>Maior conversão: <strong>{filteredReport.topPerformers.conversion || "N/A"}</strong></li>
            <li>Melhor satisfação: <strong>{filteredReport.topPerformers.satisfaction || "N/A"}</strong></li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">8. Tendências preocupantes</h3>
          {filteredReport.concerningTrends.length === 0 ? (
            <p className="text-emerald-700">Sem tendência preocupante relevante no período.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {filteredReport.concerningTrends.map((item, idx) => (
                <li key={`${idx}_${item.slice(0, 12)}`}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">Orçamentos pendentes de conversão</h3>
          {filteredReport.pendingBudgetPatients && filteredReport.pendingBudgetPatients.length > 0 ? (
            <ul className="list-disc pl-5 space-y-1">
              {filteredReport.pendingBudgetPatients.map((name, idx) => (
                <li key={`${idx}_${name.slice(0, 12)}`}>{name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-emerald-700">Sem pendências relevantes no período.</p>
          )}
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-2">9. Ações recomendadas para gestão</h3>
          {filteredReport.managementActions.length === 0 ? (
            <p className="text-slate-600">Sem ação corretiva urgente no momento.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {filteredReport.managementActions.map((item, idx) => (
                <li key={`${idx}_${item.slice(0, 12)}`}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
