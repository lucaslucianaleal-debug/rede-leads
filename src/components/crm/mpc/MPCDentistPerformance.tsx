import React, { useMemo, useState } from "react";
import { DentistPerformance } from "@/types/mpc";
import { MPCStore } from "@/hooks/useMPCDataStore";
import { useLeads } from "@/hooks/useLeads";

type Props = {
  dentists: DentistPerformance[];
  store: MPCStore;
  mutations: {
    setStore: (s: MPCStore | ((prev: MPCStore) => MPCStore)) => void;
    saveNow: (nextStore?: MPCStore) => Promise<void>;
  };
};

function parseDateToISO(dateRaw: string) {
  const input = dateRaw.trim();
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const dt = new Date(`${input}T12:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

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

function StatusBadge({ status, todayAttended, dailyTarget, isWorkingToday }: { status: DentistPerformance["status"]; todayAttended: number; dailyTarget: number; isWorkingToday?: boolean }) {
  if (isWorkingToday === false) return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
      🗓️ Folga hoje
    </span>
  );
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

function formatWorkDays(workDays?: number[]) {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const days = Array.isArray(workDays) && workDays.length > 0 ? workDays : [1, 2, 3, 4, 5, 6];
  return days.map((d) => labels[d] || "?").join(", ");
}

export default function MPCDentistPerformance({ dentists, store, mutations }: Props) {
  const { allLeads } = useLeads();
  const crmById = useMemo(() => {
    const map = new Map<string, { nome?: string; telefone?: string }>();
    allLeads.forEach((l: any) => {
      if (l?.id) map.set(l.id, { nome: l.nome, telefone: l.telefone });
    });
    return map;
  }, [allLeads]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchByDentist, setSearchByDentist] = useState<Record<string, { attended: string; budget: string; converted: string }>>({});
  const [editingLead, setEditingLead] = useState<null | {
    dentistId: string;
    sourceType: "appointment" | "budget";
    recordId: string;
    patientId?: string;
    name: string;
    phone?: string;
    date: string;
    status?: string;
    saleValue?: number;
    saleProcedure?: string;
    attendedBy?: string;
    crmQuery: string;
  }>(null);
  const [scheduleEditingId, setScheduleEditingId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<number[]>([1, 2, 3, 4, 5, 6]);

  const normalizeWorkDays = (days: any) => {
    const arr = Array.isArray(days) ? days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    const unique = Array.from(new Set(arr)).sort((a, b) => a - b);
    return unique.length > 0 ? unique : [1, 2, 3, 4, 5, 6];
  };

  const weekdayOptions = [
    { value: 1, label: "Seg" },
    { value: 2, label: "Ter" },
    { value: 3, label: "Qua" },
    { value: 4, label: "Qui" },
    { value: 5, label: "Sex" },
    { value: 6, label: "Sáb" },
    { value: 0, label: "Dom" },
  ];

  const crmMatches = useMemo(() => {
    if (!editingLead?.crmQuery.trim()) return [];
    const q = editingLead.crmQuery.toLowerCase();
    return allLeads
      .filter((l) => (l.nome || "").toLowerCase().includes(q) || (l.telefone || "").includes(q))
      .slice(0, 8);
  }, [editingLead?.crmQuery, allLeads]);

  const getSyncedIdentity = (patientId?: string, fallbackName?: string, fallbackPhone?: string) => {
    const crmLead = patientId ? crmById.get(patientId) : undefined;
    if (crmLead) {
      return {
        name: fallbackName || "Sem nome",
        crmName: crmLead.nome || undefined,
        phone: crmLead.telefone || fallbackPhone,
        synced: true,
      };
    }
    return {
      name: fallbackName || "Sem nome",
      crmName: undefined,
      phone: fallbackPhone,
      synced: false,
    };
  };

  const getSearch = (dentistId: string) =>
    searchByDentist[dentistId] || { attended: "", budget: "", converted: "" };

  const updateSearch = (dentistId: string, field: "attended" | "budget" | "converted", value: string) => {
    setSearchByDentist((prev) => ({
      ...prev,
      [dentistId]: {
        attended: prev[dentistId]?.attended || "",
        budget: prev[dentistId]?.budget || "",
        converted: prev[dentistId]?.converted || "",
        [field]: value,
      },
    }));
  };

  const openEditLead = (dentistId: string, lead: any) => {
    if (!lead?.id || !lead?.sourceType) return;
    setEditingLead({
      dentistId,
      sourceType: lead.sourceType,
      recordId: lead.id,
      patientId: lead.patientId,
      name: lead.name || "",
      phone: lead.phone || "",
      date: lead.date || "",
      status: lead.status,
      saleValue: typeof lead.saleValue === "number" ? lead.saleValue : undefined,
      saleProcedure: lead.saleProcedure || "",
      attendedBy: lead.attendedBy || "",
      crmQuery: "",
    });
  };

  const applyLeadSync = (lead: any) => {
    setEditingLead((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        patientId: lead.id,
        phone: prev.phone || lead.telefone || prev.phone,
        crmQuery: "",
      };
    });
  };

  const saveEditedLead = async () => {
    if (!editingLead) return;
    const isoDate = parseDateToISO(editingLead.date) || undefined;
    let nextStoreSnapshot: MPCStore | null = null;

    mutations.setStore((prev) => {
      if (editingLead.sourceType === "appointment") {
        const appointments = prev.appointments.map((a: any) => {
          if (a.id !== editingLead.recordId) return a;
          return {
            ...a,
            patientId: editingLead.patientId || undefined,
            patientName: editingLead.name,
            patientPhone: editingLead.phone || undefined,
            attendedAt: isoDate || a.attendedAt,
            status: editingLead.status === "scheduled" || editingLead.status === "confirmed" || editingLead.status === "attended" ? editingLead.status : a.status,
            saleValue: typeof editingLead.saleValue === "number" ? editingLead.saleValue : undefined,
            saleProcedure: editingLead.saleProcedure || undefined,
            attendedBy: editingLead.attendedBy || a.attendedBy,
          };
        });
        nextStoreSnapshot = { ...prev, appointments };
        return nextStoreSnapshot;
      }

      const budgets = (prev.budgets || []).map((b: any) => {
        if (b.id !== editingLead.recordId) return b;
        return {
          ...b,
          patientId: editingLead.patientId || undefined,
          patientName: editingLead.name,
          patientPhone: editingLead.phone || undefined,
          budgetAt: isoDate || b.budgetAt,
          saleValue: typeof editingLead.saleValue === "number" ? editingLead.saleValue : undefined,
          saleProcedure: editingLead.saleProcedure || undefined,
        };
      });
      nextStoreSnapshot = { ...prev, budgets };
      return nextStoreSnapshot;
    });

    if (nextStoreSnapshot) await mutations.saveNow(nextStoreSnapshot);
    setEditingLead(null);
  };

  const startEditSchedule = (dentistId: string, workDays?: number[]) => {
    setScheduleEditingId(dentistId);
    setScheduleDraft(normalizeWorkDays(workDays));
  };

  const toggleScheduleDay = (day: number) => {
    setScheduleDraft((prev) => {
      const exists = prev.includes(day);
      const next = exists ? prev.filter((d) => d !== day) : [...prev, day];
      return next.sort((a, b) => a - b);
    });
  };

  const saveSchedule = async (dentistId: string) => {
    const nextDays = normalizeWorkDays(scheduleDraft);
    let nextStoreSnapshot: MPCStore | null = null;
    mutations.setStore((prev) => {
      const dentistsNext = (prev.dentists || []).map((d: any) => d.id === dentistId ? { ...d, workDays: nextDays } : d);
      nextStoreSnapshot = { ...prev, dentists: dentistsNext };
      return nextStoreSnapshot;
    });
    if (nextStoreSnapshot) await mutations.saveNow(nextStoreSnapshot);
    setScheduleEditingId(null);
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
          const convertedQuery = search.converted.trim().toLowerCase();

          const sortedAttended = [...d.attendedLeads].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          const sortedBudgets = [...d.budgetLeads].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          const sortedConverted = [...d.convertedLeads].sort((a, b) => {
            const da = a.attendedDate || a.budgetDate || "";
            const db = b.attendedDate || b.budgetDate || "";
            return db.localeCompare(da);
          });

          const filteredAttended = attendedQuery
            ? sortedAttended.filter((lead) =>
                (() => {
                  const identity = getSyncedIdentity(lead.patientId, lead.name, lead.phone);
                  return `${identity.name || ""} ${lead.date || ""} ${identity.phone || ""} ${statusLabel(lead.status)}`.toLowerCase().includes(attendedQuery);
                })()
              )
            : sortedAttended;

          const filteredBudgets = budgetQuery
            ? sortedBudgets.filter((lead) =>
                (() => {
                  const identity = getSyncedIdentity(lead.patientId, lead.name, lead.phone);
                  return `${identity.name || ""} ${lead.date || ""} ${identity.phone || ""}`.toLowerCase().includes(budgetQuery);
                })()
              )
            : sortedBudgets;

          const filteredConverted = convertedQuery
            ? sortedConverted.filter((lead) =>
                `${getSyncedIdentity(lead.patientId, lead.name, lead.phone).name || ""} ${lead.budgetDate || ""} ${lead.attendedDate || ""} ${getSyncedIdentity(lead.patientId, lead.name, lead.phone).phone || ""}`
                  .toLowerCase()
                  .includes(convertedQuery)
              )
            : sortedConverted;

          const leadFrequency = sortedAttended.reduce((acc, lead) => {
            const key = String(lead.patientId || `${(lead.name || "").toLowerCase()}::${lead.phone || ""}`).trim();
            acc.set(key, (acc.get(key) || 0) + 1);
            return acc;
          }, new Map<string, number>());

          const repeatedVisits = Array.from(leadFrequency.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
          const uniquePatients = leadFrequency.size;

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
                  <StatusBadge status={d.status} todayAttended={d.todayAttended} dailyTarget={d.dailyTarget} isWorkingToday={d.isWorkingToday} />
                  <p className="text-xs text-slate-500 mt-2">
                    Atend. Totais: <span className="font-semibold text-slate-700">{d.attendedLeads.length}</span>
                    {" · "}
                    Orçamentos: <span className="font-semibold text-slate-700">{d.budgetLeads.length}</span>
                    {" · "}
                    {d.hasConversionGoal !== false ? (
                      <>Ret./Fech.: <span className="font-semibold text-emerald-700">{d.convertedLeads.length}</span></>
                    ) : (
                      <>Taxa de atendimento: <span className="font-semibold text-emerald-700">{Math.round(d.attendanceRate || 0)}%</span></>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Escala: <span className="font-medium text-slate-700">{formatWorkDays(d.workDays)}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Perfil: <span className="font-medium text-slate-700">{d.isOrcamentista === false ? "Somente execução" : "Orçamentista"}</span>
                  </p>
                  {scheduleEditingId === d.id && (
                    <div className="mt-2 p-2 rounded-lg border border-slate-200 bg-slate-50">
                      <p className="text-[11px] text-slate-600 mb-1">Editar dias de atendimento</p>
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {weekdayOptions.map((day) => (
                          <label key={day.value} className="flex items-center gap-1 text-[11px] bg-white border border-slate-200 rounded px-1.5 py-1">
                            <input
                              type="checkbox"
                              checked={scheduleDraft.includes(day.value)}
                              onChange={() => toggleScheduleDay(day.value)}
                            />
                            <span>{day.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveSchedule(d.id)}
                          disabled={scheduleDraft.length === 0}
                          className="px-2 py-1 text-[11px] rounded bg-slate-900 text-white disabled:opacity-40"
                        >
                          Salvar escala
                        </button>
                        <button
                          type="button"
                          onClick={() => setScheduleEditingId(null)}
                          className="px-2 py-1 text-[11px] rounded border border-slate-300 text-slate-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Métricas */}
                <div className="flex items-center gap-5 text-right shrink-0">
                  {/* Hoje */}
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">Hoje</div>
                    <div className="mb-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditSchedule(d.id, d.workDays);
                        }}
                        className="text-[11px] text-blue-600 hover:text-blue-700 underline"
                      >
                        Editar escala
                      </button>
                    </div>
                    <div className={`text-xl font-bold ${d.dailyTarget > 0 && d.todayAttended >= d.dailyTarget ? "text-emerald-600" : "text-slate-900"}`}>
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
                  {/* Conversão / Taxa de atendimento */}
                  <div>
                    <div className="text-xs text-slate-400 mb-0.5">{d.hasConversionGoal !== false ? "Conversão" : "Taxa Atend."}</div>
                    <div className="text-lg font-semibold text-slate-700">{Math.round(d.hasConversionGoal !== false ? d.conversionRate : (d.attendanceRate || 0))}%</div>
                    <div className="text-xs text-slate-400">
                      {d.hasConversionGoal !== false
                        ? `ret./fech. ${d.convertedLeads.length}/${d.budgetLeads.length}`
                        : `meta sem. ${d.weekAttended}/${d.weekTarget || 0}`}
                    </div>
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
                <>
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
                    <p className="text-[11px] text-slate-500 mb-1">Pacientes únicos: {uniquePatients} · Reincidências: {repeatedVisits}</p>
                    <p className="text-[11px] text-slate-400 mb-2">Ordenado por data mais recente</p>
                    {filteredAttended.length === 0 ? (
                      <p className="text-xs text-slate-500">Nenhum atendimento/agendamento registrado.</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5">
                        {filteredAttended.map((lead, idx) => (
                          (() => {
                            const identity = getSyncedIdentity(lead.patientId, lead.name, lead.phone);
                            return (
                          <div key={`${lead.name}_${lead.date}_${idx}`} className="text-xs text-slate-700 border-b border-slate-200 pb-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-slate-900">{identity.name}</p>
                                {identity.synced && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">SYNC</span>}
                              </div>
                              {(lead.id && lead.sourceType) && (
                                <button
                                  type="button"
                                  onClick={() => openEditLead(d.id, lead)}
                                  className="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-white"
                                >
                                  Editar
                                </button>
                              )}
                            </div>
                            <p>
                              {lead.date || "sem data"} · {statusLabel(lead.status)}
                              {identity.phone ? ` · ${identity.phone}` : ""}
                            </p>
                            {identity.synced && identity.crmName && identity.crmName !== identity.name && (
                              <p className="text-[11px] text-emerald-700">CRM: {identity.crmName}</p>
                            )}
                            {typeof lead.saleValue === "number" && (
                              <p className="text-[11px] text-emerald-700">Venda: R$ {Math.round(lead.saleValue).toLocaleString("pt-BR")}{lead.saleProcedure ? ` · ${lead.saleProcedure}` : ""}</p>
                            )}
                          </div>
                            );
                          })()
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
                          (() => {
                            const identity = getSyncedIdentity(lead.patientId, lead.name, lead.phone);
                            return (
                          <div key={`${lead.name}_${lead.date}_${idx}`} className="text-xs text-slate-700 border-b border-slate-200 pb-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-slate-900">{identity.name}</p>
                                {identity.synced && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">SYNC</span>}
                              </div>
                              {lead.id && (
                                <button
                                  type="button"
                                  onClick={() => openEditLead(d.id, { ...lead, sourceType: "budget", status: "budget" })}
                                  className="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-white"
                                >
                                  Editar
                                </button>
                              )}
                            </div>
                            <p>{lead.date || "sem data"}{identity.phone ? ` · ${identity.phone}` : ""}</p>
                            {lead.procedure && <p className="text-[11px] text-slate-500">Serviço: {lead.procedure}</p>}
                            {identity.synced && identity.crmName && identity.crmName !== identity.name && (
                              <p className="text-[11px] text-emerald-700">CRM: {identity.crmName}</p>
                            )}
                          </div>
                            );
                          })()
                        ))}
                      </div>
                    )}
                  </div>

                  {d.hasConversionGoal !== false ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2">
                        Retornos e Fechamentos ({d.convertedLeads.length})
                      </p>
                      <input
                        type="text"
                        value={search.converted}
                        onChange={(e) => updateSearch(d.id, "converted", e.target.value)}
                        placeholder="Pesquisar fechamento por nome, telefone ou data"
                        className="w-full mb-2 px-2 py-1.5 border border-emerald-300 rounded text-xs text-emerald-900 bg-white"
                      />
                      <p className="text-[11px] text-emerald-600 mb-2">Ordenado por data de atendimento mais recente</p>
                      {filteredConverted.length === 0 ? (
                        <p className="text-xs text-emerald-700">Nenhum orçamento com retorno/fechamento ainda.</p>
                      ) : (
                        <div className="max-h-56 overflow-y-auto space-y-1.5">
                          {filteredConverted.map((lead, idx) => (
                            (() => {
                              const identity = getSyncedIdentity(lead.patientId, lead.name, lead.phone);
                              return (
                            <div key={`${lead.name}_${lead.budgetDate}_${lead.attendedDate}_${idx}`} className="text-xs text-emerald-900 border-b border-emerald-200 pb-1">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium">{identity.name}</p>
                                {identity.synced && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">SYNC</span>}
                              </div>
                              <p>Orçamento: {lead.budgetDate || "-"} · Atendimento: {lead.attendedDate || "-"}</p>
                              {identity.phone && <p>{identity.phone}</p>}
                              {identity.synced && identity.crmName && identity.crmName !== identity.name && (
                                <p className="text-[11px] text-emerald-700">CRM: {identity.crmName}</p>
                              )}
                            </div>
                              );
                            })()
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">Meta de Atendimento</p>
                      <p className="text-sm text-blue-900">
                        Taxa de atendimento no período: <span className="font-semibold">{Math.round(d.attendanceRate || 0)}%</span>
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Meta semanal: {d.weekAttended}/{d.weekTarget || 0}
                      </p>
                      <p className="text-[11px] text-blue-700 mt-2">Conversão não é cobrada para este perfil (somente execução).</p>
                    </div>
                  )}
                </div>

                {editingLead && editingLead.dentistId === d.id && (
                  <div className="lg:col-span-3 bg-white border border-slate-300 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-slate-900">Editar e Sincronizar Lead</p>
                      <button type="button" onClick={() => setEditingLead(null)} className="text-xs text-slate-500 hover:text-slate-800">Fechar</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input
                        value={editingLead.name}
                        onChange={(e) => setEditingLead((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                        placeholder="Nome"
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                      />
                      <input
                        value={editingLead.phone || ""}
                        onChange={(e) => setEditingLead((prev) => prev ? { ...prev, phone: e.target.value } : prev)}
                        placeholder="Telefone"
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                      />
                      <input
                        type="date"
                        value={editingLead.date || ""}
                        onChange={(e) => setEditingLead((prev) => prev ? { ...prev, date: e.target.value } : prev)}
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                      />
                      {editingLead.sourceType === "appointment" ? (
                        <select
                          value={editingLead.status || "attended"}
                          onChange={(e) => setEditingLead((prev) => prev ? { ...prev, status: e.target.value } : prev)}
                          className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                        >
                          <option value="attended">Atendido</option>
                          <option value="confirmed">Confirmado</option>
                          <option value="scheduled">Agendado</option>
                        </select>
                      ) : (
                        <input value="Orçamento" disabled className="px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-100 text-slate-500" />
                      )}
                      <input
                        type="number"
                        value={editingLead.saleValue ?? ""}
                        onChange={(e) => setEditingLead((prev) => prev ? { ...prev, saleValue: e.target.value ? Number(e.target.value) : undefined } : prev)}
                        placeholder="Valor da venda"
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                      />
                      <input
                        value={editingLead.saleProcedure || ""}
                        onChange={(e) => setEditingLead((prev) => prev ? { ...prev, saleProcedure: e.target.value } : prev)}
                        placeholder="Procedimento / tipo de venda"
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                      />
                      <input
                        value={editingLead.attendedBy || ""}
                        onChange={(e) => setEditingLead((prev) => prev ? { ...prev, attendedBy: e.target.value } : prev)}
                        placeholder="Quem atendeu"
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs"
                      />
                    </div>

                    <div className="mt-2">
                      <input
                        value={editingLead.crmQuery}
                        onChange={(e) => setEditingLead((prev) => prev ? { ...prev, crmQuery: e.target.value } : prev)}
                        placeholder="Buscar no banco CRM por nome ou telefone para sincronizar"
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                      />
                      {editingLead.crmQuery.trim() && (
                        <div className="mt-1 max-h-28 overflow-y-auto border border-slate-200 rounded bg-slate-50">
                          {crmMatches.length === 0 ? (
                            <p className="text-xs text-slate-500 px-2 py-1.5">Nenhum lead encontrado</p>
                          ) : crmMatches.map((lead) => (
                            <button
                              key={lead.id}
                              type="button"
                              onClick={() => applyLeadSync(lead)}
                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-white border-b border-slate-200 last:border-b-0"
                            >
                              {lead.nome} · {lead.telefone}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[11px] text-slate-500">Lead vinculado: {editingLead.patientId || "não sincronizado"}</p>
                      <button type="button" onClick={() => void saveEditedLead()} className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs hover:bg-slate-800">Salvar edição</button>
                    </div>
                  </div>
                )}
                </>
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
