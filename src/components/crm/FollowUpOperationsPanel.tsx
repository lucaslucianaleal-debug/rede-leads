import { useCallback, useEffect, useMemo, useState } from "react";
import { Lead, LeadStage } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Send, MessageSquareText, CheckSquare, Square, Wifi, WifiOff, MessageCircle, Clock3, Check, Reply, RotateCcw, ListChecks, CalendarDays } from "lucide-react";
import { followUpMessages, formatFollowUpMessage } from "@/data/followUpMessages";
import { useWhatsAppAgent } from "@/hooks/useWhatsAppAgent";
import { useAuth } from "@/hooks/useAuth";
import { WhatsAppConversationPanel } from "./WhatsAppConversationPanel";
import { toast } from "sonner";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

const STAGES: { stage: LeadStage; label: string }[] = [
  { stage: "Novo", label: "NOVO" },
  { stage: "Em contato", label: "EC" },
  ...Array.from({ length: 12 }, (_, i) => ({ stage: `Follow-Up ${i + 1}` as LeadStage, label: `D${i + 1}` })),
  { stage: "Avaliação agendada", label: "AGEND" },
];

type ViewFilter = "vencidos" | "hoje" | "todos";
type StageFilter = LeadStage | "daily_queue";
type AttendanceFilter = "todos" | "nao_compareceu" | "compareceu" | "sem_status";
type SourceFilter = "todos" | "organico" | "promotora" | "indicacao";
type OperationalLead = Lead & {
  _deleted?: boolean;
  whatsappNeedsAttention?: boolean;
};

type FollowUpFilters = {
  stage: StageFilter;
  view: ViewFilter;
  service: string;
  attendance: AttendanceFilter;
  source: SourceFilter;
  search: string;
};

const DEFAULT_FILTERS: FollowUpFilters = {
  stage: "daily_queue",
  view: "vencidos",
  service: "todos",
  attendance: "todos",
  source: "todos",
  search: "",
};

const DAILY_FOLLOW_UP_LIMIT = 100;
const ACTIVE_STAGES = new Set<LeadStage>([
  "Novo",
  "Em contato",
  ...Array.from({ length: 12 }, (_, index) => `Follow-Up ${index + 1}` as LeadStage),
]);

const VIEW_FILTERS = new Set<ViewFilter>(["vencidos", "hoje", "todos"]);
const ATTENDANCE_FILTERS = new Set<AttendanceFilter>(["todos", "nao_compareceu", "compareceu", "sem_status"]);
const SOURCE_FILTERS = new Set<SourceFilter>(["todos", "organico", "promotora", "indicacao"]);

