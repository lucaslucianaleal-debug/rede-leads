import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  MessageCircleReply,
  Send,
  Wifi,
  WifiOff,
} from "lucide-react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

type QueueOperation = {
  id: string;
  leadId?: string;
  name?: string;
  phone?: string;
  kind?: "followup" | "manual";
  status?: "pending" | "leased" | "sent" | "failed" | "cancelled";
  automationType?: string;
  automationLabel?: string;
  dayKey?: string;
  createdAt?: string;
  updatedAt?: string;
  sentAt?: string;
  failedAt?: string;
  error?: string;
};

type ChatOperation = {
  id: string;
  name?: string;
  phone?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastDirection?: "in" | "out";
};

type AgentOperation = {
  connected?: boolean;
  lastSeenAt?: string;
  lastError?: string | null;
};

type OperationEvent = {
  id: string;
  type: "reply" | "sent" | "pending" | "failed";
  title: string;
  detail: string;
  at: string;
};

function brazilDayKey(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}${get("month")}${get("day")}`;
}

function eventTime(value?: string) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortEventTime(value?: string) {
  const parsed = new Date(String(value || ""));
  if (Number.isNaN(parsed.getTime())) return "";
  const sameDay = brazilDayKey(parsed) === brazilDayKey();
  return sameDay
    ? parsed.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : parsed.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function queueEvent(operation: QueueOperation): OperationEvent | null {
  const at = operation.sentAt || operation.failedAt || operation.updatedAt || operation.createdAt || "";
  const name = operation.name || operation.phone || "Contato";
  const label = operation.automationLabel || "Mensagem prioritária";

  if (operation.status === "failed") {
    return {
      id: `queue-${operation.id}`,
      type: "failed",
      title: `Falha no envio para ${name}`,
      detail: operation.error || label,
      at,
    };
  }

  if (operation.kind === "manual" && ["pending", "leased"].includes(String(operation.status))) {
    return {
      id: `queue-${operation.id}`,
      type: "pending",
      title: `${label} na fila prioritária`,
      detail: name,
      at,
    };
  }

  if (operation.status === "sent") {
    const isAppointment = String(operation.automationType || "").startsWith("appointment_");
    return {
      id: `queue-${operation.id}`,
      type: "sent",
      title: isAppointment ? `${label} enviada` : "Follow-up enviado",
      detail: name,
      at,
    };
  }

  return null;
}

function EventIcon({ type }: { type: OperationEvent["type"] }) {
  if (type === "reply") return <MessageCircleReply className="h-4 w-4 text-emerald-600" />;
  if (type === "failed") return <AlertCircle className="h-4 w-4 text-red-600" />;
  if (type === "pending") return <Clock3 className="h-4 w-4 text-blue-600" />;
  return <Send className="h-4 w-4 text-primary" />;
}

export function OperationsBell({ onOpenInbox }: { onOpenInbox?: () => void }) {
  const { currentClinic, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueOperation[]>([]);
  const [chatItems, setChatItems] = useState<ChatOperation[]>([]);
  const [agent, setAgent] = useState<AgentOperation>({});
  const [loadError, setLoadError] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const seenStorageKey = `rede-leads-operations-seen-${user?.uid || "anon"}-${currentClinic || "none"}`;
  const [seenAt, setSeenAt] = useState(() => {
    try {
      return Number(localStorage.getItem(seenStorageKey) || Date.now());
    } catch {
      return Date.now();
    }
  });
  const previousRemainingRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      setSeenAt(Number(localStorage.getItem(seenStorageKey) || Date.now()));
    } catch {
      setSeenAt(Date.now());
    }
  }, [seenStorageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentClinic) {
      setQueueItems([]);
      setChatItems([]);
      setAgent({});
      return;
    }

    setLoadError(false);
    const queueQuery = query(
      collection(db, "clinics", currentClinic, "whatsappQueue"),
      orderBy("updatedAt", "desc"),
      limit(80),
    );
    const chatQuery = query(
      collection(db, "clinics", currentClinic, "whatsappChats"),
      orderBy("lastMessageAt", "desc"),
      limit(30),
    );

    const unsubscribeQueue = onSnapshot(queueQuery, (snapshot) => {
      setQueueItems(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<QueueOperation, "id">) })));
    }, () => setLoadError(true));
    const unsubscribeChats = onSnapshot(chatQuery, (snapshot) => {
      setChatItems(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ChatOperation, "id">) })));
    }, () => setLoadError(true));
    const unsubscribeAgent = onSnapshot(
      doc(db, "clinics", currentClinic, "integrations", "whatsappAgent"),
      (snapshot) => setAgent(snapshot.exists() ? snapshot.data() as AgentOperation : {}),
      () => setLoadError(true),
    );

    return () => {
      unsubscribeQueue();
      unsubscribeChats();
      unsubscribeAgent();
    };
  }, [currentClinic]);

  const pendingFollowups = queueItems.filter((item) => item.kind === "followup" && ["pending", "leased"].includes(String(item.status)));
  const activeDayKey = pendingFollowups[0]?.dayKey || brazilDayKey();
  const batchItems = queueItems.filter((item) => item.kind === "followup" && item.dayKey === activeDayKey);
  const sentCount = batchItems.filter((item) => item.status === "sent").length;
  const failedCount = batchItems.filter((item) => item.status === "failed").length;
  const cancelledCount = batchItems.filter((item) => item.status === "cancelled").length;
  const remainingCount = batchItems.filter((item) => ["pending", "leased"].includes(String(item.status))).length;
  const completedCount = sentCount + failedCount + cancelledCount;
  const progress = batchItems.length ? Math.min(100, Math.round((completedCount / batchItems.length) * 100)) : 0;
  const priorityItems = queueItems.filter((item) => item.kind === "manual" && ["pending", "leased"].includes(String(item.status)));
  const lastSeen = eventTime(agent.lastSeenAt);
  const agentOnline = Boolean(lastSeen && clock - lastSeen < 10 * 60 * 1000);
  const agentConnected = agentOnline && agent.connected === true;
  const agentStatus = agentConnected
    ? {
        label: "Agente online",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        dotClassName: "bg-emerald-500",
      }
    : agentOnline
      ? {
          label: "Aguardando WhatsApp",
          className: "border-amber-200 bg-amber-50 text-amber-700",
          dotClassName: "bg-amber-500",
        }
      : {
          label: "Agente offline",
          className: "border-red-200 bg-red-50 text-red-700",
          dotClassName: "bg-red-500",
        };

  const events = useMemo(() => {
    const queueEvents = queueItems.map(queueEvent).filter(Boolean) as OperationEvent[];
    const replyEvents = chatItems
      .filter((chat) => chat.lastDirection === "in" && chat.lastMessageAt)
      .map((chat): OperationEvent => ({
        id: `chat-${chat.id}-${chat.lastMessageAt}`,
        type: "reply",
        title: `${chat.name || chat.phone || "Lead"} respondeu`,
        detail: chat.lastMessage || "Nova mensagem recebida",
        at: chat.lastMessageAt || "",
      }));

    return [...queueEvents, ...replyEvents]
      .sort((a, b) => eventTime(b.at) - eventTime(a.at))
      .slice(0, 14);
  }, [queueItems, chatItems]);

  const unreadCount = events.filter((event) => eventTime(event.at) > seenAt).length;
  const operationCount = remainingCount + priorityItems.length;
  const badgeCount = operationCount || unreadCount;
  const hasFailure = failedCount > 0 || Boolean(agent.lastError && !agentConnected);

  useEffect(() => {
    const previous = previousRemainingRef.current;
    if (previous !== null && previous > 0 && remainingCount === 0 && batchItems.length > 0) {
      toast.success(`Fila concluída: ${sentCount} enviado(s)${failedCount ? ` • ${failedCount} falha(s)` : ""}.`);
    }
    previousRemainingRef.current = remainingCount;
  }, [remainingCount, batchItems.length, sentCount, failedCount]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    const nextSeenAt = Date.now();
    setSeenAt(nextSeenAt);
    try {
      localStorage.setItem(seenStorageKey, String(nextSeenAt));
    } catch {
      // O histórico continua funcionando mesmo sem persistência local.
    }
  };

  return (
    <div className="flex items-center gap-1">
      <div
        className={`flex h-9 items-center gap-2 rounded-full border px-2.5 text-sm font-medium ${agentStatus.className}`}
        aria-label={agentStatus.label}
        title={agentStatus.label}
      >
        <span className={`h-2 w-2 rounded-full ${agentStatus.dotClassName}`} />
        <span className="hidden whitespace-nowrap lg:inline">{agentStatus.label}</span>
      </div>
      <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`Central de notificações${badgeCount ? `, ${badgeCount} pendência(s)` : ""}`}
          title="Central de operação"
        >
          <Bell className={`h-5 w-5 ${hasFailure ? "text-red-600" : operationCount ? "text-blue-600" : "text-foreground"}`} />
          {badgeCount > 0 && (
            <span className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${hasFailure ? "bg-red-600" : operationCount ? "bg-blue-600" : "bg-emerald-600"}`}>
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
          {operationCount > 0 && !hasFailure && <span className="absolute inset-0 rounded-full ring-2 ring-blue-400/30 animate-pulse" />}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={10} className="w-[min(390px,calc(100vw-24px))] p-0 overflow-hidden">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Central de operação</div>
              <div className="text-xs text-muted-foreground">WhatsApp, fila e respostas em tempo real</div>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${agentConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {agentConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {agentConnected ? "Agente online" : "Agente offline"}
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <div className={`rounded-lg border p-3 ${remainingCount ? "border-blue-200 bg-blue-50/70" : batchItems.length ? "border-emerald-200 bg-emerald-50/70" : "bg-muted/30"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {remainingCount ? <Clock3 className="h-4 w-4 text-blue-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                {remainingCount ? "Follow-ups em andamento" : batchItems.length ? "Fila de follow-ups concluída" : "Fila de follow-ups"}
              </div>
              {batchItems.length > 0 && <span className="text-xs font-semibold">{sentCount}/{batchItems.length}</span>}
            </div>

            {batchItems.length > 0 ? (
              <>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                  <div className={`h-full rounded-full transition-all ${remainingCount ? "bg-blue-600" : "bg-emerald-600"}`} style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{sentCount} enviados</span>
                  <span>{remainingCount} aguardando</span>
                  {cancelledCount > 0 && <span>{cancelledCount} cancelados</span>}
                  {failedCount > 0 && <span className="font-medium text-red-700">{failedCount} falhas</span>}
                </div>
                {remainingCount > 0 && <div className="mt-1.5 text-[11px] text-blue-700">Envios espaçados automaticamente entre 2,5 e 4,5 minutos.</div>}
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Nenhum follow-up aguardando envio.</p>
            )}
          </div>

          {priorityItems.length > 0 && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                <CalendarCheck2 className="h-4 w-4" />
                {priorityItems.length} mensagem(ns) prioritária(s)
              </div>
              <p className="mt-1 text-xs text-violet-700">Confirmações e mensagens do chat passam na frente dos follow-ups.</p>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Últimos acontecimentos</span>
              {unreadCount > 0 && <span className="text-[11px] font-medium text-emerald-700">{unreadCount} novo(s)</span>}
            </div>
            <ScrollArea className="h-[250px] pr-3">
              <div className="space-y-1.5">
                {events.map((event) => (
                  <div key={event.id} className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/50">
                    <div className="mt-0.5"><EventIcon type={event.type} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium leading-tight">{event.title}</div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{shortEventTime(event.at)}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{event.detail}</div>
                    </div>
                  </div>
                ))}
                {!events.length && <div className="py-8 text-center text-sm text-muted-foreground">Ainda não há movimentações recentes.</div>}
              </div>
            </ScrollArea>
          </div>

          {loadError && <div className="px-1 text-xs text-red-700">Não foi possível atualizar a central agora.</div>}
        </div>

        {onOpenInbox && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                handleOpenChange(false);
                onOpenInbox();
              }}
            >
              <MessageCircleReply className="mr-2 h-4 w-4" /> Abrir caixa de entrada
            </Button>
          </div>
        )}
      </PopoverContent>
      </Popover>
    </div>
  );
}
