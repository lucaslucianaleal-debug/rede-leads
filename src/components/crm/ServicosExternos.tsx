import { useState, useMemo } from "react";
import { format, parse, differenceInMinutes } from "date-fns";
import { useCupons, useSessoes, CLINICAS, Cupom } from "@/hooks/useCupons";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";
import { Lead, LeadStage } from "@/types/crm";
import { CallLogDialog } from "@/components/crm/CallLogDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Phone,
  MessageSquare,
  UserPlus,
  X,
  Search,
  MapPin,
  User,
  Calendar,
  Trophy,
  AlertTriangle,
  ChevronRight,
  Briefcase,
  FileText,
  Building2,
  Clock,
  Users,
  UserCheck,
  Upload,
} from "lucide-react";
import { formatPhoneNumber } from "@/lib/phone";

const STATUS_LABELS: Record<Cupom["status"], { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  ligado: { label: "Ligado", color: "bg-blue-100 text-blue-800 border-blue-300" },
  whatsapp_enviado: { label: "WhatsApp Enviado", color: "bg-green-50 text-green-700 border-green-300" },
  convertido: { label: "Convertido", color: "bg-green-100 text-green-800 border-green-300" },
};

interface ServicosExternosProps {
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string) => void;
}

type MainTab = "cupom" | "visita" | "promotora" | "sessoes";

