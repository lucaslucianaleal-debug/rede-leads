import { useEffect, useMemo, useState } from "react";
import { Lead, LeadStage } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Send, MessageSquareText, CheckSquare, Square, Wifi, WifiOff, MessageCircle, Clock3, Check, Reply } from "lucide-react";
import { followUpMessages, formatFollowUpMessage } from "@/data/followUpMessages";
import { useWhatsAppAgent } from "@/hooks/useWhatsAppAgent";
import { WhatsAppConversationPanel } from "./WhatsAppConversationPanel";
import { toast } from "sonner";

const STAGES: { stage: LeadStage; label: string }[] = [
  { stage: "Novo", label: "NOVO" },
  { stage: "Em contato", label: "EC" },
  ...Array.from({ length: 12 }, (_, i) => ({ stage: `Follow-Up ${i + 1}` as LeadStage, label: `D${i + 1}` })),
  { stage: "Avaliação agendada", label: "AGEND" },
];

type ViewFilter = "vencidos" | "hoje" | "todos";
type AttendanceFilter = "todos" | "nao_compareceu" | "compareceu" | "sem_status";
type SourceFilter = "todos" | "organico" | "promotora" | "indicacao";

function todayBR() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function parseBrDate(value?: string) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
}

function daysSince(value?: string) {
  const ts = parseBrDate(value);
  if (ts === null) return 0;
  const nowParts = todayBR().split("/");
  const todayTs = Date.UTC(Number(nowParts[2]), Number(nowParts[1]) - 1, Number(nowParts[0]));
  return Math.max(0, Math.floor((todayTs - ts) / 86400000));
}

function nextStage(stage: LeadStage): LeadStage {
  const match = String(stage || "").match(/^Follow-Up\s+(\d+)$/i);
  if (!match) return "Follow-Up 1";
  const n = Math.min(12, Number(match[1]) + 1);
  return `Follow-Up ${n}` as LeadStage;
}

function isPromotora(lead: Lead) {
  return String(lead.fonteLead || "").toLowerCase().includes("promotora");
}

function isIndicacao(lead: Lead) {
  const source = String(lead.fonteLead || "").toLowerCase();
  return source.includes("indicacao") || source.includes("indicação");
}

function templatesFor(stage: LeadStage, noShow: boolean) {
  const row = followUpMessages.find((item) => item.stage === stage);
  if (!row) return [];
  if (noShow && row.variationsNoShow?.length) return row.variationsNoShow.slice(0, 3);
  if (row.variations?.length) return row.variations.slice(0, 3);
  if (row.template) return [row.template];
  if (stage === "Novo") {
    return ["Oi [primeiro_nome], tudo bem?\n\nAqui é da OdontoCompany de Olímpia. Vi seu contato e queria entender melhor como podemos te ajudar.\n\nO que mais está te incomodando hoje?"];
  }
  if (stage === "Em contato") {
    return ["Oi [primeiro_nome], tudo bem?\n\nVoltei aqui na nossa conversa para não deixar seu atendimento parado.\n\nO que falta para conseguirmos avançar com seu atendimento de [serviço]?"];
  }
  return [];
}

function personalize(template: string, lead: Lead) {
  return formatFollowUpMessage(
    template,
    lead.nome || "você",
    lead.servicoProcurado || "seu tratamento",
    "OdontoCompany",
    lead.dataAgendamento?.split(" ")?.[1] || ""
  );
}

function needsAttention(lead: Lead) {
  return Boolean((lead as any).whatsappNeedsAttention);
}

interface FollowUpOperationsPanelProps {
  leads: Lead[];
  allLeads?: Lead[];
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
}

