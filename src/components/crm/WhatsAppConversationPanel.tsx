import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Clock3, RefreshCw, Send, UserPlus, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWhatsAppAgent } from "@/hooks/useWhatsAppAgent";
import { useAuth } from "@/hooks/useAuth";
import { resolveServiceOptions } from "@/lib/serviceCatalog";
import { fetchActiveCampaignList } from "@/services/campaignService";
import { Lead } from "@/types/crm";

export type WhatsAppConversationTarget = {
  id?: string;
  phone: string;
  name?: string;
  leadId?: string;
  metaCampanhaId?: string;
  metaCampanhaNome?: string;
  fonteLead?: string;
  lastMessage?: string;
  lastMessageAt?: string | null;
  lastMessageStatus?: string;
};

export type WhatsAppConversationMessage = {
  id: string;
  phone: string;
  leadId?: string;
  direction: "in" | "out";
  text: string;
  messageType: string;
  messageId?: string;
  createdAt: string;
  status?: string;
};

type Props = {
  target: WhatsAppConversationTarget | null;
  lead?: Lead | null;
  onLeadLinked?: (lead: Lead) => void;
  className?: string;
  height?: string;
  showQuickRegistration?: boolean;
};

function canonicalPhoneKey(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === "9") digits = `${digits.slice(0, 2)}${digits.slice(3)}`;
  if (digits.length !== 10) return "";
  return `55${digits}`;
}

function newerIso(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) || "";
}

function messageTime(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status?: string) {
  if (status === "pending") return { label: "Aguardando", Icon: Clock3 };
  if (status === "delivered") return { label: "Entregue", Icon: CheckCheck };
  if (status === "read") return { label: "Lida", Icon: CheckCheck };
  if (status === "played") return { label: "Ouvida", Icon: CheckCheck };
  if (status === "failed") return { label: "Falhou", Icon: Clock3 };
  return { label: "Enviada", Icon: Check };
}