export function ServicosExternos({ onRegisterCall }: ServicosExternosProps) {
  const { currentClinic } = useAuth();
  const { createLead, registerCall, getAppointmentsFor } = useLeads();

  const clinicaId = currentClinic ?? CLINICAS[0].id;
  const clinicaLabel = CLINICAS.find((c) => c.id === clinicaId)?.label ?? "";

  const { cupons, loading, updateStatus } = useCupons(clinicaId);

  const [mainTab, setMainTab] = useState<MainTab>("cupom");
  const servicoTab = mainTab !== "sessoes" ? mainTab : "cupom";

  // State for sessões tab
  const todayInput = format(new Date(), "yyyy-MM-dd");
  const [sessaoDateInput, setSessaoDateInput] = useState(todayInput);
  const sessaoDateFormatted = (() => {
    const [y, m, d] = sessaoDateInput.split("-");
    return `${d}/${m}/${y}`;
  })();
  const { sessoes, loading: sessoesLoading } = useSessoes(clinicaId, sessaoDateFormatted);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | Cupom["status"]>("todos");
  const [filterDate, setFilterDate] = useState(""); // yyyy-MM-dd
  const [selected, setSelected] = useState<Cupom | null>(null);
  const [converting, setConverting] = useState(false);

  // WhatsApp dialog
  const [whatsDialogCupom, setWhatsDialogCupom] = useState<Cupom | null>(null);
  const [whatsMsg, setWhatsMsg] = useState("");

  // Ligar dialog
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const [callLogOpen, setCallLogOpen] = useState(false);

  // Import modal (promotora)
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<Array<{ nome: string; telefone: string; dup: boolean }> | null>(null);

  // Promotora: datas disponíveis configuráveis para mensagem
  const [promotoraDatas, setPromotoraDatas] = useState("na quarta às 15h ou na sexta às 10h");

  // Duplicate detection: check if phone1 appears more than once
  const phoneCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of cupons) {
      const p = c.telefone1.replace(/\D/g, "");
      if (p) map[p] = (map[p] || 0) + 1;
    }
    return map;
  }, [cupons]);

  const isDuplicate = (c: Cupom) =>
    phoneCounts[c.telefone1.replace(/\D/g, "")] > 1;

  const filtered = useMemo(() => {
    // Always filter by the active service tab
    let list = cupons.filter((c) => (c.tipo ?? "cupom") === servicoTab);
    if (filterStatus !== "todos") list = list.filter((c) => c.status === filterStatus);
    if (filterDate) {
      // dataCupom is "dd/MM/yyyy HH:mm"; filterDate is "yyyy-MM-dd"
      const [year, month, day] = filterDate.split("-");
      const dateStr = `${day}/${month}/${year}`;
      list = list.filter((c) => c.dataCupom?.startsWith(dateStr));
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.nome.toLowerCase().includes(s) ||
          c.telefone1.includes(s) ||
          c.abordadora.toLowerCase().includes(s) ||
          c.local.toLowerCase().includes(s)
      );
    }
    return list;
  }, [cupons, servicoTab, search, filterStatus, filterDate]);

  const saudacao = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  const buildPromoMsg = (nome: string, datas: string) => {
    const primeiroNome = nome.split(" ")[0];
    return `${saudacao()}, *${primeiroNome}*! Tudo bem? 😊\n\nAqui é o *Lucas*, da *OdontoCompany de Olímpia*. 🦷\n\nEstou entrando em contato porque você conversou com nossa equipe na rua recentemente. Como estamos em campanha de reinauguração, selecionei seu contato para um *benefício especial*: 🎉\n\n✅ *Avaliação Completa + Limpeza (Profilaxia) sem custo* para você conhecer nossa nova estrutura nesta semana.\n\nPara facilitar, já separei dois horários: 🗓️ ${datas}.\n\nQual desses horários funciona melhor para você garantir sua vaga? 😄`;
  };

  const buildDefaultMsg = (cupom: Cupom) => {
    const primeiroNome = cupom.nome.split(" ")[0];
    if (cupom.tipo === "promotora") {
      return buildPromoMsg(cupom.nome, promotoraDatas);
    }
    const tratamento = cupom.vouchers.join(", ");
    return `Oi, ${primeiroNome}! Tudo bem??\n\nNosso pessoal do serviço externo me avisou que você ganhou o nosso cupom de benefício para ${tratamento}! 🦷✨\n\nEstou te chamando para você já garantir a sua vaga!\n\nVocê prefere o período da manhã ou da tarde para usar seu Benefício?`;
  };

  // Retorna os 2 próximos horários livres da agenda (próximos dias úteis)
  const getSlotsLivres = (): string => {
    const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const found: string[] = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
    let safety = 0;
    while (found.length < 2 && safety < 14) {
      safety++;
      const dow = cursor.getDay();
      if (dow === 0) { cursor.setDate(cursor.getDate() + 1); continue; } // domingo
      const hours = dow === 6
        ? [8, 9, 10, 11, 12]
        : [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
      const agendados = getAppointmentsFor(new Date(cursor));
      const ocupados = new Set(
        agendados.map((l) => {
          const parts = l.dataAgendamento?.split(" ");
          return parts?.[1] ? parseInt(parts[1].split(":")[0]) : -1;
        })
      );
      const nomeDia = DIAS[dow];
      for (const h of hours) {
        if (!ocupados.has(h) && found.length < 2) {
          found.push(`na ${nomeDia} às ${h}h`);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (found.length === 0) return "em breve";
    if (found.length === 1) return found[0];
    return `${found[0]} ou ${found[1]}`;
  };

  const handleWhatsApp = (cupom: Cupom) => {
    let datas = promotoraDatas;
    if (cupom.tipo === "promotora") {
      datas = getSlotsLivres();
      setPromotoraDatas(datas);
    }
    const msg = cupom.tipo === "promotora"
      ? buildPromoMsg(cupom.nome, datas)
      : buildDefaultMsg(cupom);
    setWhatsMsg(msg);
    setWhatsDialogCupom(cupom);
  };

  const sendWhatsApp = () => {
    if (!whatsDialogCupom) return;
    const raw = whatsDialogCupom.telefone1.replace(/\D/g, "");
    const num = raw.length === 11 || raw.length === 10 ? `55${raw}` : raw;
    navigator.clipboard.writeText(whatsMsg).then(() => {
      toast.success("Mensagem copiada! Cole no WhatsApp com Ctrl+V (ou segurar para colar no celular).");
    });
    window.open(`https://wa.me/${num}`, "_blank");
    updateStatus(clinicaId, whatsDialogCupom.id, "whatsapp_enviado");
    setSelected((prev) => prev ? { ...prev, status: "whatsapp_enviado" } : null);
    setWhatsDialogCupom(null);
  };

  const buildLeadFromCupom = (cupom: Cupom): Omit<Lead, "id"> => {
    const now = format(new Date(), "dd/MM/yyyy");
    const isVisita = (cupom.tipo ?? "cupom") === "visita";
    const isPromotora = cupom.tipo === "promotora";
    const origemLabel = isVisita ? "Visita Comercial" : isPromotora ? "Promotora" : "Cupom sorteio";
    const obsExtra = [
      `Origem: ${origemLabel} (${cupom.local}) em ${cupom.dataCupom}.`,
      cupom.vouchers.length > 0 ? `Vouchers: ${cupom.vouchers.join("; ")}.` : "",
      cupom.telefone2 ? `Tel2: ${cupom.telefone2}.` : "",
      cupom.briefing ? (isPromotora ? `Observação: ${cupom.briefing}` : `Briefing: ${cupom.briefing}`) : "",
    ].filter(Boolean).join(" ");
    return {
      dataCriacao: now,
      dataContato: now,
      nome: cupom.nome,
      telefone: cupom.telefone1,
      servicoProcurado: cupom.vouchers.join(", "),
      captador: cupom.abordadora,
      fonteLead: isVisita ? "Visita Comercial" : isPromotora ? "Promotora" : "Sorteio Cupom",
      etapaLead: "Novo",
      status: "QUENTE",
      respostaLead: "",
      comparecimento: "",
      dataFollowUp: "",
      dataAgendamento: "",
      dataRetornoLigacao: "",
      observacao: obsExtra,
      followUpCount: 0,
      lembretes: { h24: false, today: false },
    };
  };

  const handleLigar = async (cupom: Cupom) => {
    try {
      const leadData = buildLeadFromCupom(cupom);
      const newLead = createLead(leadData);
      await updateStatus(clinicaId, cupom.id, "convertido");
      if (selected?.id === cupom.id) setSelected(null);
      setCallLead(newLead);
      setCallLogOpen(true);
      toast.success(`Lead criado: ${cupom.nome}`);
    } catch {
      toast.error("Erro ao converter. Tente novamente.");
    }
  };

  const handleSoLigar = () => {};
  const handleConvertAndCall = async () => {};

  const handleConvertLead = async (cupom: Cupom) => {
    setConverting(true);
    try {
      const leadData = buildLeadFromCupom(cupom);
      createLead(leadData);
      await updateStatus(clinicaId, cupom.id, "convertido");
      if (selected?.id === cupom.id) setSelected(null);
      toast.success(`Lead criado: ${cupom.nome}`);
    } catch (e) {
      toast.error("Erro ao converter. Tente novamente.");
    } finally {
      setConverting(false);
    }
  };

  const parseImportList = (text: string) => {
    const lines = text.split("\n").filter(l => l.trim());
    const parsed: Array<{ nome: string; telefone: string; dup: boolean }> = [];
    const existingPhones = new Set(
      cupons.filter(c => c.tipo === "promotora").map(c => c.telefone1.replace(/\D/g, ""))
    );
    for (const line of lines) {
      const parts = line.split(" - ");
      if (parts.length >= 2) {
        const nome = parts[0].trim();
        const telefone = parts[1].trim().replace(/\D/g, "");
        if (nome && telefone && telefone.length >= 10) {
          const dup = existingPhones.has(telefone);
          parsed.push({ nome, telefone, dup });
          existingPhones.add(telefone);
        }
      }
    }
    return parsed;
  };

  const handleImportPreview = () => {
    const preview = parseImportList(importText);
    if (preview.length === 0) {
      toast.error("Nenhum contato válido. Formato esperado: Nome - Telefone");
      return;
    }
    setImportPreview(preview);
  };

  const { addCupom } = useCupons(clinicaId);

  const handleImportConfirm = async () => {
    if (!importPreview || importPreview.length === 0) return;
    setImportLoading(true);
    const now = format(new Date(), "dd/MM/yyyy");
    try {
      let ok = 0; let skip = 0;
      for (const item of importPreview) {
        if (item.dup) { skip++; continue; }
        await addCupom(clinicaId, {
          tipo: "promotora",
          clinicaId,
          nome: item.nome,
          telefone1: item.telefone,
          vouchers: [],
          local: "—",
          abordadora: "Julia",
        });
        ok++;
      }
      toast.success(`✅ ${ok} contato${ok !== 1 ? "s" : ""} importado${ok !== 1 ? "s" : ""}${skip > 0 ? ` (${skip} já existente${skip !== 1 ? "s" : ""})` : ""}!`);
      setImportOpen(false); setImportText(""); setImportPreview(null);
    } catch (e) {
      toast.error("Erro na importação. Tente novamente.");
    } finally {
      setImportLoading(false);
    }
  };

  const pendingCount = cupons.filter((c) => (c.tipo ?? "cupom") === servicoTab && c.status === "pendente").length;
  const totalCount = cupons.filter((c) => (c.tipo ?? "cupom") === servicoTab).length;
  const activeSessoes = sessoes.filter((s) => s.horaFim == null).length;

  const serviceUrl = servicoTab === "cupom"
    ? `${window.location.origin}/sorteio-cupons`
    : servicoTab === "visita"
    ? `${window.location.origin}/visita-comercial`
    : `${window.location.origin}/promotora`;

  // Duration helper
  const calcDuracao = (s: { horaInicio: string; horaFim: string | null; data: string }) => {
    try {
      const inicio = parse(s.horaInicio, "dd/MM/yyyy HH:mm", new Date());
      const fim = s.horaFim ? parse(s.horaFim, "dd/MM/yyyy HH:mm", new Date()) : new Date();
      const mins = differenceInMinutes(fim, inicio);
      if (mins < 60) return `${mins}min`;
      return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? String(mins % 60).padStart(2, "0") : ""}`;
    } catch { return "-"; }
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Header + stats */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-bold">Serviços Externos</h2>
            <p className="text-xs text-muted-foreground">{clinicaLabel.replace("Odontocompany ", "")}</p>
          </div>
        </div>
        <div className="flex gap-2 sm:ml-auto flex-wrap">
          {mainTab !== "sessoes" && (
            <>
              <Badge variant="outline" className="bg-yellow-50 border-yellow-300 text-yellow-800">
                {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="outline" className={servicoTab === "cupom" ? "bg-blue-50 border-blue-200 text-blue-800" : servicoTab === "visita" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-pink-50 border-pink-200 text-pink-800"}>
                {totalCount} {servicoTab === "cupom" ? `cupom${totalCount !== 1 ? "s" : ""}` : servicoTab === "visita" ? `visita${totalCount !== 1 ? "s" : ""}` : `contato${totalCount !== 1 ? "s" : ""}`}
              </Badge>
            </>
          )}
          {mainTab === "sessoes" && activeSessoes > 0 && (
            <Badge variant="outline" className="bg-green-50 border-green-300 text-green-800">
              {activeSessoes} ativa{activeSessoes !== 1 ? "s" : ""} agora
            </Badge>
          )}
        </div>
      </div>

      {/* Service tabs + public link */}
      <div className="flex items-stretch border-b">
        <button
          onClick={() => { setMainTab("cupom"); setSelected(null); setFilterDate(""); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            mainTab === "cupom"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trophy className="h-4 w-4" />
          Cupom Sorteio
        </button>
        <button
          onClick={() => { setMainTab("visita"); setSelected(null); setFilterDate(""); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            mainTab === "visita"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Briefcase className="h-4 w-4" />
          Visita Comercial
        </button>
        <button
          onClick={() => { setMainTab("promotora"); setSelected(null); setFilterDate(""); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            mainTab === "promotora"
              ? "border-pink-600 text-pink-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <UserCheck className="h-4 w-4" />
          Promotora
        </button>
        <button
          onClick={() => { setMainTab("sessoes"); setSelected(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            mainTab === "sessoes"
              ? "border-violet-600 text-violet-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          Sessões
          {activeSessoes > 0 && (
            <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          )}
        </button>
        {mainTab !== "sessoes" && (
          <div className={`ml-auto flex items-center gap-2 mb-1 px-3 py-1.5 rounded-lg text-xs border self-center ${
            servicoTab === "cupom"
              ? "bg-blue-50 border-blue-200 text-blue-700"
              : servicoTab === "visita"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-pink-50 border-pink-200 text-pink-700"
          }`}>
            <span className="font-medium">Link público</span>
            <button
              onClick={() => { navigator.clipboard.writeText(serviceUrl); toast.success("Link copiado!"); }}
              className={`border rounded px-2 py-0.5 hover:opacity-80 ${
                servicoTab === "cupom" ? "border-blue-300" : servicoTab === "visita" ? "border-emerald-300" : "border-pink-300"
              }`}
            >
              Copiar link
            </button>
          </div>
        )}
      </div>

      {/* ===== ABA SESSÕES ===== */}
      {mainTab === "sessoes" && (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Date picker */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={sessaoDateInput}
                onChange={(e) => setSessaoDateInput(e.target.value)}
                className="pl-8 pr-3 h-9 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {sessoes.length} sessão{sessoes.length !== 1 ? "ões" : ""} · {activeSessoes} ativa{activeSessoes !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Tabela de sessões */}
          <div className="flex-1 overflow-auto rounded-lg border bg-card">
            {sessoesLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground text-sm animate-pulse">Carregando...</div>
            ) : sessoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                <Users className="h-8 w-8 opacity-30" />
                <span className="text-sm">Nenhuma sessão nesta data</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-6"></th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Abordadora</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Serviço</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Local</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Início</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fim</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {sessoes.map((s) => {
                    const ativa = s.horaFim == null;
                    return (
                      <tr key={s.id} className={`border-b last:border-0 ${ativa ? "bg-green-50/60" : ""}`}>
                        <td className="px-3 py-2.5">
                          <span
                            title={ativa ? "Ativa" : "Encerrada"}
                            className={`inline-block h-2.5 w-2.5 rounded-full ${ativa ? "bg-green-500" : "bg-gray-300"}`}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-medium">{s.abordadora}</td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className={`text-xs border rounded-full px-2 py-0.5 font-medium ${
                            s.tipo === "cupom"
                              ? "bg-blue-50 border-blue-200 text-blue-700"
                              : "bg-emerald-50 border-emerald-200 text-emerald-700"
                          }`}>
                            {s.tipo === "cupom" ? "Cupom" : "Visita"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">{s.local || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {s.horaInicio?.slice(11)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {ativa ? (
                            <span className="text-xs text-green-700 font-medium">Ativa agora</span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {s.horaFim?.slice(11)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground">{calcDuracao(s)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ===== ABAS CUPOM / VISITA ===== */}
      {mainTab !== "sessoes" && <>
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {mainTab === "promotora" && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-2 border-pink-400 text-pink-700 hover:bg-pink-50 shrink-0"
            onClick={() => { setImportOpen(true); setImportPreview(null); setImportText(""); }}
          >
            <Upload className="h-4 w-4" />
            Importar em lote
          </Button>
        )}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, telefone, abordadora..."
            className="pl-9 h-9"
          />
        </div>
        {/* Date picker */}
        <div className="relative flex items-center">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="pl-8 pr-7 h-9 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {filterDate && (
            <button
              onClick={() => setFilterDate("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Status filters */}
        {(["todos", "pendente", "ligado", "whatsapp_enviado", "convertido"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              filterStatus === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:border-foreground"
            }`}
          >
            {s === "todos" ? "Qualquer status" : STATUS_LABELS[s].label}
          </button>
        ))}
      </div>

      {/* Main area: table + side panel */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Table */}
        <div className={`flex-1 min-w-0 overflow-auto rounded-lg border bg-card ${selected ? "hidden sm:block" : ""}`}>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground text-sm animate-pulse">
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              {servicoTab === "cupom"
                ? <Trophy className="h-8 w-8 opacity-30" />
                : servicoTab === "visita"
                ? <Briefcase className="h-8 w-8 opacity-30" />
                : <UserCheck className="h-8 w-8 opacity-30" />
              }
              <span className="text-sm">Nenhum registro encontrado</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Telefone</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden lg:table-cell">Vouchers</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Captador</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden lg:table-cell">Data</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden lg:table-cell">Hora</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-6"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cupom) => {
                  const dup = isDuplicate(cupom);
                  const isActive = selected?.id === cupom.id;
                  return (
                    <tr
                      key={cupom.id}
                      onClick={() => setSelected(isActive ? null : cupom)}
                      className={`border-b cursor-pointer transition-colors last:border-0 ${
                        isActive
                          ? "bg-primary/10 hover:bg-primary/10"
                          : dup
                          ? "bg-red-50 hover:bg-red-100"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {dup && <span title="Telefone duplicado"><AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" /></span>}
                          <span className="font-medium truncate max-w-[120px]">{cupom.nome}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">
                        {formatPhoneNumber(cupom.telefone1)}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <div className="flex gap-1 flex-wrap max-w-[200px]">
                          {cupom.vouchers.slice(0, 2).map((v) => (
                            <span key={v} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 truncate max-w-[130px]">
                              {v}
                            </span>
                          ))}
                          {cupom.vouchers.length > 2 && (
                            <span className="text-xs text-muted-foreground">+{cupom.vouchers.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">{cupom.abordadora}</td>
                      <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground text-xs">
                        {cupom.dataCupom?.slice(0, 10)}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground text-xs">
                        {cupom.dataCupom?.slice(11)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs border rounded-full px-2 py-0.5 font-medium ${STATUS_LABELS[cupom.status]?.color}`}>
                          {STATUS_LABELS[cupom.status]?.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Side panel */}
        {selected && (
          <div className="w-full sm:w-80 shrink-0 rounded-lg border bg-card flex flex-col overflow-hidden sticky top-4 self-start max-h-[calc(100vh-8rem)]">
            {/* Panel header — fixo */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {servicoTab === "visita"
                  ? <Briefcase className="h-4 w-4 text-emerald-600 shrink-0" />
                  : servicoTab === "promotora"
                  ? <UserCheck className="h-4 w-4 text-pink-600 shrink-0" />
                  : <Trophy className="h-4 w-4 text-blue-600 shrink-0" />
                }
                <h3 className="font-semibold text-sm truncate">{selected.nome}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Status + Actions — fixos no topo */}
            <div className="px-4 py-3 border-b space-y-3 shrink-0 bg-background">
              {/* Status badge */}
              <div className="flex gap-2 items-center">
                <span className={`text-xs border rounded-full px-2.5 py-1 font-medium ${STATUS_LABELS[selected.status]?.color}`}>
                  {STATUS_LABELS[selected.status]?.label}
                </span>
                {isDuplicate(selected) && (
                  <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                    <AlertTriangle className="h-3 w-3" /> Duplicado
                  </span>
                )}
              </div>

              {/* WhatsApp */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 border-green-500 text-green-700 hover:bg-green-50"
                onClick={() => handleWhatsApp(selected)}
              >
                <MessageSquare className="h-4 w-4" />
                WhatsApp
              </Button>

              {/* Ligar */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => handleLigar(selected)}
              >
                <Phone className="h-4 w-4" />
                Ligar
              </Button>

              {/* Converter em Lead */}
              {selected.status !== "convertido" && (
                <Button
                  size="sm"
                  className="w-full justify-start gap-2 bg-primary hover:bg-primary/90"
                  onClick={() => handleConvertLead(selected)}
                  disabled={converting}
                >
                  <UserPlus className="h-4 w-4" />
                  {converting ? "Convertendo..." : "Converter em Lead"}
                </Button>
              )}
            </div>

            {/* Content — scrollável se precisar */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Info */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" />
                  <div>
                    <div>{formatPhoneNumber(selected.telefone1)}</div>
                    {selected.telefone2 && <div className="text-xs">{formatPhoneNumber(selected.telefone2)}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4 shrink-0" />
                  <span>{selected.abordadora}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  {servicoTab === "visita"
                    ? <Building2 className="h-4 w-4 shrink-0" />
                    : <MapPin className="h-4 w-4 shrink-0" />
                  }
                  <span>{selected.local}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>{selected.dataCupom}</span>
                </div>
              </div>

              {/* Vouchers / Serviços */}
              {selected.vouchers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  {servicoTab === "promotora" ? "Serviço de interesse" : "Vouchers"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.vouchers.map((v) => (
                    <span key={v} className={`text-xs border rounded-full px-2.5 py-1 font-medium ${
                      servicoTab === "promotora"
                        ? "bg-pink-50 text-pink-800 border-pink-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}>
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              )}

              {/* Briefing — visita comercial */}
              {servicoTab === "visita" && selected.briefing && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> Briefing
                  </p>
                  <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-900 leading-relaxed">
                    {selected.briefing}
                  </p>
                </div>
              )}

              {/* Observação — promotora */}
              {servicoTab === "promotora" && selected.briefing && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> Observação
                  </p>
                  <p className="text-sm bg-pink-50 border border-pink-200 rounded-lg px-3 py-2 text-pink-900 leading-relaxed">
                    {selected.briefing}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </>}

      {/* CallLogDialog após ligação */}
      <CallLogDialog
        lead={callLead}
        open={callLogOpen}
        onClose={() => { setCallLogOpen(false); setCallLead(null); }}
        onConfirm={(leadId, outcome, obs, returnDate, nextStage) => {
          registerCall(leadId, outcome, obs, returnDate, nextStage);
          setCallLogOpen(false);
          setCallLead(null);
        }}
      />

      {/* WhatsApp edit dialog */}
      <Dialog open={!!whatsDialogCupom} onOpenChange={(o) => { if (!o) setWhatsDialogCupom(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-green-600" />
              Mensagem para {whatsDialogCupom?.nome}
            </DialogTitle>
          </DialogHeader>
          {whatsDialogCupom?.tipo === "promotora" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Vagas disponíveis (horários)</Label>
              <Input
                value={promotoraDatas}
                onChange={(e) => {
                  const novasDatas = e.target.value;
                  setPromotoraDatas(novasDatas);
                  if (whatsDialogCupom) {
                    setWhatsMsg(buildPromoMsg(whatsDialogCupom.nome, novasDatas));
                  }
                }}
                placeholder="Ex: na quarta às 15h ou na sexta às 10h"
                className="h-8 text-sm"
              />
            </div>
          )}
          <Textarea
            value={whatsMsg}
            onChange={(e) => setWhatsMsg(e.target.value)}
            className="min-h-[200px] text-sm resize-none font-mono"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setWhatsDialogCupom(null)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
              onClick={sendWhatsApp}
            >
              <MessageSquare className="h-4 w-4" />
              Abrir WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import modal — promotora */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportText(""); setImportPreview(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-pink-600" />
              Importar contatos em lote — Promotora
            </DialogTitle>
          </DialogHeader>

          {!importPreview ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
                <p className="font-medium mb-1">Formato esperado (um por linha):</p>
                <p className="font-mono text-xs bg-white border border-blue-100 rounded px-2 py-1">Nome - Telefone</p>
                <p className="text-xs mt-1.5 text-blue-700">Ex: <span className="font-mono">Murilo - promotora Julia    17992362814</span></p>
                <p className="text-xs text-blue-700">Ou: <span className="font-mono">Murilo - 17992362814</span></p>
              </div>
              <div className="space-y-2">
                <Label>Cole a lista de contatos</Label>
                <Textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={"Murilo - promotora Julia    17992362814\nGiovana - promotora Julia    17992394259\n..."}
                  className="min-h-[220px] font-mono text-xs resize-none"
                />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
                <Button onClick={handleImportPreview} className="bg-pink-700 hover:bg-pink-800">
                  Visualizar ({importText.split("\n").filter(l => l.trim()).length} linhas)
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium">
                <span className="text-green-700">{importPreview.filter(p => !p.dup).length} para importar</span>
                {importPreview.filter(p => p.dup).length > 0 && (
                  <span className="text-yellow-600 ml-2">· {importPreview.filter(p => p.dup).length} já existente{importPreview.filter(p => p.dup).length !== 1 ? "s" : ""} (serão ignorados)</span>
                )}
              </p>
              <div className="max-h-[320px] overflow-y-auto border rounded-lg divide-y text-sm">
                {importPreview.map((item, i) => (
                  <div key={i} className={`px-3 py-2 flex items-center justify-between gap-2 ${item.dup ? "bg-yellow-50" : "bg-white"}`}>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.nome}</div>
                      <div className="text-xs text-muted-foreground">{item.telefone}</div>
                    </div>
                    {item.dup && <span className="text-xs font-medium text-yellow-700 shrink-0">Duplicado</span>}
                  </div>
                ))}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setImportPreview(null)} disabled={importLoading}>Voltar</Button>
                <Button
                  onClick={handleImportConfirm}
                  disabled={importLoading || importPreview.filter(p => !p.dup).length === 0}
                  className="bg-pink-700 hover:bg-pink-800"
                >
                  {importLoading ? "Importando..." : `Importar (${importPreview.filter(p => !p.dup).length})`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
