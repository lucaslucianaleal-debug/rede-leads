import { useState, useEffect, useMemo, useRef } from "react";
import { CLINICAS, VOUCHERS, useCupons, startSessao, endSessao } from "@/hooks/useCupons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckSquare, Square, Briefcase, User, Phone, Plus, Check, Building2, List, AlertTriangle, LogOut, Clock, CalendarCheck, MessageSquare, X, Trash2, Pencil, Copy } from "lucide-react";
import { getAvailableSlotsForVisita, saveScheduledLead, type SlotInfo } from "@/lib/scheduleHelper";
import { generateAppointmentConfirmationTextForClinic } from "@/lib/whatsapp";
import { db } from "@/lib/firebase";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import { captureCardAsImage } from "@/lib/captureCard";

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const SESSION_KEY = "visita_sessao";

interface SessaoLocal {
  clinicaId: string;
  clinicaLabel: string;
  vendedor: string;
  sessaoId: string;
  horaInicio: string;
  lastActivity: number; // timestamp ms — expira em 12h de inatividade
}

type PageTab = "novo" | "meus";

export default function VisitaComercial() {
  const [sessao, setSessao] = useState<SessaoLocal | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed: SessaoLocal = JSON.parse(raw);
      const TWELVE_H = 12 * 60 * 60 * 1000;
      if (Date.now() - (parsed.lastActivity ?? 0) > TWELVE_H) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return parsed;
    } catch { return null; }
  });
  const step = sessao ? "captura" : "login";

  const [clinicaId, setClinicaId] = useState(CLINICAS[0].id);
  const [vendedor, setVendedor] = useState("");

  const [nome, setNome] = useState("");
  const [estabelecimento, setEstabelecimento] = useState("");
  const [telefone1, setTelefone1] = useState("");
  const [telefone2, setTelefone2] = useState("");
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);
  const [briefing, setBriefing] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [pageTab, setPageTab] = useState<PageTab>("novo");
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  // Agendamento
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null);
  const [agendando, setAgendando] = useState(false);
  const [agendadoStep, setAgendadoStep] = useState<{ slot: SlotInfo; nome: string; telefone: string; abordadora: string; local: string; vouchers: string[]; observacao: string } | null>(null);
  const [agendadoCupomId, setAgendadoCupomId] = useState<string | null>(null);
  const [sendingWhats, setSendingWhats] = useState(false);
  const [selectedContatoDetalhes, setSelectedContatoDetalhes] = useState<typeof cupons[0] | null>(null);
  const contatoDetailsRef = useRef<HTMLDivElement>(null);
  
  // Edit appointment
  const [editingAgendamentoId, setEditingAgendamentoId] = useState<string | null>(null);
  const [editAgendamentoOpen, setEditAgendamentoOpen] = useState(false);
  const [editSlots, setEditSlots] = useState<SlotInfo[]>([]);
  const [editSlotsLoading, setEditSlotsLoading] = useState(false);
  const [editSelectedSlot, setEditSelectedSlot] = useState<SlotInfo | null>(null);
  const [editAgendandoFlag, setEditAgendandoFlag] = useState(false);

  const { cupons, addCupom, updateStatus } = useCupons(sessao?.clinicaId ?? null);

  const meusLeads = useMemo(() =>
    cupons.filter((c) => c.tipo === "visita" && c.sessaoId === sessao?.sessaoId),
    [cupons, sessao]
  );

  useEffect(() => {
    const digits = telefone1.replace(/\D/g, "");
    if (digits.length >= 10) {
      const found = cupons.find((c) => c.telefone1.replace(/\D/g, "") === digits || (c.telefone2 || "").replace(/\D/g, "") === digits);
      setDupWarning(found ? `Já cadastrado: ${found.nome} (${found.dataCupom})` : null);
    } else {
      setDupWarning(null);
    }
  }, [telefone1, cupons]);

  const handleComeçar = async () => {
    if (!vendedor.trim()) { toast.error("Informe seu nome"); return; }
    try {
      const sessaoId = await startSessao(clinicaId, vendedor.trim(), "", "visita");
      const horaInicio = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const nova: SessaoLocal = {
        clinicaId,
        clinicaLabel: CLINICAS.find((c) => c.id === clinicaId)?.label ?? clinicaId,
        vendedor: vendedor.trim(),
        sessaoId,
        horaInicio,
        lastActivity: Date.now(),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(nova));
      setSessao(nova);
    } catch {
      toast.error("Erro ao iniciar sessão. Tente novamente.");
    }
  };

  const handleEncerrar = async () => {
    if (!sessao) return;
    if (!window.confirm("Encerrar sua sessão? Você precisará fazer login novamente.")) return;
    try {
      await endSessao(sessao.clinicaId, sessao.sessaoId);
    } catch {}
    localStorage.removeItem(SESSION_KEY);
    setSessao(null);
    setNome(""); setEstabelecimento(""); setTelefone1(""); setTelefone2(""); setSelectedVouchers([]); setBriefing(""); setLastAdded(null);
  };

  const toggleVoucher = (v: string) =>
    setSelectedVouchers((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  const resetForm = () => {
    setNome(""); setEstabelecimento(""); setTelefone1(""); setTelefone2(""); setSelectedVouchers([]); setBriefing(""); setDupWarning(null);
  };

  const updateActivity = () => {
    setSessao((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, lastActivity: Date.now() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const handleAdicionar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome"); return; }
    if (!estabelecimento.trim()) { toast.error("Informe o estabelecimento"); return; }
    if (!telefone1.trim()) { toast.error("Informe o telefone"); return; }
    if (selectedVouchers.length === 0) { toast.error("Selecione pelo menos um voucher"); return; }
    if (!sessao) return;
    setSaving(true);
    try {
      const data: Parameters<typeof addCupom>[1] = {
        tipo: "visita",
        clinicaId: sessao.clinicaId,
        nome: nome.trim(),
        telefone1: telefone1.replace(/\D/g, ""),
        vouchers: selectedVouchers,
        local: estabelecimento.trim(),
        abordadora: sessao.vendedor,
        sessaoId: sessao.sessaoId,
      };
      const tel2 = telefone2.replace(/\D/g, "");
      if (tel2) data.telefone2 = tel2;
      if (briefing.trim()) data.briefing = briefing.trim();
      await addCupom(sessao.clinicaId, data);
      setLastAdded(nome.trim());
      updateActivity();
      resetForm();
      toast.success(`✅ ${nome.trim()} adicionado!`);
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleAbrirAgendar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome"); return; }
    if (!estabelecimento.trim()) { toast.error("Informe o estabelecimento"); return; }
    if (!telefone1.trim()) { toast.error("Informe o telefone"); return; }
    if (!sessao) return;
    setSelectedSlot(null);
    setSlots([]);
    setAgendarOpen(true);
    setSlotsLoading(true);
    try {
      const available = await getAvailableSlotsForVisita(sessao.clinicaId);
      setSlots(available);
    } catch {
      toast.error("Erro ao buscar horários. Tente novamente.");
      setAgendarOpen(false);
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleConfirmarAgendamento = async () => {
    if (!selectedSlot || !sessao) return;
    setAgendando(true);
    try {
      const cupomData: Parameters<typeof addCupom>[1] = {
        tipo: "visita",
        clinicaId: sessao.clinicaId,
        nome: nome.trim(),
        telefone1: telefone1.replace(/\D/g, ""),
        vouchers: selectedVouchers,
        local: estabelecimento.trim(),
        abordadora: sessao.vendedor,
        sessaoId: sessao.sessaoId,
        dataAgendamento: selectedSlot.dateStr,
      };
      const tel2 = telefone2.replace(/\D/g, "");
      if (tel2) cupomData.telefone2 = tel2;
      if (briefing.trim()) cupomData.briefing = briefing.trim();
      const cupomId = await addCupom(sessao.clinicaId, cupomData, "agendado");
      setAgendadoCupomId(cupomId);
      setLastAdded(nome.trim());
      updateActivity();
      setAgendadoStep({
        slot: selectedSlot,
        nome: nome.trim(),
        telefone: telefone1.replace(/\D/g, ""),
        abordadora: sessao.vendedor,
        local: estabelecimento.trim(),
        vouchers: selectedVouchers,
        observacao: briefing.trim(),
      });
    } catch {
      toast.error("Erro ao agendar. Tente novamente.");
    } finally {
      setAgendando(false);
    }
  };

  const handleEnviarWhatsAgendamento = async () => {
    if (!agendadoStep || !sessao || sendingWhats) return;
    setSendingWhats(true);
    const msg = generateAppointmentConfirmationTextForClinic(
      { id: sessao.clinicaId, name: sessao.clinicaLabel },
      agendadoStep.slot.dateStr,
      agendadoStep.nome,
      agendadoStep.vouchers
    );
    const raw = agendadoStep.telefone;
    const num = raw.startsWith("55") ? raw : `55${raw}`;
    window.open(`whatsapp://send?phone=${num}&text=${encodeURIComponent(msg)}`);
    try {
      await saveScheduledLead(sessao.clinicaId, {
        nome: agendadoStep.nome,
        telefone: agendadoStep.telefone,
        servicos: agendadoStep.vouchers,
        observacao: agendadoStep.observacao,
        abordadora: agendadoStep.abordadora,
        local: agendadoStep.local,
        dataAgendamento: agendadoStep.slot.dateStr,
        fonteLead: "Visita Comercial",
      });
      // Mark the cupom as convertido so ServicosExternos doesn't create a duplicate CRM lead
      if (agendadoCupomId) {
        try { await updateStatus(sessao.clinicaId, agendadoCupomId, "convertido"); } catch {}
      }
      toast.success(`Lead criado no CRM: ${agendadoStep.nome}`);
    } catch (err) {
      console.error("Erro ao salvar lead no CRM:", err);
      toast.error("Erro ao salvar lead no CRM. Verifique a conexão.");
    } finally {
      setSendingWhats(false);
    }
    setAgendadoStep(null);
    setAgendadoCupomId(null);
    setAgendarOpen(false);
    resetForm();
  };

  const handleAbrirEditarAgendamento = async (cupomId: string) => {
    if (!sessao) return;
    setEditingAgendamentoId(cupomId);
    setEditAgendamentoOpen(true);
    setEditSlotsLoading(true);
    try {
      const available = await getAvailableSlotsForVisita(sessao.clinicaId);
      setEditSlots(available);
    } catch {
      toast.error("Erro ao buscar horários. Tente novamente.");
      setEditAgendamentoOpen(false);
    } finally {
      setEditSlotsLoading(false);
    }
  };

  const handleConfirmarEditarAgendamento = async () => {
    if (!editSelectedSlot || !sessao || !editingAgendamentoId) return;
    setEditAgendandoFlag(true);
    try {
      const cupomRef = doc(db, "clinics", sessao.clinicaId, "cupons", editingAgendamentoId);
      await updateDoc(cupomRef, {
        dataAgendamento: editSelectedSlot.dateStr,
        status: "agendado",
      });
      toast.success("Agendamento atualizado com sucesso!");
      setEditAgendamentoOpen(false);
      setEditingAgendamentoId(null);
      setEditSelectedSlot(null);
      setEditSlots([]);
      setSelectedContatoDetalhes(null);
    } catch (err) {
      console.error("Erro ao atualizar agendamento:", err);
      toast.error("Erro ao atualizar agendamento. Tente novamente.");
    } finally {
      setEditAgendandoFlag(false);
    }
  };

  const handlePularWhats = () => {
    setAgendadoStep(null);
    setAgendarOpen(false);
    resetForm();
  };

  if (step === "login") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-2">
              <div className="bg-emerald-100 p-3 rounded-full">
                <Briefcase className="h-8 w-8 text-emerald-700" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Visita Comercial</h1>
            <p className="text-sm text-gray-500">Odontocompany</p>
          </div>

          <div className="space-y-1.5">
            <Label>Clínica</Label>
            <select value={clinicaId} onChange={(e) => setClinicaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              {CLINICAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Seu nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Nome do vendedor" className="pl-9" />
            </div>
          </div>

          <Button className="w-full text-base py-5 bg-emerald-600 hover:bg-emerald-700" onClick={handleComeçar}>
            Começar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 flex flex-col items-center p-4 pb-10">
      {/* Header sessão */}
      <div className="w-full max-w-sm mt-4 mb-4 bg-white/10 backdrop-blur rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="text-white text-sm">
          <div className="font-semibold">{sessao?.vendedor}</div>
          <div className="text-white/70 text-xs">{sessao?.clinicaLabel.replace("Odontocompany ", "")}</div>
          <div className="text-white/50 text-xs flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" /> Início: {sessao?.horaInicio}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white">{meusLeads.length}</div>
          <div className="text-white/70 text-xs">meus leads</div>
        </div>
      </div>

      {/* Abas */}
      <div className="w-full max-w-sm flex rounded-xl overflow-hidden mb-4 bg-white/10">
        <button onClick={() => setPageTab("novo")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${pageTab === "novo" ? "bg-white text-emerald-800" : "text-white/70 hover:text-white"}`}>
          <Plus className="h-4 w-4" /> Novo
        </button>
        <button onClick={() => setPageTab("meus")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${pageTab === "meus" ? "bg-white text-emerald-800" : "text-white/70 hover:text-white"}`}>
          <List className="h-4 w-4" /> Meus leads {meusLeads.length > 0 && `(${meusLeads.length})`}
        </button>
      </div>

      {pageTab === "meus" ? (
        <div className="w-full max-w-sm space-y-2">
          {meusLeads.length === 0 ? (
            <div className="text-center text-white/60 py-10 text-sm">Nenhum lead adicionado ainda.</div>
          ) : (
            meusLeads.map((c) => (
              <div key={c.id} onClick={() => setSelectedContatoDetalhes(c)} className={`bg-white rounded-xl px-4 py-3 space-y-1 ${c.status === "agendado" ? "border-2 border-purple-300" : ""} cursor-pointer hover:shadow-lg transition-shadow`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-800 text-sm truncate">{c.nome}</div>
                    <div className="text-gray-500 text-xs">{c.telefone1} · {c.local}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {c.status === "agendado" ? (
                      <span className="text-xs bg-purple-100 text-purple-800 border border-purple-300 rounded-full px-2 py-0.5 font-medium">Agendado</span>
                    ) : (
                      <div className="text-xs text-gray-400">{c.dataCupom?.slice(11)}</div>
                    )}
                  </div>
                </div>
                {c.dataAgendamento && (
                  <div className="text-xs text-purple-700 bg-purple-50 rounded px-2 py-1 flex items-center gap-1">
                    <CalendarCheck className="h-3 w-3 shrink-0" />
                    {c.dataAgendamento}
                  </div>
                )}
                {c.briefing && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 flex items-start gap-1">
                    <MessageSquare className="h-3 w-3 shrink-0 mt-0.5 text-gray-400" />
                    <span className="line-clamp-2">{c.briefing}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {lastAdded && (
            <div className="w-full max-w-sm mb-3 flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-lg px-3 py-2">
              <Check className="h-4 w-4 text-green-300 shrink-0" />
              <span className="text-green-200 text-sm"><strong>{lastAdded}</strong> salvo!</span>
            </div>
          )}

          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4">
            <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-600" /> Novo Lead
            </h2>

            <div className="space-y-1.5">
              <Label>Nome</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" className="pl-9" autoComplete="off" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Estabelecimento</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={estabelecimento} onChange={(e) => setEstabelecimento(e.target.value)} placeholder="Ex: Empresa X, Comércio Y..." className="pl-9" autoComplete="off" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Telefone 01</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={telefone1} onChange={(e) => setTelefone1(maskPhone(e.target.value))}
                  placeholder="(17) 99999-0000"
                  className={`pl-9 ${dupWarning ? "border-yellow-400 focus-visible:ring-yellow-400" : ""}`}
                  type="tel" inputMode="numeric" />
              </div>
              {dupWarning && (
                <div className="flex items-start gap-1.5 text-xs text-yellow-700 bg-yellow-50 border border-yellow-300 rounded px-2.5 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{dupWarning}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Telefone 02 <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={telefone2} onChange={(e) => setTelefone2(maskPhone(e.target.value))} placeholder="(17) 99999-0000" className="pl-9" type="tel" inputMode="numeric" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Voucher(s) de interesse</Label>
              <div className="space-y-2">
                {VOUCHERS.map((v) => {
                  const checked = selectedVouchers.includes(v);
                  return (
                    <button key={v} type="button" onClick={() => toggleVoucher(v)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-colors ${checked ? "bg-emerald-50 border-emerald-400 text-emerald-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"}`}>
                      {checked ? <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" /> : <Square className="h-4 w-4 text-gray-400 shrink-0" />}
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Briefing <span className="text-gray-400 font-normal">(observações para a clínica)</span></Label>
              <Textarea value={briefing} onChange={(e) => setBriefing(e.target.value)}
                placeholder="Ex: Cliente interessado, pediu para ligar após as 18h..."
                className="min-h-[80px] text-sm resize-none" />
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 py-5 text-base bg-emerald-600 hover:bg-emerald-700" onClick={handleAdicionar} disabled={saving || agendando}>
                {saving ? "Salvando..." : "+ Salvar Lead"}
              </Button>
              <Button className="flex-1 py-5 text-base bg-purple-700 hover:bg-purple-800" onClick={handleAbrirAgendar} disabled={saving || agendando}>
                <CalendarCheck className="h-4 w-4 mr-1.5" /> Agendar
              </Button>
            </div>
          </div>
        </>
      )}

      <button onClick={handleEncerrar} className="mt-6 flex items-center gap-1.5 text-white/50 text-xs hover:text-white/80 transition-colors">
        <LogOut className="h-3.5 w-3.5" /> Encerrar sessão
      </button>

      {/* Modal de agendamento */}
      <Dialog open={agendarOpen} onOpenChange={(o) => { if (!o) { setAgendarOpen(false); setAgendadoStep(null); } }}>
        <DialogContent className="max-w-sm max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-purple-600" />
              {agendadoStep ? "✅ Agendado!" : `Escolha um horário para ${nome.trim() || "o cliente"}`}
            </DialogTitle>
          </DialogHeader>

          {agendadoStep ? (
            <div className="flex flex-col gap-4 py-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-1">
                <p className="font-semibold text-green-800">{agendadoStep.nome}</p>
                <p className="text-sm text-green-700">{agendadoStep.slot.dayLabel} às {agendadoStep.slot.hourLabel}</p>
              </div>
              <p className="text-sm text-gray-500 text-center">Deseja enviar a confirmação por WhatsApp agora?</p>
              <Button onClick={handleEnviarWhatsAgendamento} disabled={sendingWhats} className="bg-green-600 hover:bg-green-700 text-white gap-2 w-full">
                <MessageSquare className="h-4 w-4" />
                {sendingWhats ? "Salvando..." : "Enviar confirmação WhatsApp"}
              </Button>
              <button onClick={handlePularWhats} className="text-xs text-gray-400 hover:text-gray-600 text-center">
                Pular, enviar depois pelo painel
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto pr-1">
                {slotsLoading ? (
                  <div className="text-center py-10 text-gray-500 text-sm">Buscando horários disponíveis...</div>
                ) : slots.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-sm">Nenhum horário disponível nos próximos dias.</div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(
                      slots.reduce<Record<string, SlotInfo[]>>((acc, s) => {
                        if (!acc[s.dayLabel]) acc[s.dayLabel] = [];
                        acc[s.dayLabel].push(s);
                        return acc;
                      }, {})
                    ).map(([day, daySlots]) => (
                      <div key={day}>
                        <div className="text-sm font-semibold text-gray-700 mb-2">{day}</div>
                        <div className="flex flex-wrap gap-2">
                          {daySlots.map((slot) => (
                            <button key={slot.dateStr} onClick={() => setSelectedSlot(slot)}
                              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                selectedSlot?.dateStr === slot.dateStr
                                  ? "bg-purple-700 text-white border-purple-700"
                                  : "bg-white text-gray-700 border-gray-300 hover:border-purple-400"
                              }`}>
                              {slot.hourLabel}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedSlot && (
                <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-sm text-purple-800 font-medium">
                  Selecionado: {selectedSlot.dayLabel} às {selectedSlot.hour}h
                </div>
              )}

              <DialogFooter className="gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={() => setAgendarOpen(false)}>Cancelar</Button>
                <Button size="sm" disabled={!selectedSlot || agendando} onClick={handleConfirmarAgendamento}
                  className="bg-purple-700 hover:bg-purple-800 text-white gap-2">
                  <CalendarCheck className="h-4 w-4" />
                  {agendando ? "Agendando..." : "Confirmar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal para editar agendamento */}
      <Dialog open={editAgendamentoOpen} onOpenChange={(o) => { if (!o) { setEditAgendamentoOpen(false); setEditSelectedSlot(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-orange-600" />
              Alterar Agendamento
            </DialogTitle>
          </DialogHeader>

          {editSlotsLoading ? (
            <div className="text-center text-gray-500 text-sm py-8">Buscando horários disponíveis...</div>
          ) : editSlots.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">Nenhum horário disponível nos próximos dias.</div>
          ) : (
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-3">
              {editSlots.map((slot) => (
                <button
                  key={`${slot.dateStr}-${slot.hour}-${slot.minute}`}
                  onClick={() => setEditSelectedSlot(slot)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                    editSelectedSlot?.dateStr === slot.dateStr
                      ? "border-orange-500 bg-orange-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-medium text-sm text-gray-800">{slot.dayLabel}</div>
                  <div className="text-sm text-gray-600 mt-1">{slot.hourLabel}</div>
                </button>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setEditAgendamentoOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={!editSelectedSlot || editAgendandoFlag} onClick={handleConfirmarEditarAgendamento}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
              <CalendarCheck className="h-4 w-4" />
              {editAgendandoFlag ? "Atualizando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de detalhes do lead */}
      <Dialog open={!!selectedContatoDetalhes} onOpenChange={(o) => { if (!o) setSelectedContatoDetalhes(null); }}>
        <DialogContent className="max-w-sm max-h-[90vh] flex flex-col" ref={contatoDetailsRef}>
          {selectedContatoDetalhes && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between w-full">
                  <DialogTitle className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-emerald-600" />
                    {selectedContatoDetalhes.nome}
                  </DialogTitle>
                  <button onClick={() => setSelectedContatoDetalhes(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </DialogHeader>

              {/* Conteúdo principal (scrollable) */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-3">
                {/* Telefone */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Telefone</p>
                  <a href={`tel:${selectedContatoDetalhes.telefone1}`} className="text-sm text-blue-600 hover:underline">
                    {selectedContatoDetalhes.telefone1}
                  </a>
                  {selectedContatoDetalhes.telefone2 && (
                    <a href={`tel:${selectedContatoDetalhes.telefone2}`} className="block text-sm text-blue-600 hover:underline">
                      {selectedContatoDetalhes.telefone2}
                    </a>
                  )}
                </div>

                {/* Estabelecimento / Local */}
                {selectedContatoDetalhes.local && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Local</p>
                    <p className="text-sm text-gray-800">{selectedContatoDetalhes.local}</p>
                  </div>
                )}

                {/* Vouchers / Serviços */}
                {selectedContatoDetalhes.vouchers && selectedContatoDetalhes.vouchers.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Serviços</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedContatoDetalhes.vouchers.map((v, idx) => (
                        <span key={idx} className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs rounded-full font-medium">
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data e Hora do Agendamento */}
                {selectedContatoDetalhes.dataAgendamento && (
                  <div className="bg-purple-50 rounded-lg p-3 space-y-1 border border-purple-200">
                    <p className="text-xs text-purple-600 font-medium uppercase tracking-wide flex items-center gap-1">
                      <CalendarCheck className="h-3.5 w-3.5" /> Agendamento
                    </p>
                    <p className="text-sm text-purple-900 font-semibold">{selectedContatoDetalhes.dataAgendamento}</p>
                  </div>
                )}

                {/* Briefing / Observação */}
                {selectedContatoDetalhes.briefing && (
                  <div className="bg-blue-50 rounded-lg p-3 space-y-1 border border-blue-200">
                    <p className="text-xs text-blue-600 font-medium uppercase tracking-wide flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" /> Briefing
                    </p>
                    <p className="text-sm text-blue-900">{selectedContatoDetalhes.briefing}</p>
                  </div>
                )}

                {/* Abordadora */}
                {selectedContatoDetalhes.abordadora && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Abordadora</p>
                    <p className="text-sm text-gray-800">{selectedContatoDetalhes.abordadora}</p>
                  </div>
                )}

                {/* Data Cupom */}
                {selectedContatoDetalhes.dataCupom && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Data do Cadastro</p>
                    <p className="text-sm text-gray-800">{selectedContatoDetalhes.dataCupom}</p>
                  </div>
                )}
              </div>

              {/* Botões (fixos no rodapé) */}
              <div className="border-t pt-3 mt-3 space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const url = `https://wa.me/55${selectedContatoDetalhes.telefone1.replace(/\D/g, "")}`;
                      window.open(url, "_blank");
                    }}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    <MessageSquare className="h-4 w-4" /> WhatsApp
                  </button>
                  <button
                    onClick={() => window.open(`tel:${selectedContatoDetalhes.telefone1}`)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Phone className="h-4 w-4" /> Ligar
                  </button>
                  <button
                    onClick={() => {
                      const cardText = `👤 ${selectedContatoDetalhes.nome}\n📱 ${selectedContatoDetalhes.telefone1}${selectedContatoDetalhes.telefone2 ? `\n📱 ${selectedContatoDetalhes.telefone2}` : ""}${selectedContatoDetalhes.vouchers?.length ? `\n🏥 ${selectedContatoDetalhes.vouchers.join(", ")}` : ""}${selectedContatoDetalhes.local ? `\n📍 ${selectedContatoDetalhes.local}` : ""}${selectedContatoDetalhes.dataAgendamento ? `\n📅 ${selectedContatoDetalhes.dataAgendamento}` : ""}${selectedContatoDetalhes.briefing ? `\n💬 ${selectedContatoDetalhes.briefing}` : ""}`;
                      navigator.clipboard.writeText(cardText);
                      toast.success("Card copiado!");
                    }}
                    className="flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    title="Copiar card para enviar no WhatsApp"
                  >
                    <Copy className="h-4 w-4" /> Copiar
                  </button>
                  <button
                    onClick={() => captureCardAsImage({
                      nome: selectedContatoDetalhes.nome,
                      telefone: selectedContatoDetalhes.telefone1,
                      telefone2: selectedContatoDetalhes.telefone2,
                      servico: selectedContatoDetalhes.vouchers?.join(", "),
                      local: selectedContatoDetalhes.local,
                      agendamento: selectedContatoDetalhes.dataAgendamento,
                      briefing: selectedContatoDetalhes.briefing,
                    })}
                    className="flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    title="Copiar screenshot para enviar no WhatsApp"
                  >
                    📸 Imagem
                  </button>
                </div>
                {selectedContatoDetalhes.dataAgendamento && (
                  <button
                    onClick={() => handleAbrirEditarAgendamento(selectedContatoDetalhes.id)}
                    className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Pencil className="h-4 w-4" /> Editar Agendamento
                  </button>
                )}
                <button
                  onClick={async () => {
                    try {
                      await saveScheduledLead(sessao!.clinicaId, {
                        nome: selectedContatoDetalhes.nome,
                        telefone: selectedContatoDetalhes.telefone1.replace(/\D/g, ""),
                        servicos: selectedContatoDetalhes.vouchers || [],
                        observacao: selectedContatoDetalhes.briefing || "",
                        abordadora: selectedContatoDetalhes.abordadora || sessao!.vendedor,
                        local: selectedContatoDetalhes.local || "",
                        dataAgendamento: selectedContatoDetalhes.dataAgendamento || "",
                        fonteLead: "Visita Comercial",
                      });
                      if (selectedContatoDetalhes.id) {
                        await updateStatus(sessao!.clinicaId, selectedContatoDetalhes.id, "convertido");
                      }
                      toast.success(`Lead enviado para clínica: ${selectedContatoDetalhes.nome}`);
                      setSelectedContatoDetalhes(null);
                    } catch (err) {
                      toast.error("Erro ao converter em lead");
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <Check className="h-4 w-4" /> Converter em Lead
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Excluir ${selectedContatoDetalhes.nome}?`)) return;
                    try {
                      await deleteDoc(doc(db, "clinics", sessao!.clinicaId, "cupons", selectedContatoDetalhes.id));
                      toast.success("Lead removido");
                      setSelectedContatoDetalhes(null);
                    } catch (err) {
                      toast.error("Erro ao excluir lead");
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  <Trash2 className="h-4 w-4" /> Excluir Lead
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

