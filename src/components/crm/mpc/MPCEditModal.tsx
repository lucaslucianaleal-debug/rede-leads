import React, { useState, useMemo } from "react";
import { X, Plus, Trash2, Edit2, Search } from "lucide-react";
import { useMPCDataStore, MPCStore } from "@/hooks/useMPCDataStore";
import { useLeads } from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";

type EditModalProps = {
  isOpen: boolean;
  onClose: () => void;
  clinicId: string | null;
};

export default function MPCEditModal({ isOpen, onClose, clinicId }: EditModalProps) {
  const { store, addDentist, updateDentist, removeDentist, recordAppointment, addSurvey, setStore } = useMPCDataStore(clinicId || "demo");
  const { allLeads } = useLeads();
  const { currentClinic } = useAuth();
  
  const [tab, setTab] = useState<"dentistas" | "atendimentos" | "satisfacao">("dentistas");
  const [dentistForm, setDentistForm] = useState({ name: "", specialty: "", dailyTarget: 10, workDays: [1, 2, 3, 4, 5, 6] as number[], isOrcamentista: true });
  const [editingId, setEditingId] = useState<string | null>(null);

  const weekdayOptions = [
    { value: 1, label: "Seg" },
    { value: 2, label: "Ter" },
    { value: 3, label: "Qua" },
    { value: 4, label: "Qui" },
    { value: 5, label: "Sex" },
    { value: 6, label: "Sáb" },
    { value: 0, label: "Dom" },
  ];

  const normalizeWorkDays = (days: any) => {
    const arr = Array.isArray(days) ? days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    const unique = Array.from(new Set(arr)).sort((a, b) => a - b);
    return unique.length > 0 ? unique : [1, 2, 3, 4, 5, 6];
  };

  const toggleDentistWorkDay = (day: number) => {
    setDentistForm((prev) => {
      const exists = prev.workDays.includes(day);
      const next = exists ? prev.workDays.filter((d) => d !== day) : [...prev.workDays, day];
      return { ...prev, workDays: next.sort((a, b) => a - b) };
    });
  };
  
  // Busca para atendimentos
  const [appointmentSearchQuery, setAppointmentSearchQuery] = useState("");
  const [showAppointmentSearch, setShowAppointmentSearch] = useState(false);
  
  const [appointmentForm, setAppointmentForm] = useState({
    dentistId: "",
    patientName: "",
    patientId: "",
    status: "attended" as "scheduled" | "confirmed" | "attended",
  });
  const [surveyForm, setSurveyForm] = useState({
    sector: "clinic" as "reception" | "clinic" | "ortho" | "sales",
    score: 5,
    comment: "",
  });

  // Filtrar leads para busca de atendimentos
  const filteredLeads = useMemo(() => {
    if (!appointmentSearchQuery.trim()) return [];
    const query = appointmentSearchQuery.toLowerCase();
    return allLeads.filter(lead =>
      lead.nome.toLowerCase().includes(query) ||
      lead.telefone.includes(query)
    ).slice(0, 8);
  }, [appointmentSearchQuery, allLeads]);

  if (!isOpen) return null;

  const handleAddDentist = () => {
    if (!dentistForm.name.trim()) return;
    if (dentistForm.workDays.length === 0) return;
    if (editingId) {
      updateDentist(editingId, {
        name: dentistForm.name,
        specialty: dentistForm.specialty,
        dailyTarget: dentistForm.dailyTarget,
        workDays: dentistForm.workDays,
        isOrcamentista: dentistForm.isOrcamentista,
      });
      setEditingId(null);
    } else {
      addDentist({
        name: dentistForm.name,
        specialty: dentistForm.specialty,
        dailyTarget: dentistForm.dailyTarget,
        workDays: dentistForm.workDays,
        isOrcamentista: dentistForm.isOrcamentista,
      });
    }
    setDentistForm({ name: "", specialty: "", dailyTarget: 10, workDays: [1, 2, 3, 4, 5, 6], isOrcamentista: true });
  };

  const handleEditDentist = (id: string) => {
    const d = store.dentists.find(x => x.id === id);
    if (d) {
      setDentistForm({
        name: d.name,
        specialty: d.specialty || "",
        dailyTarget: d.dailyTarget,
        workDays: normalizeWorkDays((d as any).workDays),
        isOrcamentista: (d as any).isOrcamentista !== false,
      });
      setEditingId(id);
    }
  };

  const handleAddAppointment = () => {
    if (!appointmentForm.dentistId || !appointmentForm.patientName.trim()) return;
    recordAppointment({
      id: `apt_${Date.now()}`,
      dentistId: appointmentForm.dentistId,
      patientName: appointmentForm.patientName,
      status: appointmentForm.status,
      attendedAt: new Date().toISOString(),
    });
    setAppointmentForm({ dentistId: "", patientName: "", patientId: "", status: "attended" });
    setAppointmentSearchQuery("");
    setShowAppointmentSearch(false);
  };

  const selectPatientForAppointment = (leadId: string) => {
    const lead = allLeads.find(l => l.id === leadId);
    if (lead) {
      setAppointmentForm({
        ...appointmentForm,
        patientName: lead.nome,
        patientId: lead.id,
      });
      setAppointmentSearchQuery("");
      setShowAppointmentSearch(false);
    }
  };

  const handleAddSurvey = () => {
    addSurvey({
      id: `survey_${Date.now()}`,
      sector: surveyForm.sector,
      score: surveyForm.score,
      comment: surveyForm.comment,
      createdAt: new Date().toISOString(),
    });
    setSurveyForm({ sector: "clinic", score: 5, comment: "" });
  };

  const handleReset = () => {
    if (window.confirm("Resetar todos os dados do MPC? Esta ação não pode ser desfeita.")) {
      setStore({
        dentists: [],
        appointments: [],
        budgets: [],
        surveys: [],
        averageTicket: 500,
      });
    }
  };

  const handleUpdateTicket = (value: number) => {
    setStore({ ...store, averageTicket: value });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-slate-900">Editar Dados MPC</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={24} className="text-slate-600" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b px-6 pt-4 sticky top-16 bg-white">
          <div className="flex gap-4">
            {["dentistas", "atendimentos", "satisfacao"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`pb-2 px-2 font-medium border-b-2 transition-colors ${
                  tab === t
                    ? "text-slate-900 border-slate-900"
                    : "text-slate-600 border-transparent hover:text-slate-900"
                }`}
              >
                {t === "dentistas" && "👨‍⚕️ Dentistas"}
                {t === "atendimentos" && "📅 Atendimentos"}
                {t === "satisfacao" && "⭐ Satisfação"}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Ticket Médio */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Ticket Médio (R$)
            </label>
            <input
              type="number"
              value={store.averageTicket}
              onChange={(e) => handleUpdateTicket(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          {/* TAB: Dentistas */}
          {tab === "dentistas" && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-900">
                  {editingId ? "Editar Dentista" : "Adicionar Dentista"}
                </h3>
                
                <input
                  type="text"
                  placeholder="Nome do dentista"
                  value={dentistForm.name}
                  onChange={(e) => setDentistForm({ ...dentistForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
                <input
                  type="text"
                  placeholder="Especialidade (ex: Geral, Implante, Ortodontia)"
                  value={dentistForm.specialty}
                  onChange={(e) => setDentistForm({ ...dentistForm, specialty: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Meta Diária</label>
                  <input
                    type="number"
                    min="1"
                    value={dentistForm.dailyTarget}
                    onChange={(e) => setDentistForm({ ...dentistForm, dailyTarget: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Dias de atendimento</label>
                  <div className="grid grid-cols-7 gap-1">
                    {weekdayOptions.map((day) => (
                      <label key={day.value} className="flex items-center gap-1 text-[11px] bg-white border border-slate-200 rounded px-1.5 py-1">
                        <input
                          type="checkbox"
                          checked={dentistForm.workDays.includes(day.value)}
                          onChange={() => toggleDentistWorkDay(day.value)}
                        />
                        <span>{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Perfil de orçamento</label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={dentistForm.isOrcamentista}
                      onChange={(e) => setDentistForm({ ...dentistForm, isOrcamentista: e.target.checked })}
                    />
                    Dentista orçamentista
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddDentist}
                    disabled={!dentistForm.name.trim() || dentistForm.workDays.length === 0}
                    className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800"
                  >
                    {editingId ? "Atualizar" : "Adicionar"}
                  </button>
                  {editingId && (
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setDentistForm({ name: "", specialty: "", dailyTarget: 10, workDays: [1, 2, 3, 4, 5, 6], isOrcamentista: true });
                      }}
                      className="flex-1 px-4 py-2 border border-slate-300 text-slate-900 rounded-lg font-medium hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              {/* Lista de Dentistas */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Lista de Dentistas</h3>
                {store.dentists.length === 0 ? (
                  <p className="text-slate-600 text-sm">Nenhum dentista cadastrado</p>
                ) : (
                  <div className="space-y-2">
                    {store.dentists.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-slate-50"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{d.name}</p>
                          <p className="text-xs text-slate-600">
                            {d.specialty} • Meta: {d.dailyTarget} pac/dia • Dias: {normalizeWorkDays((d as any).workDays).map((wd) => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][wd]).join(", ")} • Perfil: {(d as any).isOrcamentista === false ? "somente execução" : "orçamentista"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditDentist(d.id)}
                            className="p-2 hover:bg-blue-100 rounded text-blue-600"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => removeDentist(d.id)}
                            className="p-2 hover:bg-red-100 rounded text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Atendimentos */}
          {tab === "atendimentos" && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-900">Registrar Atendimento</h3>
                
                {store.dentists.length === 0 ? (
                  <p className="text-slate-600 text-sm">
                    ⚠️ Adicione dentistas primeiro na aba "Dentistas"
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-medium text-slate-900 mb-1 block">
                        Dentista
                      </label>
                      <select
                        value={appointmentForm.dentistId}
                        onChange={(e) =>
                          setAppointmentForm({ ...appointmentForm, dentistId: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                      >
                        <option value="">Selecione um dentista</option>
                        {store.dentists.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Busca de Paciente para Atendimento */}
                    <div className="relative">
                      <label className="text-xs font-medium text-slate-900 mb-1 block">
                        🔍 Paciente - Buscar Existente
                      </label>
                      <div className="flex items-center gap-2">
                        <Search size={16} className="text-slate-400" />
                        <input
                          type="text"
                          placeholder="Digite nome ou telefone do paciente..."
                          value={appointmentSearchQuery}
                          onChange={(e) => {
                            setAppointmentSearchQuery(e.target.value);
                            setShowAppointmentSearch(true);
                          }}
                          onFocus={() => setShowAppointmentSearch(true)}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                        />
                      </div>
                      
                      {/* Resultados da busca */}
                      {showAppointmentSearch && appointmentSearchQuery.trim() && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-10">
                          {filteredLeads.length === 0 ? (
                            <div className="p-3 text-sm text-slate-600">Nenhum paciente encontrado</div>
                          ) : (
                            <div className="max-h-48 overflow-y-auto">
                              {filteredLeads.map((lead) => (
                                <button
                                  key={lead.id}
                                  onClick={() => selectPatientForAppointment(lead.id)}
                                  className="w-full text-left px-3 py-2 hover:bg-slate-100 border-b border-slate-100 last:border-b-0"
                                >
                                  <p className="font-medium text-slate-900 text-sm">{lead.nome}</p>
                                  <p className="text-xs text-slate-600">{lead.telefone} • {lead.servicoProcurado || "Geral"}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Campo de nome do paciente (preenchido ou manual) */}
                    <div>
                      <label className="text-xs font-medium text-slate-900 mb-1 block">
                        Nome do Paciente
                      </label>
                      <input
                        type="text"
                        placeholder="Nome do paciente (preenchido pela busca ou manual)"
                        value={appointmentForm.patientName}
                        onChange={(e) =>
                          setAppointmentForm({ ...appointmentForm, patientName: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                      />
                      {appointmentForm.patientId && (
                        <p className="text-xs text-emerald-600 mt-1">✓ Paciente CRM vinculado</p>
                      )}
                    </div>
                    
                    <div>
                      <label className="text-xs font-medium text-slate-900 mb-1 block">
                        Status
                      </label>
                      <select
                        value={appointmentForm.status}
                        onChange={(e) =>
                          setAppointmentForm({
                            ...appointmentForm,
                            status: e.target.value as any,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                      >
                        <option value="scheduled">Agendado</option>
                        <option value="confirmed">Confirmado</option>
                        <option value="attended">Atendido</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAddAppointment}
                      className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 flex items-center justify-center gap-2"
                    >
                      <Plus size={18} />
                      Registrar Atendimento
                    </button>
                  </>
                )}
              </div>

              {/* Atendimentos Registrados */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">
                  Atendimentos ({store.appointments.length})
                </h3>
                {store.appointments.length === 0 ? (
                  <p className="text-slate-600 text-sm">Nenhum atendimento registrado</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {store.appointments.map((a, idx) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-slate-50"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{a.patientName}</p>
                          <p className="text-xs text-slate-600">
                            {store.dentists.find((d) => d.id === a.dentistId)?.name || "Dentista"} •{" "}
                            {a.status === "attended"
                              ? "✅ Atendido"
                              : a.status === "confirmed"
                              ? "📋 Confirmado"
                              : "📅 Agendado"}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const newAppts = store.appointments.filter((_, i) => i !== idx);
                            setStore({ ...store, appointments: newAppts });
                          }}
                          className="p-2 hover:bg-red-100 rounded text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Satisfação */}
          {tab === "satisfacao" && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-900">Adicionar Pesquisa de Satisfação</h3>
                <div>
                  <label className="text-xs font-medium text-slate-900 mb-1 block">
                    Setor
                  </label>
                  <select
                    value={surveyForm.sector}
                    onChange={(e) =>
                      setSurveyForm({
                        ...surveyForm,
                        sector: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  >
                    <option value="reception">Recepção</option>
                    <option value="clinic">Clínica</option>
                    <option value="ortho">Ortodontia</option>
                    <option value="sales">Comercial</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-900 mb-1 block">
                    Classificação: {surveyForm.score}/5
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={surveyForm.score}
                    onChange={(e) => setSurveyForm({ ...surveyForm, score: Number(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-slate-600 mt-1">
                    <span>🟥 Péssimo</span>
                    <span>🟨 Ruim</span>
                    <span>🟩 Neutro</span>
                    <span>🟩 Bom</span>
                    <span>🟩 Excelente</span>
                  </div>
                </div>
                <textarea
                  placeholder="Comentário (opcional)"
                  value={surveyForm.comment}
                  onChange={(e) => setSurveyForm({ ...surveyForm, comment: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                />
                <button
                  onClick={handleAddSurvey}
                  className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 flex items-center justify-center gap-2"
                >
                  <Plus size={18} />
                  Registrar Pesquisa
                </button>
              </div>

              {/* Pesquisas Registradas */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">
                  Pesquisas ({store.surveys.length})
                </h3>
                {store.surveys.length === 0 ? (
                  <p className="text-slate-600 text-sm">Nenhuma pesquisa registrada</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {store.surveys.map((s, idx) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-slate-50"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {s.sector === "reception"
                              ? "Recepção"
                              : s.sector === "clinic"
                              ? "Clínica"
                              : s.sector === "ortho"
                              ? "Ortodontia"
                              : "Comercial"}
                          </p>
                          <p className="text-xs text-slate-600">
                            {"⭐".repeat(s.score)}{"☆".repeat(5 - s.score)} • {s.comment || "Sem comentário"}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const newSurveys = store.surveys.filter((_, i) => i !== idx);
                            setStore({ ...store, surveys: newSurveys });
                          }}
                          className="p-2 hover:bg-red-100 rounded text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6 flex gap-3 sticky bottom-0 bg-white">
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50"
          >
            Resetar Tudo
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800"
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
