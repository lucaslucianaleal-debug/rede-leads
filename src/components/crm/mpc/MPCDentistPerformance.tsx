import React from "react";
import { DentistPerformance } from "@/types/mpc";

type Props = { dentists: DentistPerformance[] };

function Sparkline({ data }: { data: number[] }) {
  const w = 80; const h = 24;
  if (!data || data.every(v => v === 0)) {
    return <svg width={w} height={h}><line x1="0" y1={h/2} x2={w} y2={h/2} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3,2"/></svg>;
  }
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - (v / max) * (h - 2) - 1}`).join(" ");
  const lastVal = data[data.length - 1];
  const color = lastVal >= (max * 0.8) ? "#10B981" : lastVal >= (max * 0.4) ? "#F59E0B" : "#EF4444";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function StatusBadge({ status, todayAttended, dailyTarget }: { status: DentistPerformance["status"]; todayAttended: number; dailyTarget: number }) {
  if (status === "none") return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
      ⏳ Sem dados
    </span>
  );
  const pct = dailyTarget > 0 ? Math.round((todayAttended / dailyTarget) * 100) : 0;
  const config = {
    ok:       { bg: "bg-emerald-50 border border-emerald-200", text: "text-emerald-700", label: `✅ Na meta (${pct}%)` },
    warning:  { bg: "bg-amber-50 border border-amber-200",    text: "text-amber-700",   label: `⚠️ Abaixo (${pct}%)` },
    critical: { bg: "bg-rose-50 border border-rose-200",      text: "text-rose-700",    label: `🔴 Crítico (${pct}%)` },
  };
  const c = config[status];
  return <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>{c.label}</span>;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

export default function MPCDentistPerformance({ dentists }: Props) {
  if (dentists.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-4xl mb-3">👨‍⚕️</p>
        <p className="font-semibold text-slate-700 mb-1">Nenhum dentista cadastrado</p>
        <p className="text-sm text-slate-500">Use o botão <strong>"Dentista"</strong> acima para cadastrar e definir a meta diária</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">Performance por Dentista</h2>
        <span className="text-xs text-slate-400">Atualizado: {new Date().toLocaleTimeString("pt-BR")}</span>
      </div>

      {/* Cards por dentista */}
      <div className="divide-y divide-slate-100">
        {dentists.map((d) => {
          const pctToday = d.dailyTarget > 0 ? (d.todayAttended / d.dailyTarget) * 100 : 0;
          return (
            <div key={d.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                {/* Nome + especialidade */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900">{d.name}</span>
                    {d.specialty && <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{d.specialty}</span>}
                  </div>
                  <StatusBadge status={d.status} todayAttended={d.todayAttended} dailyTarget={d.dailyTarget} />
                </div>

                {/* Métricas */}
                <div className="flex items-center gap-6 text-right shrink-0">
                  {/* Hoje */}
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">Hoje</div>
                    <div className={`text-xl font-bold ${d.todayAttended >= d.dailyTarget ? "text-emerald-600" : "text-slate-900"}`}>
                      {d.todayAttended}
                      <span className="text-sm text-slate-400 font-normal">/{d.dailyTarget}</span>
                    </div>
                    <div className="text-xs text-slate-400">meta/dia</div>
                  </div>
                  {/* Semana */}
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">7 dias</div>
                    <div className="text-lg font-semibold text-slate-700">{d.weekAttended}</div>
                    <div className="text-xs text-slate-400">atendidos</div>
                  </div>
                  {/* Mês */}
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">30 dias</div>
                    <div className="text-lg font-semibold text-slate-700">{d.monthAttended}</div>
                    <div className="text-xs text-slate-400">atendidos</div>
                  </div>
                  {/* Satisfação */}
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">Satisfação</div>
                    <div className="text-lg font-semibold text-slate-700">
                      {d.satisfaction > 0 ? `${d.satisfaction}/5` : <span className="text-slate-300 text-sm">—</span>}
                    </div>
                    <div className="text-xs text-slate-400">média</div>
                  </div>
                  {/* Tendência */}
                  <div className="flex flex-col items-center">
                    <div className="text-xs text-slate-400 mb-1">Tendência 90d</div>
                    <Sparkline data={d.trend90d} />
                  </div>
                </div>
              </div>

              {/* Barra de progresso da meta diária */}
              <div className="mt-3">
                <ProgressBar value={d.todayAttended} max={d.dailyTarget} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex gap-4 text-xs text-slate-500">
        <span>✅ Na meta = ≥100% da meta diária</span>
        <span>⚠️ Abaixo = 60–99%</span>
        <span>🔴 Crítico = &lt;60%</span>
        <span>⏳ Sem dados = sem atendimentos registrados</span>
      </div>
    </div>
  );
}