export function WhatsAppConversationPanel({
  target,
  lead,
  onLeadLinked,
  className = "",
  height = "620px",
  showQuickRegistration = true,
}: Props) {
  const { currentClinic, clinicMeta } = useAuth();
  const { status, fetchMessages, queueMessages, markChatRead, createLeadFromChat } = useWhatsAppAgent();
  const [messages, setMessages] = useState<WhatsAppConversationMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const messageSinceRef = useRef("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const chatId = useMemo(() => target?.id || canonicalPhoneKey(target?.phone || ""), [target?.id, target?.phone]);
  const serviceOptions = useMemo(() => resolveServiceOptions(clinicMeta as any, []), [clinicMeta]);
  const linked = Boolean(lead?.id || target?.leadId);

  useEffect(() => {
    setName(lead?.nome || target?.name || "");
    setService(lead?.servicoProcurado || "");
    setCampaignId(lead?.metaCampanhaId || target?.metaCampanhaId || "");
    setRegistering(false);
  }, [chatId, lead?.id, lead?.nome, lead?.servicoProcurado, lead?.metaCampanhaId, target?.name, target?.metaCampanhaId]);

  useEffect(() => {
    if (!currentClinic || linked) return;
    fetchActiveCampaignList(currentClinic).then(setCampaigns).catch(() => setCampaigns([]));
  }, [currentClinic, linked]);

  const loadMessages = useCallback(async (forceFull = false) => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const since = forceFull ? "" : messageSinceRef.current;
      const items = await fetchMessages(chatId, since);
      setMessages((current) => {
        const map = new Map<string, WhatsAppConversationMessage>();
        if (since) current.forEach((item) => map.set(item.id, item));
        items.forEach((item: WhatsAppConversationMessage) => map.set(item.id, item));
        return [...map.values()].sort((a, b) => {
          const byTime = messageTime(a.createdAt) - messageTime(b.createdAt);
          return byTime || a.id.localeCompare(b.id);
        });
      });
      const maxCreated = newerIso(items.map((item: WhatsAppConversationMessage) => item.createdAt));
      if (maxCreated) messageSinceRef.current = maxCreated;
      if (items.some((item: WhatsAppConversationMessage) => item.direction === "in")) {
        await markChatRead(chatId).catch(() => {});
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar conversa");
    } finally {
      setLoading(false);
    }
  }, [chatId, fetchMessages, markChatRead]);

  useEffect(() => {
    messageSinceRef.current = "";
    setMessages([]);
    if (!chatId) return;
    loadMessages(true);
    const timer = window.setInterval(() => loadMessages(false), 4500);
    return () => window.clearInterval(timer);
  }, [chatId, loadMessages]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, chatId]);

  const send = async () => {
    if (!target?.phone || !text.trim()) return;
    if (!status.connected) return toast.error("WhatsApp está desconectado.");
    setSending(true);
    try {
      const body = text.trim();
      const result = await queueMessages([{
        leadId: lead?.id || target.leadId || chatId,
        phone: target.phone,
        name: lead?.nome || target.name || target.phone,
        message: body,
        kind: "manual",
      }]);
      if (!result.queued) throw new Error("Não foi possível colocar a mensagem na fila.");
      setText("");
      toast.success("Mensagem enviada para o agente.");
      window.setTimeout(() => loadMessages(false), 1200);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  const saveLead = async () => {
    if (!target?.phone || !chatId) return;
    if (!name.trim()) return toast.error("Informe o nome do lead.");
    setSavingLead(true);
    try {
      const selectedCampaign = campaigns.find((item) => item.id === campaignId);
      const firstInbound = messages.find((item) => item.direction === "in")?.text || target.lastMessage || "Primeiro contato recebido pelo WhatsApp";
      const result = await createLeadFromChat({
        chatId,
        phone: target.phone,
        name: name.trim(),
        servicoProcurado: service,
        fonteLead: target.fonteLead || "Online",
        etapaLead: "Novo",
        status: "MORNO",
        observacao: `Primeiro contato via WhatsApp: "${firstInbound}"`,
        metaCampanhaId: campaignId || target.metaCampanhaId || "",
        metaCampanhaNome: selectedCampaign?.name || target.metaCampanhaNome || "",
      });
      if (result?.lead) onLeadLinked?.(result.lead as Lead);
      setRegistering(false);
      toast.success(result?.created ? "Lead cadastrado sem sair da conversa." : "Contato já existia e foi vinculado à conversa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao cadastrar lead");
    } finally {
      setSavingLead(false);
    }
  };

  if (!target) {
    return (
      <div className={`border rounded-xl bg-card flex items-center justify-center text-muted-foreground ${className}`} style={{ height }}>
        Selecione um lead ou uma conversa.
      </div>
    );
  }

  return (
    <div className={`border rounded-xl bg-card overflow-hidden flex flex-col min-h-0 ${className}`} style={{ height }}>
      <div className="shrink-0 border-b p-3 flex items-start justify-between gap-3 bg-card">
        <div className="min-w-0">
          <div className="font-semibold truncate">{lead?.nome || target.name || target.phone}</div>
          <div className="text-xs text-muted-foreground truncate">{target.phone}</div>
          {lead ? (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{lead.etapaLead}</span>
              {lead.servicoProcurado && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{lead.servicoProcurado}</span>}
              {lead.comparecimento === "NÃO COMPARECEU" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">Não compareceu</span>}
            </div>
          ) : target.metaCampanhaNome ? (
            <div className="text-[11px] mt-1 text-emerald-700">Meta Ads • {target.metaCampanhaNome}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => loadMessages(true)} disabled={loading} title="Atualizar conversa">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <span className={`text-[11px] px-2 py-1 rounded-full border flex items-center gap-1 ${status.connected ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
            {status.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {status.connected ? "Conectado" : "Offline"}
          </span>
        </div>
      </div>

      {!linked && showQuickRegistration && (
        <div className="shrink-0 border-b bg-blue-50/70 p-3">
          {!registering ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-blue-950">Novo contato ainda sem cadastro</p>
                <p className="text-xs text-blue-800">Cadastre aqui mesmo. Nome, telefone e campanha já entram preenchidos quando disponíveis.</p>
              </div>
              <Button size="sm" onClick={() => setRegistering(true)}>
                <UserPlus className="h-4 w-4 mr-2" />Cadastrar lead
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
                <Select value={service || "none"} onValueChange={(value) => setService(value === "none" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Serviço procurado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Serviço ainda não informado</SelectItem>
                    {serviceOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Select value={campaignId || "none"} onValueChange={(value) => setCampaignId(value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Campanha Meta Ads" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Campanha não identificada</SelectItem>
                  {target.metaCampanhaId && target.metaCampanhaNome && !campaigns.some((item) => item.id === target.metaCampanhaId) && (
                    <SelectItem value={target.metaCampanhaId}>{target.metaCampanhaNome}</SelectItem>
                  )}
                  {campaigns.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setRegistering(false)}>Cancelar</Button>
                <Button size="sm" onClick={saveLead} disabled={savingLead || !name.trim()}>{savingLead ? "Cadastrando..." : "Cadastrar e continuar no chat"}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto bg-muted/10 p-4 flex flex-col gap-3">
        {messages.map((message) => {
          const delivery = statusLabel(message.status);
          const DeliveryIcon = delivery.Icon;
          return (
            <div key={message.id} className={`flex ${message.direction === "out" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[86%] rounded-xl px-3 py-2 text-sm shadow-sm ${message.direction === "out" ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                <div className="whitespace-pre-wrap break-words">{message.text}</div>
                <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${message.direction === "out" ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                  <span>{shortTime(message.createdAt)}</span>
                  {message.messageType !== "text" && <span>• {message.messageType}</span>}
                  {message.direction === "out" && <span className="inline-flex items-center gap-0.5" title={delivery.label}><DeliveryIcon className="h-3 w-3" />{delivery.label}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {loading && !messages.length && <div className="text-center text-xs text-muted-foreground py-8">Carregando conversa...</div>}
        {!loading && !messages.length && <div className="text-center text-xs text-muted-foreground py-8">Sem histórico anterior. As novas mensagens aparecerão aqui.</div>}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t bg-card p-3 flex gap-2 items-end">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Digite aqui... Enter envia • Shift+Enter quebra linha"
          disabled={!status.connected || sending}
          rows={2}
          className="min-h-[48px] max-h-28 resize-none"
        />
        <Button onClick={send} disabled={!status.connected || sending || !text.trim()} className="shrink-0">
          <Send className="h-4 w-4 mr-2" />{sending ? "Enviando" : "Enviar"}
        </Button>
      </div>
    </div>
  );
}
