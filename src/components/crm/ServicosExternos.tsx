import { useState, useMemo } from "react";
import { format, parse, differenceInMinutes } from "date-fns";
import { useCupons, useSessoes, CLINICAS, Cupom } from "@/hooks/useCupons";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";
import { Lead } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { formatPhoneNumber } from "@/lib/phone";

const STATUS_LABELS: Record<Cupom["status"], { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  ligado: { label: "Ligado", color: "bg-blue-100 text-blue-800 border-blue-300" },
  convertido: { label: "Convertido", color: "bg-green-100 text-green-800 border-green-300" },
};

interface ServicosExternosProps {
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string) => void;
}

type MainTab = "cupom" | "visita" | "sessoes";

export function ServicosExternos({ onRegisterCall }: ServicosExternosProps) {
  const { currentClinic } = useAuth();
  const { createLead } = useLeads();

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

  const buildDefaultMsg = (cupom: Cupom) => {
    const tratamento = cupom.vouchers.join(", ");
    return `Oi, ${cupom.nome}! Tudo bem??\n\nNosso pessoal do servi\u00e7o externo me avisou que voc\u00ea ganhou o nosso cupom de benef\u00edcio para ${tratamento}! \uD83E\uDDB7\u2728\n\nEstou te chamando para voc\u00ea j\u00e1 garantir a sua vaga!\n\nVoc\u00ea prefere o per\u00edodo da manh\u00e3 ou da tarde para usar seu Benef\u00edcio?`;
  };

  const handleWhatsApp = (cupom: Cupom) => {
    setWhatsMsg(buildDefaultMsg(cupom));
    setWhatsDialogCupom(cupom);
  };

  const sendWhatsApp = () => {
    if (!whatsDialogCupom) return;
    const raw = whatsDialogCupom.telefone1.replace(/\D/g, "");
    const num = raw.length === 11 || raw.length === 10 ? `55${raw}` : raw;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(whatsMsg)}`, "_blank");
    updateStatus(clinicaId, whatsDialogCupom.id, "ligado");
    setSelected((prev) => prev ? { ...prev, status: "ligado" } : null);
    setWhatsDialogCupom(null);
  };

  const handleConvertLead = async (cupom: Cupom) => {
    setConverting(true);
    try {
      const now = format(new Date(), "dd/MM/yyyy");
      const isVisita = (cupom.tipo ?? "cupom") === "visita";
      const obsExtra = [
        `Origem: ${isVisita ? "Visita Comercial" : "Cupom sorteio"} (${cupom.local}) em ${cupom.dataCupom}.`,
        `Vouchers: ${cupom.vouchers.join("; ")}.`,
        cupom.telefone2 ? `Tel2: ${cupom.telefone2}.` : "",
        cupom.briefing ? `Briefing: ${cupom.briefing}` : "",
      ].filter(Boolean).join(" ");
      const newLead: Omit<Lead, "id"> = {
        dataCriacao: now,
        dataContato: now,
        nome: cupom.nome,
        telefone: cupom.telefone1,
        servicoProcurado: cupom.vouchers.join(", "),
        captador: cupom.abordadora,
        fonteLead: isVisita ? "Visita Comercial" : "Sorteio Cupom",
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
      createLead(newLead);
      await updateStatus(clinicaId, cupom.id, "convertido");
      if (selected?.id === cupom.id) setSelected(null);
      toast.success(`Lead criado: ${cupom.nome}`);
    } catch (e) {
      toast.error("Erro ao converter. Tente novamente.");
    } finally {
      setConverting(false);
    }
  };

  const pendingCount = cupons.filter((c) => (c.tipo ?? "cupom") === servicoTab && c.status === "pendente").length;
  const totalCount = cupons.filter((c) => (c.tipo ?? "cupom") === servicoTab).length;
  const activeSessoes = sessoes.filter((s) => s.horaFim == null).length;

  const serviceUrl = servicoTab === "cupom"
    ? `${window.location.origin}/sorteio-cupons`
    : `${window.location.origin}/visita-comercial`;

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
              <Badge variant="outline" className={servicoTab === "cupom" ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}>
                {totalCount} {servicoTab === "cupom" ? `cupom${totalCount !== 1 ? "s" : ""}` : `visita${totalCount !== 1 ? "s" : ""}`}
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
              : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}>
            <span className="font-medium">Link público</span>
            <button
              onClick={() => { navigator.clipboard.writeText(serviceUrl); toast.success("Link copiado!"); }}
              className={`border rounded px-2 py-0.5 hover:opacity-80 ${
                servicoTab === "cupom" ? "border-blue-300" : "border-emerald-300"
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
        {(["todos", "pendente", "ligado", "convertido"] as const).map((s) => (
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
                : <Briefcase className="h-8 w-8 opacity-30" />
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
          <div className="w-full sm:w-80 shrink-0 rounded-lg border bg-card flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
              <div className="flex items-center gap-2 min-w-0">
                {servicoTab === "visita"
                  ? <Briefcase className="h-4 w-4 text-emerald-600 shrink-0" />
                  : <Trophy className="h-4 w-4 text-blue-600 shrink-0" />
                }
                <h3 className="font-semibold text-sm truncate">{selected.nome}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

              {/* Vouchers */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Vouchers</p>
                <div className="space-y-1">
                  {selected.vouchers.map((v) => (
                    <div key={v} className="flex items-center gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      {v}
                    </div>
                  ))}
                </div>
              </div>

              {/* Briefing — visita comercial */}
              {selected.briefing && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> Briefing
                  </p>
                  <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-900 leading-relaxed">
                    {selected.briefing}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-3 border-t space-y-2 bg-muted/20">
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
                onClick={() => {
                  window.location.href = `tel:${selected.telefone1.replace(/\D/g, "")}`;
                  updateStatus(clinicaId, selected.id, "ligado");
                  setSelected((prev) => prev ? { ...prev, status: "ligado" } : null);
                }}
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

              {selected.status === "convertido" && (
                <p className="text-xs text-center text-muted-foreground py-1">Lead já criado ✓</p>
              )}
            </div>
          </div>
        )}
      </div>
      </>}

      {/* WhatsApp edit dialog */}
      <Dialog open={!!whatsDialogCupom} onOpenChange={(o) => { if (!o) setWhatsDialogCupom(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-green-600" />
              Mensagem para {whatsDialogCupom?.nome}
            </DialogTitle>
          </DialogHeader>
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
    </div>
  );
}
