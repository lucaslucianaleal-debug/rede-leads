import React from "react";
import { DentistPerformance } from "@/types/mpc";
import { TrendingUp, TrendingDown } from "lucide-react";

type MPCDentistPerformanceProps = {
  dentists: DentistPerformance[];
};

function Sparkline({ data }: { data: number[] }) {
  const w = 60;
  const h = 20;
  if (!data || data.length === 0) return <svg width={w} height={h} />;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1, max - min);
  const step = w / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
      <polyline
        points={points}
        fill="none"
        stroke="#10B981"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: "ok" | "warning" | "critical" }) {
  const config = {
    ok: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    critical: "bg-rose-100 text-rose-800",
  };

  const labels = {
    ok: "OK",
    warning: "Aviso",
    critical: "Crítico",
  };

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${config[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function MPCDentistPerformance({ dentists }: MPCDentistPerformanceProps) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 overflow-x-auto">
      <h2 className="text-lg font-bold text-slate-900 mb-4">Performance por Dentista</h2>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Dentista
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Especialidade
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Meta / Realizado
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Conversão
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Satisfação
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Tendência 90d
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {dentists.map((dentist) => (
            <tr key={dentist.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className="px-4 py-4">
                <div className="font-semibold text-slate-900">{dentist.name}</div>
              </td>
              <td className="px-4 py-4 text-slate-600">{dentist.specialty}</td>
              <td className="px-4 py-4 text-right">
                <div className="font-semibold text-slate-900">
                  {dentist.dailyTarget} / {dentist.todayAttended}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {Math.round((dentist.todayAttended / dentist.dailyTarget) * 100)}%
                </div>
              </td>
              <td className="px-4 py-4 text-right">
                <div className="font-semibold text-slate-900">{Math.round(dentist.conversionRate)}%</div>
              </td>
              <td className="px-4 py-4 text-right">
                <div className="font-semibold text-slate-900">{dentist.satisfaction.toFixed(1)}/5</div>
              </td>
              <td className="px-4 py-4 text-center">
                <div className="flex justify-center">
                  <Sparkline data={dentist.trend90d} />
                </div>
              </td>
              <td className="px-4 py-4 text-center">
                <StatusBadge status={dentist.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 text-xs text-slate-600">
        <p>Última atualização: {new Date().toLocaleTimeString("pt-BR")}</p>
      </div>
    </div>
  );
}