function readStoredFilters(storageKey: string): FollowUpFilters {
  if (!storageKey) return DEFAULT_FILTERS;

  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}") as Partial<FollowUpFilters>;
    return {
      stage: parsed.stage === "daily_queue" || STAGES.some((item) => item.stage === parsed.stage)
        ? parsed.stage as StageFilter
        : DEFAULT_FILTERS.stage,
      view: VIEW_FILTERS.has(parsed.view as ViewFilter) ? parsed.view as ViewFilter : DEFAULT_FILTERS.view,
      service: typeof parsed.service === "string" && parsed.service ? parsed.service : DEFAULT_FILTERS.service,
      attendance: ATTENDANCE_FILTERS.has(parsed.attendance as AttendanceFilter)
        ? parsed.attendance as AttendanceFilter
        : DEFAULT_FILTERS.attendance,
      source: SOURCE_FILTERS.has(parsed.source as SourceFilter) ? parsed.source as SourceFilter : DEFAULT_FILTERS.source,
      search: typeof parsed.search === "string" ? parsed.search.slice(0, 120) : DEFAULT_FILTERS.search,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function brazilDayKey() {
  const [day, month, year] = todayBR().split("/");
  return `${year}${month}${day}`;
}

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

function isDue(value?: string) {
  const due = parseBrDate(value);
  const current = parseBrDate(todayBR());
  return due !== null && current !== null && due <= current;
}

function shortStage(stage?: string) {
  if (stage === "Novo") return "NOVO";
  if (stage === "Em contato") return "EC";
  const match = String(stage || "").match(/^Follow-Up\s+(\d+)$/i);
  return match ? `D${match[1]}` : String(stage || "—");
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
  return Boolean((lead as OperationalLead).whatsappNeedsAttention);
}

function isDeleted(lead: Lead) {
  return Boolean((lead as OperationalLead)._deleted);
}

interface FollowUpOperationsPanelProps {
  leads: Lead[];
  allLeads?: Lead[];
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
}

export function FollowUpOperationsPanel({ leads, allLeads, onUpdateLead }: FollowUpOperationsPanelProps) {
  const { user, currentClinic } = useAuth();
  const { status, queueMessages } = useWhatsAppAgent();
  const base = allLeads || leads;
  const today = todayBR();
  const filtersStorageKey = user?.uid && currentClinic
    ? `rede-leads:follow-up-filters:v2:${user.uid}:${currentClinic}`
    : "";
  const [initialFilters] = useState(() => readStoredFilters(filtersStorageKey));

  const [stage, setStage] = useState<StageFilter>(initialFilters.stage);
  const [view, setView] = useState<ViewFilter>(initialFilters.view);
  const [service, setService] = useState(initialFilters.service);
  const [attendance, setAttendance] = useState<AttendanceFilter>(initialFilters.attendance);
  const [source, setSource] = useState<SourceFilter>(initialFilters.source);
  const [search, setSearch] = useState(initialFilters.search);
  const [hydratedStorageKey, setHydratedStorageKey] = useState(filtersStorageKey);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queuedLeadIds, setQueuedLeadIds] = useState<Set<string>>(new Set());
  const [todayQueueLeadIds, setTodayQueueLeadIds] = useState<Set<string>>(new Set());
  const [todayPendingLeadIds, setTodayPendingLeadIds] = useState<Set<string>>(new Set());
  const [variants, setVariants] = useState<string[]>([]);
  const [singleLead, setSingleLead] = useState<Lead | null>(null);
  const [singleMessage, setSingleMessage] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState<string>("");

  useEffect(() => {
    if (!currentClinic) {
      setTodayQueueLeadIds(new Set());
      setTodayPendingLeadIds(new Set());
      return;
    }

    const dayKey = brazilDayKey();
    const queueQuery = query(
      collection(db, "clinics", currentClinic, "whatsappQueue"),
      orderBy("updatedAt", "desc"),
      limit(250),
    );

    return onSnapshot(queueQuery, (snapshot) => {
      const processed = new Set<string>();
      const pending = new Set<string>();
      snapshot.docs.forEach((item) => {
        const data = item.data() as { kind?: string; dayKey?: string; status?: string; leadId?: string };
        if (data.kind !== "followup" || !data.leadId) return;
        if (["pending", "leased"].includes(String(data.status))) pending.add(String(data.leadId));
        if (data.dayKey === dayKey && ["pending", "leased", "sent"].includes(String(data.status))) processed.add(String(data.leadId));
      });
      setTodayQueueLeadIds(processed);
      setTodayPendingLeadIds(pending);
    }, () => {
      // A fila continua protegida contra duplicidade no servidor se a leitura em tempo real falhar.
    });
  }, [currentClinic]);

  useEffect(() => {
    if (filtersStorageKey === hydratedStorageKey) return;

    const restored = readStoredFilters(filtersStorageKey);
    setStage(restored.stage);
    setView(restored.view);
    setService(restored.service);
    setAttendance(restored.attendance);
    setSource(restored.source);
    setSearch(restored.search);
    setSelected(new Set());
    setActiveLeadId("");
    setHydratedStorageKey(filtersStorageKey);
  }, [filtersStorageKey, hydratedStorageKey]);

  useEffect(() => {
    if (!filtersStorageKey || hydratedStorageKey !== filtersStorageKey) return;

    try {
      localStorage.setItem(filtersStorageKey, JSON.stringify({
        stage,
        view,
        service,
        attendance,
        source,
        search,
      } satisfies FollowUpFilters));
    } catch {
      // A tela segue funcionando normalmente quando o navegador bloqueia o armazenamento local.
    }
  }, [filtersStorageKey, hydratedStorageKey, stage, view, service, attendance, source, search]);

  const services = useMemo(() => {
    const values = base
      .filter((lead) => !isDeleted(lead))
      .map((lead) => String(lead.servicoProcurado || "").trim())
      .filter(Boolean);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [base]);

  const applySecondaryFilters = useCallback((input: Lead[]) => {
    let list = input;
    if (source === "promotora") list = list.filter(isPromotora);
    if (source === "indicacao") list = list.filter(isIndicacao);
    if (source === "organico") list = list.filter((lead) => !isPromotora(lead) && !isIndicacao(lead));

    if (service !== "todos") list = list.filter((lead) => String(lead.servicoProcurado || "") === service);
    if (attendance === "nao_compareceu") list = list.filter((lead) => lead.comparecimento === "NÃO COMPARECEU");
    if (attendance === "compareceu") list = list.filter((lead) => lead.comparecimento === "COMPARECEU");
    if (attendance === "sem_status") list = list.filter((lead) => !lead.comparecimento);

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((lead) =>
        String(lead.nome || "").toLowerCase().includes(term) ||
        String(lead.telefone || "").replace(/\D/g, "").includes(term.replace(/\D/g, ""))
      );
    }

    return list;
  }, [source, service, attendance, search]);

  const sentTodayLeadIds = useMemo(() => new Set(
    base.filter((lead) => lead.lastFollowUpDone === today).map((lead) => lead.id),
  ), [base, today]);

  const processedTodayLeadIds = useMemo(() => new Set([
    ...todayQueueLeadIds,
    ...todayPendingLeadIds,
    ...sentTodayLeadIds,
    ...queuedLeadIds,
  ]), [todayQueueLeadIds, todayPendingLeadIds, sentTodayLeadIds, queuedLeadIds]);

  const dailyCapacityRemaining = Math.max(0, DAILY_FOLLOW_UP_LIMIT - processedTodayLeadIds.size);

  const dailyCandidates = useMemo(() => {
    const eligible = base.filter((lead) => (
      !isDeleted(lead)
      && ACTIVE_STAGES.has(lead.etapaLead)
      && lead.comparecimento !== "COMPARECEU"
      && !needsAttention(lead)
      && !lead.followUpCadenceCompletedAt
      && !processedTodayLeadIds.has(lead.id)
      && (!String(lead.dataFollowUp || "").trim() || isDue(lead.dataFollowUp))
      && (!String(lead.dataAgendamento || "").trim() || lead.comparecimento === "NÃO COMPARECEU")
    ));

    return applySecondaryFilters(eligible).sort((a, b) => {
      const aNoShow = a.comparecimento === "NÃO COMPARECEU";
      const bNoShow = b.comparecimento === "NÃO COMPARECEU";
      if (aNoShow !== bNoShow) return aNoShow ? -1 : 1;

      const overdueDiff = daysSince(b.dataFollowUp) - daysSince(a.dataFollowUp);
      if (overdueDiff !== 0) return overdueDiff;

      const aStage = STAGES.findIndex((item) => item.stage === a.etapaLead);
      const bStage = STAGES.findIndex((item) => item.stage === b.etapaLead);
      return aStage - bStage;
    });
  }, [base, processedTodayLeadIds, applySecondaryFilters]);

  const filtered = useMemo(() => {
    if (stage === "daily_queue") return dailyCandidates.slice(0, dailyCapacityRemaining);

    let list = applySecondaryFilters(base.filter((lead) => !isDeleted(lead) && lead.etapaLead === stage));

    if (view === "vencidos") {
      list = list.filter((lead) => !!lead.dataFollowUp && daysSince(lead.dataFollowUp) >= 1 && lead.lastFollowUpDone !== today);
    } else if (view === "hoje") {
      list = list.filter((lead) => lead.dataFollowUp === today || lead.lastFollowUpDone === today);
    }

    return list.sort((a, b) => {
      if (needsAttention(a) !== needsAttention(b)) return needsAttention(a) ? -1 : 1;
      return daysSince(b.lastFollowUpDone || b.dataFollowUp) - daysSince(a.lastFollowUpDone || a.dataFollowUp);
    });
  }, [base, stage, view, today, dailyCandidates, dailyCapacityRemaining, applySecondaryFilters]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STAGES.forEach(({ stage: itemStage }) => {
      counts[itemStage] = base.filter((lead) => !isDeleted(lead) && lead.etapaLead === itemStage).length;
    });
    return counts;
  }, [base]);

  useEffect(() => {
    setSelected(new Set());
    setVariants(stage === "daily_queue" ? [] : templatesFor(stage, attendance === "nao_compareceu"));
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
  const isDailyQueue = stage === "daily_queue";
  const selectedLeads = useMemo(() => filtered.filter((lead) => selected.has(lead.id)), [filtered, selected]);
  const batchLeads = isDailyQueue ? (selectedLeads.length ? selectedLeads : filtered) : selectedLeads;
  const previewLead = batchLeads[0] || filtered[0] || null;
  const usableVariants = variants.map((v) => v.trim()).filter(Boolean);
  const activeFilterCount = [
    !isDailyQueue && view !== "todos",
    service !== "todos",
    attendance !== "todos",
    source !== "todos",
    Boolean(search.trim()),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setView("todos");
    setService("todos");
    setAttendance("todos");
    setSource("todos");
    setSearch("");
    setSelected(new Set());
    setActiveLeadId("");
  };

  const toggleAll = () => {
    if (!isDailyQueue && filtered.length > 40) {
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
    if (!batchLeads.length) return toast.info("A fila de hoje já está completa ou não há contatos vencidos.");
    setActiveVariantIndex(0);
    setBatchOpen(true);
  };

  const automaticMessageFor = (lead: Lead) => {
    const options = templatesFor(lead.etapaLead as LeadStage, lead.comparecimento === "NÃO COMPARECEU")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!options.length) return "";
    const template = options[(lead.followUpCount || 0) % options.length];
    return personalize(template, lead);
  };

  const stageBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    batchLeads.forEach((lead) => {
      const label = shortStage(lead.etapaLead);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()];
  }, [batchLeads]);

  const queueBatch = async () => {
    if (!batchLeads.length) return toast.error("Nenhum lead disponível para a fila.");
    if (!isDailyQueue && batchLeads.length > 40) return toast.error("O limite por lote é 40 leads.");
    if (!isDailyQueue && !usableVariants.length) return toast.error("Escreva pelo menos uma mensagem.");
    if (!status.connected) return toast.error("WhatsApp está desconectado.");

    if (!isDailyQueue) {
      const ok = window.confirm(`Colocar ${batchLeads.length} follow-up(s) na fila?\n\nO agente enviará um por vez, com intervalo aleatório de segurança.`);
      if (!ok) return;
    }

    setSending(true);
    try {
      const items = batchLeads.map((lead, index) => ({
        leadId: lead.id,
        phone: lead.telefone,
        name: lead.nome,
        message: isDailyQueue
          ? automaticMessageFor(lead)
          : personalize(usableVariants[index % usableVariants.length], lead),
        kind: "followup" as const,
        stage: lead.etapaLead,
        nextStage: nextStage(lead.etapaLead as LeadStage),
      })).filter((item) => item.message.trim());

      let queued = 0;
      let skipped = 0;
      const queuedIds: string[] = [];
      for (let index = 0; index < items.length; index += 50) {
        const result = await queueMessages(items.slice(index, index + 50));
        queued += result.queued;
        skipped += result.skipped;
        queuedIds.push(...result.queuedIds);
      }

      setQueuedLeadIds((current) => new Set([...current, ...queuedIds]));
      toast.success(`${queued} follow-up(s) colocado(s) na fila. O agente enviará espaçado.`);
      if (skipped) toast.info(`${skipped} item(ns) foram ignorados por trava de duplicidade/estado.`);
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

      {isDailyQueue && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><CalendarDays className="h-5 w-5" /></div>
              <div>
                <p className="font-semibold">Fila de hoje pronta</p>
                <p className="mt-0.5 text-xs text-muted-foreground">O Rede Leads escolheu os contatos vencidos mais importantes entre D1 e D12.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border bg-background px-2.5 py-1 font-medium">{processedTodayLeadIds.size}/{DAILY_FOLLOW_UP_LIMIT} preparados</span>
              {todayPendingLeadIds.size > 0 && <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700">{todayPendingLeadIds.size} rodando</span>}
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">{dailyCandidates.length} vencidos na base</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Visão de trabalho</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { setStage("daily_queue"); setActiveLeadId(""); }}
            className={`px-2.5 py-1 rounded-full border text-xs font-semibold transition inline-flex items-center gap-1.5 ${isDailyQueue ? "border-primary bg-primary/10 text-primary ring-1 ring-primary" : "bg-muted/50 text-muted-foreground border-muted hover:bg-muted"}`}
          >
            <ListChecks className="h-3.5 w-3.5" /> FILA DE HOJE
          </button>
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isDailyQueue ? (
          <div className="flex flex-wrap gap-1 bg-muted/40 rounded-lg p-1 w-fit">
            {(["vencidos", "hoje", "todos"] as ViewFilter[]).map((item) => (
              <button key={item} onClick={() => { setView(item); setActiveLeadId(""); }} className={`px-3 py-1.5 rounded-md text-sm ${view === item ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>
                {item === "vencidos" ? "Vencidos" : item === "hoje" ? "Hoje" : "Todos"}
              </button>
            ))}
          </div>
        ) : <span className="text-xs text-muted-foreground">Prioridade: não compareceu → mais atrasados → etapas iniciais.</span>}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{activeFilterCount ? `${activeFilterCount} filtro${activeFilterCount === 1 ? "" : "s"} ativo${activeFilterCount === 1 ? "" : "s"} • salvo${activeFilterCount === 1 ? "" : "s"} automaticamente` : "Filtros salvos automaticamente"}</span>
          {activeFilterCount > 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={clearFilters}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(430px,0.95fr)] gap-4 items-start">
        <div className="min-w-0">
          <div className="border rounded-lg overflow-hidden flex flex-col xl:h-[650px]">
            <div className="flex items-center justify-between gap-3 p-2.5 bg-muted/30 border-b shrink-0">
              <button onClick={toggleAll} className="text-xs font-medium flex items-center gap-1.5 hover:text-primary">
                {filtered.length > 0 && filtered.every((lead) => selected.has(lead.id)) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {isDailyQueue ? "Selecionar fila" : "Selecionar visíveis"}
              </button>
              <span className="text-xs text-muted-foreground">{filtered.length} lead(s) {selectedLeads.length ? `• ${selectedLeads.length} selecionado(s)` : isDailyQueue ? "separados para hoje" : ""}</span>
            </div>

            <div className="max-h-[520px] xl:max-h-none xl:flex-1 min-h-0 overflow-y-auto divide-y">
              {!filtered.length && <div className="p-8 text-sm text-muted-foreground text-center">{isDailyQueue && processedTodayLeadIds.size >= DAILY_FOLLOW_UP_LIMIT ? "Meta diária preparada. Acompanhe os envios pelo sininho." : "Nenhum lead encontrado com esses filtros."}</div>}
              {filtered.map((lead) => {
                const active = activeLeadId === lead.id;
                const queued = queuedLeadIds.has(lead.id) || todayPendingLeadIds.has(lead.id);
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
                      onChange={() => setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(lead.id)) next.delete(lead.id);
                        else next.add(lead.id);
                        return next;
                      })}
                      className="h-4 w-4 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{lead.nome || "Sem nome"}</span>
                        {isDailyQueue && <span className="text-[10px] rounded-full border bg-muted px-1.5 py-0.5 font-bold">{shortStage(lead.etapaLead)}</span>}
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
                <p className="text-xs font-semibold">{isDailyQueue ? `${batchLeads.length} contato(s) prontos para hoje` : selectedLeads.length ? `${selectedLeads.length} lead(s) prontos para o lote` : "Selecione os leads do lote"}</p>
                <p className="text-[11px] text-muted-foreground truncate">{isDailyQueue ? "Sem seleção manual, o sistema prepara toda a fila mostrada." : "As mensagens e o envio abrem em uma janela, sem precisar descer a página."}</p>
              </div>
              <Button size="sm" onClick={openBatch} disabled={!batchLeads.length || !status.connected}>
                <Send className="h-4 w-4 mr-1.5" />
                {isDailyQueue ? `Preparar fila (${batchLeads.length})` : `Preparar envio${selectedLeads.length ? ` (${selectedLeads.length})` : ""}`}
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
            <DialogTitle>{isDailyQueue ? `Fila de hoje • ${batchLeads.length} contatos` : `Preparar lote • ${stage.replace("Follow-Up ", "D")} • ${batchLeads.length} lead(s)`}</DialogTitle>
          </DialogHeader>

          {isDailyQueue ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm font-semibold">Tudo organizado automaticamente</p>
                <p className="mt-1 text-xs text-muted-foreground">Cada lead receberá a mensagem correspondente à etapa atual. Depois do envio confirmado, o sistema avança a etapa e agenda sozinho a próxima data.</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Distribuição da fila</p>
                <div className="flex flex-wrap gap-1.5">
                  {stageBreakdown.map(([label, count]) => <span key={label} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium">{label} · {count}</span>)}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amostra das mensagens</p>
                {batchLeads.slice(0, 3).map((lead) => (
                  <div key={lead.id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold">{lead.nome || "Sem nome"}</span>
                      <span className="rounded-full bg-background px-2 py-0.5 font-bold">{shortStage(lead.etapaLead)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{automaticMessageFor(lead)}</p>
                  </div>
                ))}
              </div>
              {batchLeads.length > 3 && <p className="text-xs text-muted-foreground">Mais {batchLeads.length - 3} contato(s) seguirão a mesma regra por etapa.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Mensagens do lote</p>
                  <p className="text-xs text-muted-foreground">Até 3 variações intercaladas automaticamente. Quebras de linha são preservadas.</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setVariants(templatesFor(stage as LeadStage, attendance === "nao_compareceu")); setActiveVariantIndex(0); }}>Carregar sugeridas</Button>
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
            </div>
          )}

          <p className="text-xs text-muted-foreground">Fila automática: um follow-up por vez, respeitando o intervalo de segurança.</p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>Cancelar</Button>
            <Button onClick={queueBatch} disabled={sending || !batchLeads.length || (!isDailyQueue && !usableVariants.length) || !status.connected}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Colocando na fila..." : isDailyQueue ? `Iniciar ${batchLeads.length} follow-up${batchLeads.length === 1 ? "" : "s"}` : `Enviar ${batchLeads.length} follow-up${batchLeads.length === 1 ? "" : "s"}`}
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