export function FollowUpOperationsPanel({ leads, allLeads, onUpdateLead }: FollowUpOperationsPanelProps) {
  const { status, queueMessages } = useWhatsAppAgent();
  const base = allLeads || leads;
  const today = todayBR();

  const [stage, setStage] = useState<LeadStage>("Follow-Up 2");
  const [view, setView] = useState<ViewFilter>("vencidos");
  const [service, setService] = useState("todos");
  const [attendance, setAttendance] = useState<AttendanceFilter>("todos");
  const [source, setSource] = useState<SourceFilter>("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queuedLeadIds, setQueuedLeadIds] = useState<Set<string>>(new Set());
  const [variants, setVariants] = useState<string[]>([]);
  const [singleLead, setSingleLead] = useState<Lead | null>(null);
  const [singleMessage, setSingleMessage] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState<string>("");

  const services = useMemo(() => {
    const values = base
      .filter((lead) => !(lead as any)._deleted)
      .map((lead) => String(lead.servicoProcurado || "").trim())
      .filter(Boolean);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [base]);

  const filtered = useMemo(() => {
    let list = base.filter((lead) => !(lead as any)._deleted && lead.etapaLead === stage);

    if (source === "promotora") list = list.filter(isPromotora);
    if (source === "indicacao") list = list.filter(isIndicacao);
    if (source === "organico") list = list.filter((lead) => !isPromotora(lead) && !isIndicacao(lead));

    if (service !== "todos") list = list.filter((lead) => String(lead.servicoProcurado || "") === service);
    if (attendance === "nao_compareceu") list = list.filter((lead) => lead.comparecimento === "NÃO COMPARECEU");
    if (attendance === "compareceu") list = list.filter((lead) => lead.comparecimento === "COMPARECEU");
    if (attendance === "sem_status") list = list.filter((lead) => !lead.comparecimento);

    if (view === "vencidos") {
      list = list.filter((lead) => !!lead.dataFollowUp && daysSince(lead.dataFollowUp) >= 1 && lead.lastFollowUpDone !== today);
    } else if (view === "hoje") {
      list = list.filter((lead) => lead.dataFollowUp === today || lead.lastFollowUpDone === today);
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((lead) =>
        String(lead.nome || "").toLowerCase().includes(term) ||
        String(lead.telefone || "").replace(/\D/g, "").includes(term.replace(/\D/g, ""))
      );
    }

    return list.sort((a, b) => {
      if (needsAttention(a) !== needsAttention(b)) return needsAttention(a) ? -1 : 1;
      return daysSince(b.lastFollowUpDone || b.dataFollowUp) - daysSince(a.lastFollowUpDone || a.dataFollowUp);
    });
  }, [base, stage, source, service, attendance, view, search, today]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGES.forEach(({ stage: itemStage }) => {
      counts[itemStage] = base.filter((lead) => !(lead as any)._deleted && lead.etapaLead === itemStage).length;
    });
    return counts;
  }, [base]);

  useEffect(() => {
    setSelected(new Set());
    setVariants(templatesFor(stage, attendance === "nao_compareceu"));
    setActiveVariantIndex(0);
    setBatchOpen(false);
  }, [stage, attendance]);

  useEffect(() => {
    setQueuedLeadIds((current) => {
      const next = new Set(current);
      base.forEach((lead) => {
        if (lead.lastFollowUpDone === today || needsAttention(lead)) next.delete(lead.id);
      });
      return next;
    });
  }, [base, today]);

  useEffect(() => {
    if (filtered.length && !activeLeadId) setActiveLeadId(filtered[0].id);
  }, [filtered, activeLeadId]);

  const activeLead = useMemo(() => base.find((lead) => lead.id === activeLeadId) || null, [base, activeLeadId]);
  const selectedLeads = useMemo(() => filtered.filter((lead) => selected.has(lead.id)), [filtered, selected]);
  const previewLead = selectedLeads[0] || filtered[0] || null;
  const usableVariants = variants.map((v) => v.trim()).filter(Boolean);

  const toggleAll = () => {
    if (filtered.length > 40) {
      const first40 = filtered.slice(0, 40);
      setSelected(new Set(first40.map((lead) => lead.id)));
      toast.info("Selecionei os 40 primeiros. O limite por lote é 40.");
      return;
    }
    const allVisibleSelected = filtered.length > 0 && filtered.every((lead) => selected.has(lead.id));
    setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((lead) => lead.id)));
  };

  const updateVariant = (index: number, value: string) => {
    setVariants((current) => current.map((item, i) => i === index ? value : item));
  };

  const addVariant = () => {
    if (variants.length >= 3) return;
    const next = [...variants, variants[0] || ""];
    setVariants(next);
    setActiveVariantIndex(next.length - 1);
  };

  const openBatch = () => {
    if (!selectedLeads.length) return toast.info("Selecione os leads que deseja colocar na fila.");
    setActiveVariantIndex(0);
    setBatchOpen(true);
  };

  const queueBatch = async () => {
    if (!selectedLeads.length) return toast.error("Selecione pelo menos um lead.");
    if (selectedLeads.length > 40) return toast.error("O limite por lote é 40 leads.");
    if (!usableVariants.length) return toast.error("Escreva pelo menos uma mensagem.");
    if (!status.connected) return toast.error("WhatsApp está desconectado.");

    const ok = window.confirm(`Colocar ${selectedLeads.length} follow-up(s) na fila?\n\nO agente enviará um por vez, com intervalo aleatório de segurança.`);
    if (!ok) return;

    setSending(true);
    try {
      const items = selectedLeads.map((lead, index) => ({
        leadId: lead.id,
        phone: lead.telefone,
        name: lead.nome,
        message: personalize(usableVariants[index % usableVariants.length], lead),
        kind: "followup" as const,
        stage: lead.etapaLead,
        nextStage: nextStage(lead.etapaLead as LeadStage),
      }));
      const result = await queueMessages(items);
      setQueuedLeadIds((current) => new Set([...current, ...result.queuedIds]));
      toast.success(`${result.queued} follow-up(s) colocado(s) na fila. O agente enviará espaçado.`);
      if (result.skipped) toast.info(`${result.skipped} item(ns) foram ignorados por trava de duplicidade/estado.`);
      setSelected(new Set());
      setBatchOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar fila de follow-up");
    } finally {
      setSending(false);
    }
  };

  const openSingle = (lead: Lead) => {
    const template = usableVariants[0] || templatesFor(lead.etapaLead as LeadStage, lead.comparecimento === "NÃO COMPARECEU")[0] || "";
    setSingleLead(lead);
    setSingleMessage(personalize(template, lead));
  };

  const queueSingle = async () => {
    if (!singleLead || !singleMessage.trim()) return;
    if (!status.connected) return toast.error("WhatsApp está desconectado.");
    setSending(true);
    try {
      const result = await queueMessages([{
        leadId: singleLead.id,
        phone: singleLead.telefone,
        name: singleLead.nome,
        message: singleMessage,
        kind: "followup",
        stage: singleLead.etapaLead,
        nextStage: nextStage(singleLead.etapaLead as LeadStage),
      }]);
      if (result.queued) {
        setQueuedLeadIds((current) => new Set([...current, singleLead.id]));
        setActiveLeadId(singleLead.id);
        toast.success("Follow-up colocado na fila. A conversa fica aberta ao lado.");
      } else {
        toast.info("Esse follow-up já tem envio pendente ou realizado hoje.");
      }
      setSingleLead(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar follow-up");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            Rotina de Contatos • WhatsApp
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Aqui é a operação: filtre a carteira, envie follow-ups e responda a conversa sem sair da rotina.</p>
        </div>
        <div className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 ${status.connected ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
          {status.connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {status.connected ? "WhatsApp conectado" : "Agente offline"}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Etapa para trabalhar</p>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((item) => (
            <button
              key={item.stage}
              onClick={() => { setStage(item.stage); setView("vencidos"); setActiveLeadId(""); }}
              className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition ${stage === item.stage ? "border-primary bg-primary/10 text-primary ring-1 ring-primary" : "bg-muted/50 text-muted-foreground border-muted hover:bg-muted"}`}
            >
              {item.label}{stageCounts[item.stage] ? <span className="ml-1 opacity-70">{stageCounts[item.stage]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Select value={service} onValueChange={(value) => { setService(value); setActiveLeadId(""); }}>
          <SelectTrigger><SelectValue placeholder="Serviço" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os serviços</SelectItem>
            {services.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={attendance} onValueChange={(value) => { setAttendance(value as AttendanceFilter); setActiveLeadId(""); }}>
          <SelectTrigger><SelectValue placeholder="Comparecimento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="nao_compareceu">Não compareceu</SelectItem>
            <SelectItem value="compareceu">Compareceu</SelectItem>
            <SelectItem value="sem_status">Sem comparecimento</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(value) => { setSource(value as SourceFilter); setActiveLeadId(""); }}>
          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as origens</SelectItem>
            <SelectItem value="organico">Orgânicos</SelectItem>
            <SelectItem value="promotora">Promotora</SelectItem>
            <SelectItem value="indicacao">Indicação</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou telefone" className="pl-9" />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 bg-muted/40 rounded-lg p-1 w-fit">
        {(["vencidos", "hoje", "todos"] as ViewFilter[]).map((item) => (
          <button key={item} onClick={() => { setView(item); setActiveLeadId(""); }} className={`px-3 py-1.5 rounded-md text-sm ${view === item ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>
            {item === "vencidos" ? "Vencidos" : item === "hoje" ? "Hoje" : "Todos"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(430px,0.95fr)] gap-4 items-start">
        <div className="min-w-0">
          <div className="border rounded-lg overflow-hidden flex flex-col xl:h-[650px]">
            <div className="flex items-center justify-between gap-3 p-2.5 bg-muted/30 border-b shrink-0">
              <button onClick={toggleAll} className="text-xs font-medium flex items-center gap-1.5 hover:text-primary">
                {filtered.length > 0 && filtered.every((lead) => selected.has(lead.id)) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                Selecionar visíveis
              </button>
              <span className="text-xs text-muted-foreground">{filtered.length} lead(s) • {selectedLeads.length} selecionado(s)</span>
            </div>

            <div className="max-h-[520px] xl:max-h-none xl:flex-1 min-h-0 overflow-y-auto divide-y">
              {!filtered.length && <div className="p-8 text-sm text-muted-foreground text-center">Nenhum lead encontrado com esses filtros.</div>}
              {filtered.map((lead) => {
                const active = activeLeadId === lead.id;
                const queued = queuedLeadIds.has(lead.id);
                const sentToday = lead.lastFollowUpDone === today;
                const replied = needsAttention(lead);
                return (
                  <div
                    key={lead.id}
                    onClick={() => setActiveLeadId(lead.id)}
                    className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${active ? "bg-primary/10" : "hover:bg-muted/30"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => setSelected((current) => { const next = new Set(current); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next; })}
                      className="h-4 w-4 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{lead.nome || "Sem nome"}</span>
                        {replied && <span className="text-[10px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 inline-flex items-center gap-1"><Reply className="h-3 w-3" />Respondeu</span>}
                        {queued && !sentToday && <span className="text-[10px] rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />Na fila</span>}
                        {sentToday && <span className="text-[10px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 inline-flex items-center gap-1"><Check className="h-3 w-3" />Enviado hoje</span>}
                        {lead.comparecimento === "NÃO COMPARECEU" && <span className="text-[10px] rounded-full bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5">Não compareceu</span>}
                        {daysSince(lead.lastFollowUpDone || lead.dataFollowUp) > 0 && <span className="text-[10px] rounded-full bg-amber-50 text-amber-700 px-1.5 py-0.5">Há {daysSince(lead.lastFollowUpDone || lead.dataFollowUp)}d</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{lead.telefone} • {lead.servicoProcurado || "Serviço não informado"}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant={active ? "default" : "outline"} onClick={(e) => { e.stopPropagation(); setActiveLeadId(lead.id); }}>
                        <MessageCircle className="h-3.5 w-3.5 mr-1" />Conversa
                      </Button>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openSingle(lead); }}>Editar FU</Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t bg-background p-2.5 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold">{selectedLeads.length ? `${selectedLeads.length} lead(s) prontos para o lote` : "Selecione os leads do lote"}</p>
                <p className="text-[11px] text-muted-foreground truncate">As mensagens e o envio abrem em uma janela, sem precisar descer a página.</p>
              </div>
              <Button size="sm" onClick={openBatch} disabled={!selectedLeads.length || !status.connected}>
                <Send className="h-4 w-4 mr-1.5" />
                Preparar envio{selectedLeads.length ? ` (${selectedLeads.length})` : ""}
              </Button>
            </div>
          </div>
        </div>

        <div className="min-w-0 xl:sticky xl:top-24">
          <WhatsAppConversationPanel
            target={activeLead ? {
              phone: activeLead.telefone,
              name: activeLead.nome,
              leadId: activeLead.id,
              metaCampanhaId: activeLead.metaCampanhaId,
              metaCampanhaNome: activeLead.metaCampanhaNome,
              fonteLead: activeLead.fonteLead,
            } : null}
            lead={activeLead}
            allLeads={base}
            onUpdateLead={onUpdateLead}
            height="650px"
            showQuickRegistration={false}
          />
        </div>
      </div>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preparar lote • {stage.replace("Follow-Up ", "D")} • {selectedLeads.length} lead(s)</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Mensagens do lote</p>
                <p className="text-xs text-muted-foreground">Até 3 variações intercaladas automaticamente. Quebras de linha são preservadas.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setVariants(templatesFor(stage, attendance === "nao_compareceu")); setActiveVariantIndex(0); }}>Carregar sugeridas</Button>
                {variants.length < 3 && <Button size="sm" variant="outline" onClick={addVariant}>+ Variação</Button>}
              </div>
            </div>

            {variants.length > 0 && (
              <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit">
                {variants.map((_, index) => (
                  <button key={index} onClick={() => setActiveVariantIndex(index)} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${activeVariantIndex === index ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}>
                    Variação {index + 1}
                  </button>
                ))}
              </div>
            )}

            {variants.length === 0 ? (
              <Textarea rows={7} placeholder="Escreva a mensagem. Use [primeiro_nome] e [serviço] para personalizar." onChange={(e) => { setVariants([e.target.value]); setActiveVariantIndex(0); }} />
            ) : (
              <Textarea value={variants[activeVariantIndex] || ""} onChange={(e) => updateVariant(activeVariantIndex, e.target.value)} rows={8} className="whitespace-pre-wrap" />
            )}

            {previewLead && usableVariants[0] && (
              <div className="rounded-md bg-muted/20 border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Preview para {previewLead.nome?.split(" ")[0] || "lead"}</p>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{personalize(usableVariants[0], previewLead)}</div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Fila automática: um follow-up por vez, respeitando o intervalo configurado.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>Cancelar</Button>
            <Button onClick={queueBatch} disabled={sending || !selectedLeads.length || !usableVariants.length || !status.connected}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Colocando na fila..." : `Enviar ${selectedLeads.length} follow-up${selectedLeads.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!singleLead} onOpenChange={(open) => !open && setSingleLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{singleLead?.nome || "Editar mensagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Edite livremente. O texto abaixo será enviado exatamente com essas quebras de linha.</p>
            <Textarea value={singleMessage} onChange={(e) => setSingleMessage(e.target.value)} rows={10} className="whitespace-pre-wrap" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleLead(null)}>Cancelar</Button>
            <Button onClick={queueSingle} disabled={sending || !singleMessage.trim() || !status.connected}>
              <Send className="h-4 w-4 mr-2" />Colocar na fila
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
