import { useState, useMemo } from "react";
import { useCupons, CLINICAS, Cupom } from "@/hooks/useCupons";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";
import { Lead } from "@/types/crm";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

type ServicoTab = "cupom" | "visita";

export function ServicosExternos({ onRegisterCall }: ServicosExternosProps) {
  const { currentClinic } = useAuth();
  const { createLead } = useLeads();

  const defaultClinic = currentClinic ?? CLINICAS[0].id;
  const [clinicaId, setClinicaId] = useState<string>(defaultClinic);

  const { cupons, loading, updateStatus } = useCupons(clinicaId);

  const [servicoTab, setServicoTab] = useState<ServicoTab>("cupom");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | Cupom["status"]>("todos");
  const [filterDate, setFilterDate] = useState(""); // yyyy-MM-dd from <input type="date">
  const [selected, setSelected] = useState<Cupom | null>(null);
  const [converting, setConverting] = useState(false);

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

  const handleWhatsApp = (cupom: Cupom) => {
    const raw = cupom.telefone1.replace(/\D/g, "");
    const num = raw.length === 11 || raw.length === 10 ? `55${raw}` : raw;
    const isVisita = (cupom.tipo ?? "cupom") === "visita";
    const msg = encodeURIComponent(
      isVisita
        ? `Olá ${cupom.nome}! Tudo bem? Entrei em contato da Odontocompany! Recebi seu contato via visita comercial em ${cupom.local} e queria te apresentar nossas condições especiais. Posso te ajudar?`
        : `Olá ${cupom.nome}! Tudo bem? Entrei em contato da Odontocompany! Vi que você pegou nosso cupom de sorteio com ${cupom.abordadora} e queria te apresentar nossas condições especiais. Posso te ajudar?`
    );
    window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
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

  const serviceUrl = servicoTab === "cupom"
    ? `${window.location.origin}/sorteio-cupons`
    : `${window.location.origin}/visita-comercial`;

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Header + stats */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-bold">Serviços Externos</h2>
        </div>
        <div className="flex gap-2 sm:ml-auto flex-wrap">
          <Badge variant="outline" className="bg-yellow-50 border-yellow-300 text-yellow-800">
            {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className={servicoTab === "cupom" ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}>
            {totalCount} {servicoTab === "cupom" ? `cupom${totalCount !== 1 ? "s" : ""}` : `visita${totalCount !== 1 ? "s" : ""}`}
          </Badge>
        </div>
      </div>

      {/* Clinic tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit flex-wrap">
        {CLINICAS.map((c) => (
          <button
            key={c.id}
            onClick={() => { setClinicaId(c.id); setSelected(null); }}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              clinicaId === c.id
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.label.replace("Odontocompany ", "")}
          </button>
        ))}
      </div>

      {/* Service tabs + public link */}
      <div className="flex items-stretch border-b">
        <button
          onClick={() => { setServicoTab("cupom"); setSelected(null); setFilterDate(""); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            servicoTab === "cupom"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trophy className="h-4 w-4" />
          Cupom Sorteio
        </button>
        <button
          onClick={() => { setServicoTab("visita"); setSelected(null); setFilterDate(""); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            servicoTab === "visita"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Briefcase className="h-4 w-4" />
          Visita Comercial
        </button>
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
      </div>

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
                onClick={() => {
                  handleWhatsApp(selected);
                  updateStatus(clinicaId, selected.id, "ligado");
                  setSelected((prev) => prev ? { ...prev, status: "ligado" } : null);
                }}
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
    </div>
  );
}
