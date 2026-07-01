import React, { useState, useMemo } from "react";
import { Plus, X, Search, UserPlus, CalendarPlus, Star, Settings, Upload } from "lucide-react";
import { MPCStore } from "@/hooks/useMPCDataStore";
import { useLeads } from "@/hooks/useLeads";

type Mutations = {
  setStore: (s: MPCStore | ((prev: MPCStore) => MPCStore)) => void;
  addDentist: (d: { name: string; specialty?: string; dailyTarget?: number }) => void;
  updateDentist: (id: string, patch: Partial<{ name: string; specialty: string; dailyTarget: number }>) => void;
  removeDentist: (id: string) => void;
  recordAppointment: (a: any) => void;
  addSurvey: (s: any) => void;
};

type MPCDataPanelProps = {
  store: MPCStore;
  mutations: Mutations;
};

type ActiveForm = null | "dentista" | "atendimento" | "satisfacao" | "ticket" | "importacao";

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateToISO(dateRaw: string) {
  const input = dateRaw.trim();
  if (!input) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const dt = new Date(`${input}T12:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  // dd/mm/yyyy
  const br = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    const year = Number(br[3]);
    const dt = new Date(year, month, day, 12, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  return null;
}

function parseDateTimeToISO(dateRaw: string, timeRaw?: string) {
  const datePart = dateRaw.trim();
  const timePart = (timeRaw || "12:00").trim();
  const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})$/);
  const hh = timeMatch ? String(Math.min(23, Number(timeMatch[1]))).padStart(2, "0") : "12";
  const mm = timeMatch ? String(Math.min(59, Number(timeMatch[2]))).padStart(2, "0") : "00";

  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const dt = new Date(`${datePart}T${hh}:${mm}:00`);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  const br = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    const year = Number(br[3]);
    const dt = new Date(year, month, day, Number(hh), Number(mm), 0);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  return null;
}

export default function MPCDataPanel({ store, mutations }: MPCDataPanelProps) {
  const { setStore, addDentist, updateDentist, removeDentist, recordAppointment, addSurvey } = mutations;
  const { allLeads } = useLeads();

  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [dentistForm, setDentistForm] = useState({ name: "", specialty: "", dailyTarget: 10 });
  const [editingId, setEditingId] = useState<string | null>(null);

  const [apptSearchQuery, setApptSearchQuery] = useState("");
  const [showApptSearch, setShowApptSearch] = useState(false);
  const [apptForm, setApptForm] = useState({
    dentistId: "", patientName: "", patientId: "",
    status: "attended" as "scheduled" | "confirmed" | "attended",
    attendedAt: new Date().toISOString().split("T")[0],
  });

  const [survSearchQuery, setSurvSearchQuery] = useState("");
  const [showSurvSearch, setShowSurvSearch] = useState(false);
  const [surveyForm, setSurveyForm] = useState({
    leadId: "", patientName: "",
    sector: "clinic" as "reception" | "clinic" | "ortho" | "sales",
    score: 5, comment: "",
  });

  const [bulkDentistId, setBulkDentistId] = useState("");
  const [bulkStatus, setBulkStatus] = useState<"scheduled" | "confirmed" | "attended">("attended");
  const [bulkText, setBulkText] = useState("");
  const [budgetBulkDentistId, setBudgetBulkDentistId] = useState("");
  const [budgetBulkText, setBudgetBulkText] = useState("");

  const filteredApptLeads = useMemo(() => {
    if (!apptSearchQuery.trim()) return [];
    const q = apptSearchQuery.toLowerCase();
    return allLeads.filter(l => l.nome.toLowerCase().includes(q) || l.telefone.includes(q)).slice(0, 8);
  }, [apptSearchQuery, allLeads]);

  const filteredSurvLeads = useMemo(() => {
    if (!survSearchQuery.trim()) return [];
    const q = survSearchQuery.toLowerCase();
    return allLeads.filter(l => l.nome.toLowerCase().includes(q) || l.telefone.includes(q)).slice(0, 8);
  }, [survSearchQuery, allLeads]);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setActiveForm(null);
    setTimeout(() => setSuccessMsg(null), 3500);
  }

  function openForm(form: ActiveForm) {
    setActiveForm(prev => prev === form ? null : form);
    setSuccessMsg(null);
  }

  const handleAddDentist = () => {
    if (!dentistForm.name.trim()) return;
    if (editingId) {
      updateDentist(editingId, { name: dentistForm.name, specialty: dentistForm.specialty, dailyTarget: dentistForm.dailyTarget });
      setEditingId(null);
      showSuccess(`Dentista "${dentistForm.name}" atualizado`);
    } else {
      addDentist({ name: dentistForm.name, specialty: dentistForm.specialty, dailyTarget: dentistForm.dailyTarget });
      showSuccess(`Dentista "${dentistForm.name}" adicionado com sucesso`);
    }
    setDentistForm({ name: "", specialty: "", dailyTarget: 10 });
  };

  const handleAddAppointment = () => {
    if (!apptForm.dentistId || !apptForm.patientName.trim()) return;
    const dentist = store.dentists.find(d => d.id === apptForm.dentistId);
    const dateTime = new Date(`${apptForm.attendedAt}T${new Date().toTimeString().slice(0, 5)}`).toISOString();
    recordAppointment({
      id: `apt_${Date.now()}`,
      dentistId: apptForm.dentistId,
      patientName: apptForm.patientName,
      patientId: apptForm.patientId || undefined,
      status: apptForm.status,
      attendedAt: dateTime,
    });
    showSuccess(`Atendimento de "${apptForm.patientName}" registrado${dentist ? ` para ${dentist.name}` : ""}`);
    setApptForm({ dentistId: "", patientName: "", patientId: "", status: "attended", attendedAt: new Date().toISOString().split("T")[0] });
    setApptSearchQuery("");
  };

  const handleAddSurvey = () => {
    if (!surveyForm.patientName.trim()) return;
    addSurvey({
      id: `survey_${Date.now()}`,
      leadId: surveyForm.leadId || undefined,
      sector: surveyForm.sector,
      score: surveyForm.score,
      comment: surveyForm.comment,
      createdAt: new Date().toISOString(),
    });
    showSuccess(`Pesquisa de "${surveyForm.patientName}" registrada - ${"⭐".repeat(surveyForm.score)}`);
    setSurveyForm({ leadId: "", patientName: "", sector: "clinic", score: 5, comment: "" });
    setSurvSearchQuery("");
  };

  const handleBulkImportAppointments = () => {
    if (!bulkDentistId || !bulkText.trim()) return;

    const leadByNormalizedName = new Map<string, string>();
    allLeads.forEach((lead) => {
      const key = normalizeName(lead.nome || "");
      if (key && !leadByNormalizedName.has(key)) {
        leadByNormalizedName.set(key, lead.id);
      }
    });

    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const imported: any[] = [];
    let linkedCount = 0;
    let noLeadCount = 0;
    let invalidCount = 0;

    lines.forEach((line, idx) => {
      const cols = line.split(/[;,|\t]/).map((c) => c.trim()).filter(Boolean);
      if (cols.length < 2) {
        invalidCount += 1;
        return;
      }

      const [nameCol, dateCol, statusCol] = cols;
      // Ignora provável cabeçalho
      if (idx === 0 && /nome/i.test(nameCol) && /data/i.test(dateCol)) {
        return;
      }

      const patientName = nameCol;
      const attendedAtISO = parseDateToISO(dateCol);
      if (!patientName || !attendedAtISO) {
        invalidCount += 1;
        return;
      }

      const parsedStatus = (statusCol || "").toLowerCase();
      const status = parsedStatus === "scheduled" || parsedStatus === "agendado"
        ? "scheduled"
        : parsedStatus === "confirmed" || parsedStatus === "confirmado"
        ? "confirmed"
        : bulkStatus;

      const leadId = leadByNormalizedName.get(normalizeName(patientName));
      if (leadId) linkedCount += 1;
      else noLeadCount += 1;

      imported.push({
        id: `apt_bulk_${Date.now()}_${idx}`,
        dentistId: bulkDentistId,
        patientName,
        patientId: leadId,
        status,
        attendedAt: attendedAtISO,
      });
    });

    if (imported.length === 0) {
      showSuccess(`Nenhuma linha válida para importar (${invalidCount} inválidas)`);
      return;
    }

    setStore((prev) => ({ ...prev, appointments: [...prev.appointments, ...imported] }));
    showSuccess(
      `Importados ${imported.length} atendimentos em massa · ${linkedCount} vinculados ao CRM · ${noLeadCount} sem lead · ${invalidCount} inválidos`
    );

    setBulkText("");
  };

  const handleBulkImportBudgets = () => {
    if (!budgetBulkDentistId || !budgetBulkText.trim()) return;

    const leadByNormalizedName = new Map<string, string>();
    allLeads.forEach((lead) => {
      const key = normalizeName(lead.nome || "");
      if (key && !leadByNormalizedName.has(key)) {
        leadByNormalizedName.set(key, lead.id);
      }
    });

    const lines = budgetBulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const imported: Array<{ id: string; dentistId: string; patientName: string; patientId?: string; budgetAt: string; procedure?: string; source?: string }> = [];
    let linkedCount = 0;
    let noLeadCount = 0;
    let invalidCount = 0;

    lines.forEach((line, idx) => {
      // Formato markdown esperado:
      // - **Nome**: 05/06/2026, 08:49, Dra Barbara
      const md = line.match(/\*\*(.+?)\*\*\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s*,\s*(\d{1,2}:\d{2}))?(?:\s*,\s*(.+))?/i);
      if (md) {
        const patientName = (md[1] || "").trim();
        const date = (md[2] || "").trim();
        const time = (md[3] || "12:00").trim();
        const extra = (md[4] || "").trim();
        const budgetAt = parseDateTimeToISO(date, time);
        if (!patientName || !budgetAt) {
          invalidCount += 1;
          return;
        }
        const leadId = leadByNormalizedName.get(normalizeName(patientName));
        if (leadId) linkedCount += 1;
        else noLeadCount += 1;

        imported.push({
          id: `bud_bulk_${Date.now()}_${idx}`,
          dentistId: budgetBulkDentistId,
          patientName,
          patientId: leadId,
          budgetAt,
          procedure: undefined,
          source: extra || "import_markdown",
        });
        return;
      }

      // Alternativa por colunas: Nome;Data;Hora(opcional);Procedimento(opcional)
      const cols = line.split(/[;,|\t]/).map((c) => c.trim()).filter(Boolean);
      if (cols.length < 2) {
        invalidCount += 1;
        return;
      }

      const [nameCol, dateCol, thirdCol = "", fourthCol = ""] = cols;
      if (idx === 0 && /nome/i.test(nameCol) && /data/i.test(dateCol)) return;

      const timeLooksValid = /^\d{1,2}:\d{2}$/.test(thirdCol);
      const budgetAt = parseDateTimeToISO(dateCol, timeLooksValid ? thirdCol : undefined);
      if (!nameCol || !budgetAt) {
        invalidCount += 1;
        return;
      }

      const procedure = timeLooksValid ? fourthCol || undefined : thirdCol || undefined;
      const leadId = leadByNormalizedName.get(normalizeName(nameCol));
      if (leadId) linkedCount += 1;
      else noLeadCount += 1;

      imported.push({
        id: `bud_bulk_${Date.now()}_${idx}`,
        dentistId: budgetBulkDentistId,
        patientName: nameCol,
        patientId: leadId,
        budgetAt,
        procedure,
        source: "import_table",
      });
    });

    if (imported.length === 0) {
      showSuccess(`Nenhuma linha válida para importar orçamento (${invalidCount} inválidas)`);
      return;
    }

    setStore((prev) => ({ ...prev, budgets: [...(prev.budgets || []), ...imported] }));
    showSuccess(
      `Importados ${imported.length} orçamento(s) · ${linkedCount} vinculados ao CRM · ${noLeadCount} sem lead · ${invalidCount} inválidos`
    );

    setBudgetBulkText("");
  };

  const autoLinkUnmatchedByName = () => {
    const leadByNormalizedName = new Map<string, string>();
    allLeads.forEach((lead) => {
      const key = normalizeName(lead.nome || "");
      if (key && !leadByNormalizedName.has(key)) leadByNormalizedName.set(key, lead.id);
    });

    let linkedAppointments = 0;
    let linkedBudgets = 0;

    setStore((prev) => {
      const appointments = prev.appointments.map((a: any) => {
        if (a.patientId) return a;
        const id = leadByNormalizedName.get(normalizeName(a.patientName || ""));
        if (!id) return a;
        linkedAppointments += 1;
        return { ...a, patientId: id };
      });

      const budgets = (prev.budgets || []).map((b: any) => {
        if (b.patientId) return b;
        const id = leadByNormalizedName.get(normalizeName(b.patientName || ""));
        if (!id) return b;
        linkedBudgets += 1;
        return { ...b, patientId: id };
      });

      return { ...prev, appointments, budgets };
    });

    showSuccess(`Vinculação automática concluída: ${linkedAppointments} atendimento(s) + ${linkedBudgets} orçamento(s)`);
  };

  const updateUnlinkedAppointment = (id: string, patch: Partial<{ patientName: string; attendedAt: string }>) => {
    setStore((prev) => ({
      ...prev,
      appointments: prev.appointments.map((a: any) => {
        if (a.id !== id) return a;
        return {
          ...a,
          ...(patch.patientName !== undefined ? { patientName: patch.patientName } : {}),
          ...(patch.attendedAt !== undefined ? { attendedAt: parseDateToISO(patch.attendedAt) || a.attendedAt } : {}),
          // Se editou nome, remove vínculo antigo para evitar relação incorreta
          ...(patch.patientName !== undefined ? { patientId: undefined } : {}),
        };
      }),
    }));
  };

  const updateUnlinkedBudget = (id: string, patch: Partial<{ patientName: string; budgetAt: string }>) => {
    setStore((prev) => ({
      ...prev,
      budgets: (prev.budgets || []).map((b: any) => {
        if (b.id !== id) return b;
        return {
          ...b,
          ...(patch.patientName !== undefined ? { patientName: patch.patientName } : {}),
          ...(patch.budgetAt !== undefined ? { budgetAt: parseDateToISO(patch.budgetAt) || b.budgetAt } : {}),
          ...(patch.patientName !== undefined ? { patientId: undefined } : {}),
        };
      }),
    }));
  };

  const unlinkedAppointments = useMemo(
    () => store.appointments.filter((a: any) => !a.patientId).slice(0, 30),
    [store.appointments]
  );

  const unlinkedBudgets = useMemo(
    () => (store.budgets || []).filter((b: any) => !b.patientId).slice(0, 30),
    [store.budgets]
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Barra superior compacta */}
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200 flex-wrap">
        <span className="text-sm font-semibold text-slate-700">Registros</span>
        <div className="flex gap-2 flex-1">
          <span className="text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">
            {store.dentists.length} dentistas
          </span>
          <span className="text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">
            {store.appointments.length} atendimentos
          </span>
          <span className="text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">
            {(store.budgets || []).length} orçamentos
          </span>
          <span className="text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">
            {store.surveys.length} pesquisas
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openForm("dentista")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeForm === "dentista" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
            <UserPlus size={13} /> Dentista
          </button>
          <button onClick={() => openForm("atendimento")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeForm === "atendimento" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
            <CalendarPlus size={13} /> Atendimento
          </button>
          <button onClick={() => openForm("importacao")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeForm === "importacao" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
            <Upload size={13} /> Em Massa
          </button>
          <button onClick={() => openForm("satisfacao")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeForm === "satisfacao" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
            <Star size={13} /> Satisfação
          </button>
          <button onClick={() => openForm("ticket")} title={`Ticket Médio: R$ ${store.averageTicket}`} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeForm === "ticket" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
            <Settings size={13} />
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-sm">
          ✅ {successMsg}
        </div>
      )}

      {activeForm && (
        <div className="p-5 border-b border-slate-100 bg-slate-50">

          {activeForm === "ticket" && (
            <div className="space-y-3 max-w-xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Ticket Médio (R$)</span>
                <button onClick={() => setActiveForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
              </div>
              <input type="number" value={store.averageTicket} onChange={(e) => setStore({ ...store, averageTicket: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white" autoFocus />
              <button onClick={() => setActiveForm(null)} className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800">Salvar</button>
            </div>
          )}

          {activeForm === "dentista" && (
            <div className="space-y-3 max-w-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{editingId ? "Editar Dentista" : "Adicionar Dentista"}</span>
                <button onClick={() => { setActiveForm(null); setEditingId(null); setDentistForm({ name: "", specialty: "", dailyTarget: 10 }); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-slate-600 mb-1 block">Nome *</label>
                  <input type="text" placeholder="Dr. / Dra. Nome" value={dentistForm.name} onChange={(e) => setDentistForm({ ...dentistForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Especialidade</label>
                  <input type="text" placeholder="Ex: Implante, Ortho" value={dentistForm.specialty} onChange={(e) => setDentistForm({ ...dentistForm, specialty: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Meta Diária (pacientes)</label>
                  <input type="number" min="1" value={dentistForm.dailyTarget} onChange={(e) => setDentistForm({ ...dentistForm, dailyTarget: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddDentist} disabled={!dentistForm.name.trim()} className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40">
                  {editingId ? "Atualizar" : "Adicionar"}
                </button>
                {editingId && (
                  <button onClick={() => { setEditingId(null); setDentistForm({ name: "", specialty: "", dailyTarget: 10 }); }} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-white">Cancelar</button>
                )}
              </div>
              {store.dentists.length > 0 && (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <p className="text-xs font-medium text-slate-600">Cadastrados:</p>
                  {store.dentists.map(d => (
                    <div key={d.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-200">
                      <div className="text-sm">
                        <span className="font-medium text-slate-900">{d.name}</span>
                        {d.specialty && <span className="text-slate-500 ml-2 text-xs">{d.specialty}</span>}
                        <span className="text-slate-400 ml-2 text-xs">meta: {d.dailyTarget}/dia</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingId(d.id); setDentistForm({ name: d.name, specialty: d.specialty || "", dailyTarget: d.dailyTarget }); }} className="p-1 hover:bg-blue-50 rounded text-blue-500 text-xs">✏️</button>
                        <button onClick={() => removeDentist(d.id)} className="p-1 hover:bg-red-50 rounded text-red-400 text-xs">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeForm === "atendimento" && (
            <div className="space-y-3 max-w-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Registrar Atendimento</span>
                <button onClick={() => setActiveForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
              </div>
              {store.dentists.length === 0 ? (
                <p className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ Adicione um dentista primeiro</p>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Dentista *</label>
                    <select value={apptForm.dentistId} onChange={(e) => setApptForm({ ...apptForm, dentistId: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm" autoFocus>
                      <option value="">Selecione um dentista</option>
                      {store.dentists.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="relative">
                    <label className="text-xs text-slate-600 mb-1 block">Buscar Paciente no CRM</label>
                    <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2">
                      <Search size={14} className="text-slate-400 shrink-0" />
                      <input type="text" placeholder="Nome ou telefone..." value={apptSearchQuery} onChange={(e) => { setApptSearchQuery(e.target.value); setShowApptSearch(true); }} onFocus={() => setShowApptSearch(true)} className="flex-1 outline-none text-sm text-slate-900 bg-transparent" />
                    </div>
                    {showApptSearch && apptSearchQuery.trim() && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                        {filteredApptLeads.length === 0 ? <div className="p-3 text-sm text-slate-500">Nenhum paciente encontrado</div>
                          : filteredApptLeads.map(lead => (
                            <button key={lead.id} onClick={() => { setApptForm({ ...apptForm, patientName: lead.nome, patientId: lead.id }); setApptSearchQuery(""); setShowApptSearch(false); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
                              <p className="text-sm font-medium text-slate-900">{lead.nome}</p>
                              <p className="text-xs text-slate-500">{lead.telefone} · {lead.servicoProcurado || "Geral"}</p>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Nome do Paciente *</label>
                    <input type="text" placeholder="Nome do paciente" value={apptForm.patientName} onChange={(e) => setApptForm({ ...apptForm, patientName: e.target.value, patientId: "" })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm" />
                    {apptForm.patientId && <p className="text-xs text-emerald-600 mt-0.5">✓ Paciente CRM vinculado</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-600 mb-1 block">Status</label>
                      <select value={apptForm.status} onChange={(e) => setApptForm({ ...apptForm, status: e.target.value as any })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm">
                        <option value="attended">✅ Atendido</option>
                        <option value="confirmed">📋 Confirmado</option>
                        <option value="scheduled">📅 Agendado</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-600 mb-1 block">Data *</label>
                      <input type="date" value={apptForm.attendedAt} max={new Date().toISOString().split("T")[0]} onChange={(e) => setApptForm({ ...apptForm, attendedAt: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm" />
                    </div>
                  </div>
                  <button onClick={handleAddAppointment} disabled={!apptForm.dentistId || !apptForm.patientName.trim()} className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-2">
                    <Plus size={16} /> Registrar Atendimento
                  </button>
                </>
              )}
            </div>
          )}

          {activeForm === "importacao" && (
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Importar Atendimentos em Massa</span>
                <button onClick={() => setActiveForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
              </div>

              {store.dentists.length === 0 ? (
                <p className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ Adicione um dentista primeiro</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-600 mb-1 block">Dentista *</label>
                      <select value={bulkDentistId} onChange={(e) => setBulkDentistId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm">
                        <option value="">Selecione um dentista</option>
                        {store.dentists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-600 mb-1 block">Status padrão</label>
                      <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as any)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm">
                        <option value="attended">Atendido</option>
                        <option value="confirmed">Confirmado</option>
                        <option value="scheduled">Agendado</option>
                      </select>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-3">
                    Formato por linha: <strong>Nome;Data;Status(opcional)</strong><br />
                    Data aceita: <strong>dd/mm/aaaa</strong> ou <strong>aaaa-mm-dd</strong><br />
                    Exemplo:<br />
                    Maria da Silva;12/04/2026;attended<br />
                    João Souza;2026-04-13;confirmed
                  </div>

                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="Cole aqui sua lista de atendimentos (uma linha por paciente)"
                    rows={10}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm resize-y"
                  />

                  <button
                    onClick={handleBulkImportAppointments}
                    disabled={!bulkDentistId || !bulkText.trim()}
                    className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Upload size={16} /> Importar em Massa
                  </button>

                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-900">Importar Orçamentos em Massa</h4>

                    <div>
                      <label className="text-xs text-slate-600 mb-1 block">Dentista *</label>
                      <select value={budgetBulkDentistId} onChange={(e) => setBudgetBulkDentistId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm">
                        <option value="">Selecione um dentista</option>
                        {store.dentists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>

                    <div className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-3">
                      Formatos aceitos:<br />
                      1) <strong>- **Nome**: 05/06/2026, 08:49, Dra Barbara</strong><br />
                      2) <strong>Nome;Data;Hora;Procedimento(opcional)</strong>
                    </div>

                    <textarea
                      value={budgetBulkText}
                      onChange={(e) => setBudgetBulkText(e.target.value)}
                      placeholder="Cole aqui sua lista de orçamentos"
                      rows={8}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm resize-y"
                    />

                    <button
                      onClick={handleBulkImportBudgets}
                      disabled={!budgetBulkDentistId || !budgetBulkText.trim()}
                      className="w-full px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Upload size={16} /> Importar Orçamentos
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-900">Leads não vinculados (editar + vincular)</h4>
                      <button
                        onClick={autoLinkUnmatchedByName}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-white"
                      >
                        Vincular por Nome
                      </button>
                    </div>

                    <div className="text-xs text-slate-500">
                      Mostrando até 30 de cada tipo. Você pode corrigir nome/data e clicar em "Vincular por Nome" novamente.
                    </div>

                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Atendimentos sem vínculo ({unlinkedAppointments.length})</h5>
                      {unlinkedAppointments.length === 0 ? (
                        <p className="text-xs text-emerald-700">Nenhum atendimento pendente de vínculo.</p>
                      ) : unlinkedAppointments.map((a: any) => (
                        <div key={a.id} className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-white border border-slate-200 rounded-lg p-2">
                          <input
                            value={a.patientName || ""}
                            onChange={(e) => updateUnlinkedAppointment(a.id, { patientName: e.target.value })}
                            className="px-2 py-1.5 border border-slate-300 rounded text-sm"
                            placeholder="Nome do paciente"
                          />
                          <input
                            type="date"
                            value={String(a.attendedAt || "").slice(0, 10)}
                            onChange={(e) => updateUnlinkedAppointment(a.id, { attendedAt: e.target.value })}
                            className="px-2 py-1.5 border border-slate-300 rounded text-sm"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Orçamentos sem vínculo ({unlinkedBudgets.length})</h5>
                      {unlinkedBudgets.length === 0 ? (
                        <p className="text-xs text-emerald-700">Nenhum orçamento pendente de vínculo.</p>
                      ) : unlinkedBudgets.map((b: any) => (
                        <div key={b.id} className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-white border border-slate-200 rounded-lg p-2">
                          <input
                            value={b.patientName || ""}
                            onChange={(e) => updateUnlinkedBudget(b.id, { patientName: e.target.value })}
                            className="px-2 py-1.5 border border-slate-300 rounded text-sm"
                            placeholder="Nome do paciente"
                          />
                          <input
                            type="date"
                            value={String(b.budgetAt || "").slice(0, 10)}
                            onChange={(e) => updateUnlinkedBudget(b.id, { budgetAt: e.target.value })}
                            className="px-2 py-1.5 border border-slate-300 rounded text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeForm === "satisfacao" && (
            <div className="space-y-3 max-w-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Pesquisa de Satisfação</span>
                <button onClick={() => setActiveForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
              </div>
              <div className="relative">
                <label className="text-xs text-slate-600 mb-1 block">Paciente que avaliou</label>
                <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2">
                  <Search size={14} className="text-slate-400 shrink-0" />
                  <input type="text" placeholder="Nome ou telefone..." value={survSearchQuery} onChange={(e) => { setSurvSearchQuery(e.target.value); setShowSurvSearch(true); }} onFocus={() => setShowSurvSearch(true)} className="flex-1 outline-none text-sm text-slate-900 bg-transparent" autoFocus />
                </div>
                {showSurvSearch && survSearchQuery.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                    {filteredSurvLeads.length === 0 ? <div className="p-3 text-sm text-slate-500">Nenhum paciente encontrado</div>
                      : filteredSurvLeads.map(lead => (
                        <button key={lead.id} onClick={() => { setSurveyForm({ ...surveyForm, patientName: lead.nome, leadId: lead.id }); setSurvSearchQuery(""); setShowSurvSearch(false); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
                          <p className="text-sm font-medium text-slate-900">{lead.nome}</p>
                          <p className="text-xs text-slate-500">{lead.telefone} · {lead.servicoProcurado || "Geral"}</p>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">Nome do Paciente *</label>
                <input type="text" placeholder="Nome do paciente" value={surveyForm.patientName} onChange={(e) => setSurveyForm({ ...surveyForm, patientName: e.target.value, leadId: "" })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm" />
                {surveyForm.leadId && <p className="text-xs text-emerald-600 mt-0.5">✓ Paciente CRM vinculado</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Setor</label>
                  <select value={surveyForm.sector} onChange={(e) => setSurveyForm({ ...surveyForm, sector: e.target.value as any })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm">
                    <option value="reception">Recepção</option>
                    <option value="clinic">Clínica</option>
                    <option value="ortho">Ortodontia</option>
                    <option value="sales">Comercial</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Nota: {"⭐".repeat(surveyForm.score)}{"☆".repeat(5 - surveyForm.score)}</label>
                  <input type="range" min="1" max="5" value={surveyForm.score} onChange={(e) => setSurveyForm({ ...surveyForm, score: Number(e.target.value) })} className="w-full mt-2" />
                  <div className="flex justify-between text-xs text-slate-400"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">Comentário (opcional)</label>
                <textarea placeholder="O que o paciente disse..." value={surveyForm.comment} onChange={(e) => setSurveyForm({ ...surveyForm, comment: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white text-sm resize-none" />
              </div>
              <button onClick={handleAddSurvey} disabled={!surveyForm.patientName.trim()} className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-2">
                <Star size={16} /> Registrar Pesquisa
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
