import { useState, useEffect, useMemo, useRef } from "react";
import { CLINICAS, useCupons, startSessao, endSessao } from "@/hooks/useCupons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserCheck, MapPin, User, Phone, Plus, Check, List, AlertTriangle, LogOut, Clock, MessageSquare, X, CalendarCheck, Map, Navigation, Route, Pencil, Trash2, Copy } from "lucide-react";
import { getAvailableSlots, saveScheduledLead, type SlotInfo } from "@/lib/scheduleHelper";
import { generateAppointmentConfirmationTextForClinic } from "@/lib/whatsapp";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { MapaRota } from "@/components/MapaRota";
import { format } from "date-fns";
import html2canvas from "html2canvas";

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const SESSION_KEY = "promotora_sessao";

interface SessaoLocal {
  clinicaId: string;
  clinicaLabel: string;
  abordadora: string;
  local: string;
  sessaoId: string;
  horaInicio: string;
  lastActivity: number; // timestamp ms — expira em 12h de inatividade
}

type PageTab = "novo" | "meus" | "mapa";

export default function Promotora() {
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

  // Login fields
  const [clinicaId, setClinicaId] = useState(CLINICAS[0].id);
  const [abordadora, setAbordadora] = useState("");
  const [local, setLocal] = useState("");

  // Contact fields
  const [nome, setNome] = useState("");
  const [telefone1, setTelefone1] = useState("");
  const [telefone2, setTelefone2] = useState("");
  const [observacao, setObservacao] = useState("");
  const [servicosSelecionados, setServicosSelecionados] = useState<string[]>([]);
  const SERVICOS_PROMOTORA = ["Avaliação", "Limpeza Profilaxia", "Clareamento", "Ortodontia", "Implante", "Outro"];
  const toggleServico = (s: string) => setServicosSelecionados((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
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

  const { cupons, addCupom, updateStatus } = useCupons(sessao?.clinicaId ?? null);

  const meusContatos = useMemo(() =>
    cupons.filter((c) => c.tipo === "promotora" && c.sessaoId === sessao?.sessaoId),
    [cupons, sessao]
  );

  // Rota do dia para esta promotora
  interface RotaDoDia {
    id: string;
    nome: string;
    data: string;
    waypoints: { lat: number; lng: number }[];
  }
  const [rotaDoDia, setRotaDoDia] = useState<RotaDoDia | null>(null);
  const [rotaLoading, setRotaLoading] = useState(false);

  // Editar lead
  interface EditLeadState { id: string; nome: string; telefone1: string; telefone2: string; observacao: string; }
  const [editLead, setEditLead] = useState<EditLeadState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!sessao) { setRotaDoDia(null); return; }
    setRotaLoading(true);
    const today = format(new Date(), "dd/MM/yyyy");
    getDocs(
      query(
        collection(db, "clinics", sessao.clinicaId, "rotas"),
        where("abordadora", "==", sessao.abordadora),
        where("data", "==", today)
      )
    )
      .then((snap) => {
        if (!snap.empty) {
          const d = snap.docs[0];
          setRotaDoDia({ id: d.id, ...(d.data() as Omit<RotaDoDia, "id">) });
        } else {
          setRotaDoDia(null);
        }
      })
      .catch(() => setRotaDoDia(null))
      .finally(() => setRotaLoading(false));
  }, [sessao]);

  useEffect(() => {
    const digits = telefone1.replace(/\D/g, "");
    if (digits.length >= 10) {
      const found = cupons.find(
        (c) =>
          c.telefone1.replace(/\D/g, "") === digits ||
          (c.telefone2 || "").replace(/\D/g, "") === digits
      );
      setDupWarning(found ? `Já cadastrado: ${found.nome} (${found.dataCupom})` : null);
    } else {
      setDupWarning(null);
    }
  }, [telefone1, cupons]);

  const handleComeçar = async () => {
    if (!abordadora.trim()) { toast.error("Informe seu nome"); return; }
    if (!local.trim()) { toast.error("Informe o local"); return; }
    try {
      const sessaoId = await startSessao(clinicaId, abordadora.trim(), local.trim(), "promotora");
      const horaInicio = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const nova: SessaoLocal = {
        clinicaId,
        clinicaLabel: CLINICAS.find((c) => c.id === clinicaId)?.label ?? clinicaId,
        abordadora: abordadora.trim(),
        local: local.trim(),
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
    setNome(""); setTelefone1(""); setTelefone2(""); setObservacao(""); setLastAdded(null);
  };

  const resetForm = () => {
    setNome(""); setTelefone1(""); setTelefone2(""); setObservacao(""); setServicosSelecionados([]); setDupWarning(null);
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
    if (!telefone1.trim()) { toast.error("Informe o telefone"); return; }
    if (!sessao) return;
    setSaving(true);
    try {
      const data: Parameters<typeof addCupom>[1] = {
        tipo: "promotora",
        clinicaId: sessao.clinicaId,
        nome: nome.trim(),
        telefone1: telefone1.replace(/\D/g, ""),
        vouchers: servicosSelecionados,
        local: sessao.local,
        abordadora: sessao.abordadora,
        sessaoId: sessao.sessaoId,
      };
      const tel2 = telefone2.replace(/\D/g, "");
      if (tel2) data.telefone2 = tel2;
      if (observacao.trim()) data.briefing = observacao.trim();
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
    if (!telefone1.trim()) { toast.error("Informe o telefone"); return; }
    if (!sessao) return;
    setSelectedSlot(null);
    setSlots([]);
    setAgendarOpen(true);
    setSlotsLoading(true);
    try {
      const available = await getAvailableSlots(sessao.clinicaId);
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
        tipo: "promotora",
        clinicaId: sessao.clinicaId,
        nome: nome.trim(),
        telefone1: telefone1.replace(/\D/g, ""),
        vouchers: servicosSelecionados,
        local: sessao.local,
        abordadora: sessao.abordadora,
        sessaoId: sessao.sessaoId,
        dataAgendamento: selectedSlot.dateStr,
      };
      const tel2 = telefone2.replace(/\D/g, "");
      if (tel2) cupomData.telefone2 = tel2;
      if (observacao.trim()) cupomData.briefing = observacao.trim();
      const cupomId = await addCupom(sessao.clinicaId, cupomData, "agendado");
      setAgendadoCupomId(cupomId);
      setLastAdded(nome.trim());
      updateActivity();
      setAgendadoStep({
        slot: selectedSlot,
        nome: nome.trim(),
        telefone: telefone1.replace(/\D/g, ""),
        abordadora: sessao.abordadora,
        local: sessao.local,
        vouchers: servicosSelecionados,
        observacao: observacao.trim(),
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
        fonteLead: "Promotora",
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

  const handlePularWhats = () => {
    setAgendadoStep(null);
    setAgendarOpen(false);
    resetForm();
  };

  const handleSaveEdit = async () => {
    if (!editLead || !sessao) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, "clinics", sessao.clinicaId, "cupons", editLead.id), {
        nome: editLead.nome.trim(),
        telefone1: editLead.telefone1.replace(/\D/g, ""),
        telefone2: editLead.telefone2.replace(/\D/g, ""),
        briefing: editLead.observacao.trim(),
      });
      toast.success("Lead atualizado!");
      setEditLead(null);
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!sessao) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "clinics", sessao.clinicaId, "cupons", id));
      toast.success("Lead removido.");
      setDeleteConfirmId(null);
    } catch {
      toast.error("Erro ao excluir.");
    } finally {
      setDeleting(false);
    }
  };

  if (step === "login") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-900 via-rose-800 to-fuchsia-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-2">
              <div className="bg-pink-100 p-3 rounded-full">
                <UserCheck className="h-8 w-8 text-pink-700" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Promotora</h1>
            <p className="text-sm text-gray-500">Odontocompany</p>
          </div>

          <div className="space-y-1.5">
            <Label>Clínica</Label>
            <select
              value={clinicaId}
              onChange={(e) => setClinicaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
            >
              {CLINICAS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Seu nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={abordadora} onChange={(e) => setAbordadora(e.target.value)} placeholder="Nome da promotora" className="pl-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Local de abordagem</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex: Praça Central, Shopping..." className="pl-9" />
            </div>
          </div>

          <Button className="w-full text-base py-5 bg-pink-700 hover:bg-pink-800" onClick={handleComeçar}>
            Começar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-900 via-rose-800 to-fuchsia-900 flex flex-col items-center p-4 pb-10">
      {/* Header sessão */}
      <div className="w-full max-w-sm mt-4 mb-4 bg-white/10 backdrop-blur rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="text-white text-sm">
          <div className="font-semibold">{sessao?.abordadora}</div>
          <div className="text-white/70 text-xs flex items-center gap-1">
            <MapPin className="h-3 w-3" />{sessao?.local} · {sessao?.clinicaLabel.replace("Odontocompany ", "")}
          </div>
          <div className="text-white/50 text-xs flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" /> Início: {sessao?.horaInicio}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white">{meusContatos.length}</div>
          <div className="text-white/70 text-xs">meus contatos</div>
        </div>
      </div>

      {/* Abas */}
      <div className="w-full max-w-sm flex rounded-xl overflow-hidden mb-4 bg-white/10">
        <button
          onClick={() => setPageTab("novo")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${pageTab === "novo" ? "bg-white text-pink-800" : "text-white/70 hover:text-white"}`}
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
        <button
          onClick={() => setPageTab("meus")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${pageTab === "meus" ? "bg-white text-pink-800" : "text-white/70 hover:text-white"}`}
        >
          <List className="h-4 w-4" /> Meus {meusContatos.length > 0 && `(${meusContatos.length})`}
        </button>
        <button
          onClick={() => setPageTab("mapa")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${pageTab === "mapa" ? "bg-white text-pink-800" : "text-white/70 hover:text-white"}`}
        >
          <Map className="h-4 w-4" /> Mapa
        </button>
      </div>

      {pageTab === "meus" ? (
        <div className="w-full max-w-sm space-y-2">
          {meusContatos.length === 0 ? (
            <div className="text-center text-white/60 py-10 text-sm">Nenhum contato adicionado ainda.</div>
          ) : (
            meusContatos.map((c) => (
              <div key={c.id} onClick={() => setSelectedContatoDetalhes(c)} className={`bg-white rounded-xl px-4 py-3 space-y-1 ${c.status === "agendado" ? "border-2 border-purple-300" : ""} cursor-pointer hover:shadow-lg transition-shadow`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-800 text-sm truncate">{c.nome}</div>
                    <div className="text-gray-500 text-xs">{c.telefone1}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.status === "agendado" && (
                      <span className="text-xs bg-purple-100 text-purple-800 border border-purple-300 rounded-full px-2 py-0.5 font-medium mr-1">Agendado</span>
                    )}
                    <button
                      onClick={() => setEditLead({ id: c.id, nome: c.nome, telefone1: c.telefone1, telefone2: c.telefone2 ?? "", observacao: c.briefing ?? "" })}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    ><Pencil className="h-3.5 w-3.5" /></button>
                    <button
                      onClick={() => setDeleteConfirmId(c.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    ><Trash2 className="h-3.5 w-3.5" /></button>
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
      ) : pageTab === "mapa" ? (
        <div className="w-full max-w-sm space-y-3">
          {rotaLoading ? (
            <div className="bg-white/10 rounded-2xl px-5 py-8 text-center text-white/60 text-sm animate-pulse">
              Buscando rota do dia…
            </div>
          ) : rotaDoDia ? (
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              {/* Mini mapa */}
              <div style={{ height: 240 }}>
                <MapaRota
                  plannedRoute={rotaDoDia.waypoints.map((w) => ({ ...w, ts: 0 }))}
                  height="240px"
                />
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="bg-pink-100 p-2 rounded-xl shrink-0">
                    <Route className="h-4 w-4 text-pink-700" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Rota de hoje</p>
                    <h2 className="font-bold text-gray-800 text-sm leading-tight">{rotaDoDia.nome}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {rotaDoDia.waypoints.length} pontos · {rotaDoDia.data}
                    </p>
                  </div>
                </div>

                <a
                  href={(() => {
                    const wps = rotaDoDia.waypoints.length > 25
                      ? [rotaDoDia.waypoints[0], ...rotaDoDia.waypoints.slice(1, 24), rotaDoDia.waypoints[rotaDoDia.waypoints.length - 1]]
                      : rotaDoDia.waypoints;
                    return `https://www.google.com/maps/dir/${wps.map((w) => `${w.lat},${w.lng}`).join("/")}?travelmode=walking`;
                  })()}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-pink-700 hover:bg-pink-800 text-white font-semibold rounded-xl py-3 transition-colors text-sm"
                >
                  <Navigation className="h-4 w-4" />
                  Abrir no Google Maps
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-white/10 rounded-2xl px-5 py-10 text-center space-y-2">
              <MapPin className="h-8 w-8 mx-auto text-white/30" />
              <p className="text-white/70 text-sm font-medium">Nenhuma rota para hoje</p>
              <p className="text-white/40 text-xs">
                Peça para o administrador criar uma rota para <strong className="text-white/60">{sessao?.abordadora}</strong> com a data de hoje
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          {lastAdded && (
            <div className="w-full max-w-sm mb-3 flex items-center gap-2 bg-green-500/20 border border-green-400/30 rounded-lg px-3 py-2">
              <Check className="h-4 w-4 text-green-300 shrink-0" />
              <span className="text-green-200 text-sm">Contato <strong>{lastAdded}</strong> salvo!</span>
            </div>
          )}

          <div className="w-full max-w-sm space-y-3">
            <div className="bg-white rounded-2xl shadow-2xl p-5 space-y-4">
              <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <Plus className="h-4 w-4 text-pink-600" /> Novo Contato
              </h2>

            <div className="space-y-1.5">
              <Label>Nome</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" className="pl-9" autoComplete="off" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Telefone 01</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={telefone1}
                  onChange={(e) => setTelefone1(maskPhone(e.target.value))}
                  placeholder="(17) 99999-0000"
                  className={`pl-9 ${dupWarning ? "border-yellow-400 focus-visible:ring-yellow-400" : ""}`}
                  type="tel"
                  inputMode="numeric"
                />
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

            <div className="space-y-1.5">
              <Label>Serviço de interesse <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <div className="flex flex-wrap gap-2">
                {SERVICOS_PROMOTORA.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleServico(s)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                      servicosSelecionados.includes(s)
                        ? "bg-pink-700 text-white border-pink-700"
                        : "bg-white text-gray-700 border-gray-300 hover:border-pink-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observação <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: interessada em clareamento, perguntou sobre preço..."
                className="resize-none min-h-[80px] text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 py-5 text-base bg-pink-700 hover:bg-pink-800" onClick={handleAdicionar} disabled={saving || agendando}>
                {saving ? "Salvando..." : "+ Salvar Contato"}
              </Button>
              <Button className="flex-1 py-5 text-base bg-purple-700 hover:bg-purple-800" onClick={handleAbrirAgendar} disabled={saving || agendando}>
                <CalendarCheck className="h-4 w-4 mr-1.5" /> Agendar
              </Button>
            </div>
            </div>
          </div>
        </>
      )}

      {/* Encerrar sessão */}
      <button onClick={handleEncerrar} className="mt-6 flex items-center gap-1.5 text-white/50 text-xs hover:text-white/80 transition-colors">
        <LogOut className="h-3.5 w-3.5" /> Encerrar sessão
      </button>

      {/* Modal editar lead */}
      <Dialog open={!!editLead} onOpenChange={(o) => { if (!o) setEditLead(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4 text-blue-600" /> Editar Lead</DialogTitle>
          </DialogHeader>
          {editLead && (
            <div className="space-y-3 py-1">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={editLead.nome} onChange={(e) => setEditLead({ ...editLead, nome: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Telefone 01</Label>
                <Input value={maskPhone(editLead.telefone1)} onChange={(e) => setEditLead({ ...editLead, telefone1: maskPhone(e.target.value) })} type="tel" inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <Label>Telefone 02 <span className="text-gray-400 font-normal">(opcional)</span></Label>
                <Input value={maskPhone(editLead.telefone2)} onChange={(e) => setEditLead({ ...editLead, telefone2: maskPhone(e.target.value) })} type="tel" inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <Label>Observação</Label>
                <Textarea value={editLead.observacao} onChange={(e) => setEditLead({ ...editLead, observacao: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditLead(null)}>Cancelar</Button>
            <Button size="sm" disabled={editSaving} onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700 text-white">
              {editSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal confirmar exclusão */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="h-4 w-4" /> Excluir Lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-1">Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button size="sm" disabled={deleting} onClick={() => deleteConfirmId && handleDeleteLead(deleteConfirmId)} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Modal de detalhes do contato */}
      <Dialog open={!!selectedContatoDetalhes} onOpenChange={(o) => { if (!o) setSelectedContatoDetalhes(null); }}>
        <DialogContent className="max-w-sm max-h-[90vh] flex flex-col">
          {selectedContatoDetalhes && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between w-full">
                  <DialogTitle className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-pink-600" />
                    {selectedContatoDetalhes.nome}
                  </DialogTitle>
                  <button onClick={() => setSelectedContatoDetalhes(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </DialogHeader>

              {/* Conteúdo principal (scrollable) */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-3" ref={contatoDetailsRef}>
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

                {/* Local */}
                {selectedContatoDetalhes.local && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Local</p>
                    <p className="text-sm text-gray-800">{selectedContatoDetalhes.local}</p>
                  </div>
                )}

                {/* Serviço de Interesse */}
                {selectedContatoDetalhes.vouchers && selectedContatoDetalhes.vouchers.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Serviço de Interesse</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedContatoDetalhes.vouchers.map((v, idx) => (
                        <span key={idx} className="inline-block px-2.5 py-1 bg-pink-100 text-pink-800 text-xs rounded-full font-medium">
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
                      <MessageSquare className="h-3.5 w-3.5" /> Briefing (Recepção)
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
                    onClick={async () => {
                      if (!contatoDetailsRef.current) return;
                      try {
                        const canvas = await html2canvas(contatoDetailsRef.current, {
                          backgroundColor: '#ffffff',
                          scale: 2,
                        });
                        canvas.toBlob((blob) => {
                          if (blob) {
                            navigator.clipboard.write([
                              new ClipboardItem({ 'image/png': blob })
                            ]);
                            toast.success("Screenshot copiado!");
                          }
                        });
                      } catch (err) {
                        toast.error("Erro ao capturar imagem");
                      }
                    }}
                    className="flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    title="Copiar screenshot para enviar no WhatsApp"
                  >
                    📸 Imagem
                  </button>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await saveScheduledLead(sessao!.clinicaId, {
                        nome: selectedContatoDetalhes.nome,
                        telefone: selectedContatoDetalhes.telefone1.replace(/\D/g, ""),
                        servicos: selectedContatoDetalhes.vouchers || [],
                        observacao: selectedContatoDetalhes.briefing || "",
                        abordadora: selectedContatoDetalhes.abordadora || sessao!.abordadora,
                        local: selectedContatoDetalhes.local || sessao!.local,
                        dataAgendamento: selectedContatoDetalhes.dataAgendamento || "",
                        fonteLead: "Promotora",
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
                      toast.success("Contato removido");
                      setSelectedContatoDetalhes(null);
                    } catch (err) {
                      toast.error("Erro ao excluir contato");
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
