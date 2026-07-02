import React, { useState } from "react";
import { DentistPerformance } from "@/types/mpc";

type Props = { dentists: DentistPerformance[] };

function Sparkline({ data }: { data: number[] }) {
  const w = 168; const h = 44;
  if (!data || data.every(v => v === 0)) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <line x1="0" y1={h/2} x2={w} y2={h/2} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3,2"/>
      </svg>
    );
  }
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - (v / max) * (h - 2) - 1}`).join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  const lastVal = data[data.length - 1];
  const color = lastVal >= (max * 0.8) ? "#10B981" : lastVal >= (max * 0.4) ? "#F59E0B" : "#EF4444";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
      <polygon points={areaPoints} fill={color} fillOpacity={0.08} />
    </svg>
  );
}

function getTrendSummary(data: number[]) {
  if (!data || data.length < 8 || data.every((v) => v === 0)) {
    return { label: "sem dados", deltaPct: 0, color: "text-slate-400", current: 0, previous: 0 };
  }

  const windowSize = Math.min(30, Math.floor(data.length / 2));
  const previousWindow = data.slice(-(windowSize * 2), -windowSize);
  const currentWindow = data.slice(-windowSize);

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
  const firstAvg = avg(previousWindow);
  const secondAvg = avg(currentWindow);

  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
  const previousTotal = sum(previousWindow);
  const currentTotal = sum(currentWindow);

  const deltaPct = firstAvg > 0
    ? ((secondAvg - firstAvg) / firstAvg) * 100
    : secondAvg > 0 ? 100 : 0;

  if (deltaPct > 8) return { label: "crescente", deltaPct, color: "text-emerald-600", current: currentTotal, previous: previousTotal };
  if (deltaPct < -8) return { label: "em queda", deltaPct, color: "text-rose-600", current: currentTotal, previous: previousTotal };
  return { label: "estável", deltaPct, color: "text-amber-600", current: currentTotal, previous: previousTotal };
}

function StatusBadge({ status, todayAttended, dailyTarget }: { status: DentistPerformance["status"]; todayAttended: number; dailyTarget: number }) {
  if (status === "none") return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
      ⏳ Sem dados
    </span>
  );
  const pct = dailyTarget > 0 ? Math.round((todayAttended / dailyTarget) * 100) : 0;
  if (todayAttended === 0 && dailyTarget > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        📌 Sem atendimento hoje (0%)
      </span>
    );
  }
  const config = {
    ok:       { bg: "bg-emerald-50 border border-emerald-200", text: "text-emerald-700", label: `✅ Na meta (${pct}%)` },
    warning:  { bg: "bg-amber-50 border border-amber-200",    text: "text-amber-700",   label: `⚠️ Abaixo da meta (${pct}%)` },
    critical: { bg: "bg-rose-50 border border-rose-200",      text: "text-rose-700",    label: `🔴 Muito abaixo da meta (${pct}%)` },
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

function statusLabel(status?: string) {
  if (status === "attended") return "Atendido";
  if (status === "scheduled") return "Agendado";
  if (status === "confirmed") return "Confirmado";
  if (status === "budget") return "Orçamento";
  return "Sem status";
}

export default function MPCDentistPerformance({ dentists }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchByDentist, setSearchByDentist] = useState<Record<string, { attended: string; budget: string }>>({});

  const getSearch = (dentistId: string) =>
    searchByDentist[dentistId] || { attended: "", budget: "" };

  const updateSearch = (dentistId: string, field: "attended" | "budget", value: string) => {
    setSearchByDentist((prev) => ({
      ...prev,
      [dentistId]: {
        attended: prev[dentistId]?.attended || "",
        budget: prev[dentistId]?.budget || "",
        [field]: value,
      },
    }));
  };

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
          const isExpanded = expandedId === d.id;
          const trend = getTrendSummary(d.trend90d);
          const search = getSearch(d.id);

          const attendedQuery = search.attended.trim().toLowerCase();
          const budgetQuery = search.budget.trim().toLowerCase();

          const sortedAttended = [...d.attendedLeads].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          const sortedBudgets = [...d.budgetLeads].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

          const filteredAttended = attendedQuery
            ? sortedAttended.filter((lead) =>
                `${lead.name || ""} ${lead.date || ""} ${lead.phone || ""} ${statusLabel(lead.status)}`.toLowerCase().includes(attendedQuery)
              )
            : sortedAttended;

          const filteredBudgets = budgetQuery
            ? sortedBudgets.filter((lead) =>
                `${lead.name || ""} ${lead.date || ""} ${lead.phone || ""}`.toLowerCase().includes(budgetQuery)
              )
            : sortedBudgets;

          return (
            <div key={d.id} className="px-6 py-4">
              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === d.id ? null : d.id))}
                className="w-full text-left"
              >
              <div className="flex items-start justify-between gap-4">
                {/* Nome + especialidade */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900">{d.name}</span>
                    {d.specialty && <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{d.specialty}</span>}
                  </div>
                  <StatusBadge status={d.status} todayAttended={d.todayAttended} dailyTarget={d.dailyTarget} />
                  <p className="text-xs text-slate-500 mt-2">
                    Atend. Totais: <span className="font-semibold text-slate-700">{d.attendedLeads.length}</span>
                    {" · "}
                    Orçamentos: <span className="font-semibold text-slate-700">{d.budgetLeads.length}</span>
                    {" · "}
                    Ret./Fech.: <span className="font-semibold text-emerald-700">{d.convertedLeads.length}</span>
                  </p>
                </div>

                {/* Métricas */}
                <div className="flex items-center gap-5 text-right shrink-0">
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
                    <div className="text-xs text-slate-400">atend. totais</div>
                  </div>
                  {/* Mês */}
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">30 dias</div>
                    <div className="text-lg font-semibold text-slate-700">{d.monthAttended}</div>
                    <div className="text-xs text-slate-400">atend. totais</div>
                  </div>
                  {/* Conversão */}
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">Conversão</div>
                    <div className="text-lg font-semibold text-slate-700">{d.conversionRate}%</div>
                    <div className="text-xs text-slate-400">ret./fech. {d.convertedLeads.length}/{d.budgetLeads.length}</div>
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
                  <div className="flex flex-col items-end w-44">
                    <div className="text-xs text-slate-400 mb-1">Tendência 90d</div>
                    <Sparkline data={d.trend90d} />
                    <div className={`text-xs font-semibold mt-1 ${trend.color}`}>
                      {trend.label} ({trend.deltaPct >= 0 ? "+" : ""}{Math.round(trend.deltaPct)}%)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      30d atual ({trend.current}) vs 30d ant. ({trend.previous})
                    </div>
                    <div className="text-[11px] text-slate-400">
                      var. = (atual - anterior) / anterior
                    </div>
                  </div>
                </div>
              </div>
              </button>

              {/* Barra de progresso da meta diária */}
              <div className="mt-3">
                <ProgressBar value={d.todayAttended} max={d.dailyTarget} />
              </div>

              {isExpanded && (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Atendimentos Totais ({d.attendedLeads.length})
                    </p>
                    <input
                      type="text"
                      value={search.attended}
                      onChange={(e) => updateSearch(d.id, "attended", e.target.value)}
                      placeholder="Pesquisar lead por nome, telefone ou data"
                      className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-800 bg-white"
                    />
                    <p className="text-[11px] text-slate-400 mb-2">Ordenado por data mais recente</p>
                    {filteredAttended.length === 0 ? (
                      <p className="text-xs text-slate-500">Nenhum atendimento/agendamento registrado.</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5">
                        {filteredAttended.map((lead, idx) => (
                          <div key={`${lead.name}_${lead.date}_${idx}`} className="text-xs text-slate-700 border-b border-slate-200 pb-1">
                            <p className="font-medium text-slate-900">{lead.name}</p>
                            <p>
                              {lead.date || "sem data"} · {statusLabel(lead.status)}
                              {lead.phone ? ` · ${lead.phone}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Orçamentos ({d.budgetLeads.length})
                    </p>
                    <input
                      type="text"
                      value={search.budget}
                      onChange={(e) => updateSearch(d.id, "budget", e.target.value)}
                      placeholder="Pesquisar orçamento por nome, telefone ou data"
                      className="w-full mb-2 px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-800 bg-white"
                    />
                    <p className="text-[11px] text-slate-400 mb-2">Ordenado por data mais recente</p>
                    {filteredBudgets.length === 0 ? (
                      <p className="text-xs text-slate-500">Nenhum orçamento registrado.</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5">
                        {filteredBudgets.map((lead, idx) => (
                          <div key={`${lead.name}_${lead.date}_${idx}`} className="text-xs text-slate-700 border-b border-slate-200 pb-1">
                            <p className="font-medium text-slate-900">{lead.name}</p>
                            <p>{lead.date || "sem data"}{lead.phone ? ` · ${lead.phone}` : ""}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2">
                      Retornos e Fechamentos ({d.convertedLeads.length})
                    </p>
                    {d.convertedLeads.length === 0 ? (
                      <p className="text-xs text-emerald-700">Nenhum orçamento com retorno/fechamento ainda.</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5">
                        {d.convertedLeads.map((lead, idx) => (
                          <div key={`${lead.name}_${lead.budgetDate}_${lead.attendedDate}_${idx}`} className="text-xs text-emerald-900 border-b border-emerald-200 pb-1">
                            <p className="font-medium">{lead.name}</p>
                            <p>Orçamento: {lead.budgetDate || "-"} · Atendimento: {lead.attendedDate || "-"}</p>
                            {lead.phone && <p>{lead.phone}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex gap-4 text-xs text-slate-500">
        <span>✅ Na meta = ≥100% da meta diária</span>
        <span>⚠️ Abaixo da meta = 60–99%</span>
        <span>🔴 Muito abaixo = &lt;60%</span>
        <span>⏳ Sem dados = sem atendimentos registrados</span>
      </div>
    </div>
  );
}
