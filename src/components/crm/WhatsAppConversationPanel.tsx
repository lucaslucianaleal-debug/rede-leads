import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Clock3, RefreshCw, Send, UserPlus, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWhatsAppAgent } from "@/hooks/useWhatsAppAgent";
import { Lead } from "@/types/crm";
import { WhatsAppLeadRegistrationDialog } from "@/components/crm/WhatsAppLeadRegistrationDialog";

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
  metaReferralHeadline?: string;
  metaReferralBody?: string;
  metaGreetingMessageBody?: string;
  metaSourceApp?: string;
  metaContainsAutoReply?: boolean;
  metaAutomatedGreetingShown?: boolean;
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

function messageTime(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function newerIso(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) || "";
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

function normalizedText(value?: string) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function adSourceLabel(source?: string) {
  const value = String(source || "").toLowerCase();
  if (value.includes("instagram")) return "Anúncio do Instagram";
  if (value.includes("facebook")) return "Anúncio do Facebook";
  return "Anúncio Meta";
}

export function WhatsAppConversationPanel({
  target,
  lead,
  onLeadLinked,
  className = "",
  height = "620px",
  showQuickRegistration = true,
}: Props) {
  const { status, fetchMessages, queueMessages, markChatRead, createLeadFromChat } = useWhatsAppAgent();
  const [messages, setMessages] = useState<WhatsAppConversationMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const messageSinceRef = useRef("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const chatId = useMemo(() => target?.id || canonicalPhoneKey(target?.phone || ""), [target?.id, target?.phone]);
  const linked = Boolean(lead?.id || target?.leadId);

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
    setRegistrationOpen(false);
    if (!chatId) return;
    loadMessages(true);
    const timer = window.setInterval(() => loadMessages(false), 4500);
    return () => window.clearInterval(timer);
  }, [chatId, loadMessages]);

  const inferredGreeting = useMemo(() => {
    if (target?.metaGreetingMessageBody) return target.metaGreetingMessageBody;
    if (!target?.metaCampanhaNome || linked) return "";

    const firstInbound = messages.find((message) => message.direction === "in");
    const firstOutbound = messages.find((message) => message.direction === "out");
    if (!firstInbound || !firstOutbound) return "";

    const inboundAt = messageTime(firstInbound.createdAt);
    const outboundAt = messageTime(firstOutbound.createdAt);
    if (!inboundAt || !outboundAt) return "";

    // A saudação automática do anúncio pode chegar no stream alguns segundos depois
    // da primeira mensagem do paciente. Só tratamos como contexto Meta nessa janela curta.
    if (outboundAt >= inboundAt - 30000 && outboundAt <= inboundAt + 5000) {
      return firstOutbound.text || "";
    }
    return "";
  }, [messages, target?.metaGreetingMessageBody, target?.metaCampanhaNome, linked]);

  const greetingToShow = target?.metaGreetingMessageBody || inferredGreeting || "";
  const greetingText = normalizedText(greetingToShow);
  const visibleMessages = useMemo(() => {
    if (!greetingText) return messages;
    return messages.filter((message) => {
      return !(message.direction === "out" && normalizedText(message.text) === greetingText);
    });
  }, [messages, greetingText]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visibleMessages.length, chatId]);

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

  if (!target) {
    return (
      <div className={`border rounded-xl bg-card flex items-center justify-center text-muted-foreground ${className}`} style={{ height }}>
        Selecione um lead ou uma conversa.
      </div>
    );
  }

  const referralBodyIsGreeting = Boolean(greetingToShow && normalizedText(target.metaReferralBody) === normalizedText(greetingToShow));
  const adContextVisible = Boolean(
    target.metaReferralHeadline ||
    target.metaReferralBody ||
    greetingToShow ||
    target.metaCampanhaNome
  );

  return (
    <>
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
          <div className="shrink-0 border-b bg-blue-50/70 p-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-blue-950">Novo contato ainda sem cadastro</p>
              <p className="text-xs text-blue-800">Abra o cadastro completo sem sair da conversa. Nome, telefone e campanha já entram preenchidos.</p>
            </div>
            <Button size="sm" onClick={() => setRegistrationOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />Cadastrar lead
            </Button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto bg-muted/10 p-4 flex flex-col gap-3">
          {adContextVisible && (
            <div className="mx-auto w-full max-w-[560px] rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950">
              <div className="font-semibold">{adSourceLabel(target.metaSourceApp)}</div>
              {target.metaReferralHeadline && <div className="mt-1">{target.metaReferralHeadline}</div>}
              {target.metaReferralBody && !referralBodyIsGreeting && <div className="mt-1 text-emerald-800">{target.metaReferralBody}</div>}
              {greetingToShow && (
                <div className="mt-2 rounded-md bg-white/70 border border-emerald-100 px-2 py-1.5">
                  <span className="font-medium">Mensagem de saudação automática:</span> {greetingToShow}
                </div>
              )}
              {!target.metaReferralHeadline && !target.metaReferralBody && !greetingToShow && target.metaCampanhaNome && (
                <div className="mt-1 text-emerald-800">Campanha: {target.metaCampanhaNome}</div>
              )}
            </div>
          )}

          {visibleMessages.map((message) => {
            const delivery = statusLabel(message.status);
            const DeliveryIcon = delivery.Icon;
            return (
              <div key={message.id} className={`flex ${message.direction === "out" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[86%] rounded-xl px-3 py-2 text-sm shadow-sm ${message.direction === "out" ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                  <div className="whitespace-pre-wrap break-words">{message.text}</div>
                  <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${message.direction === "out" ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                    <span>{shortTime(message.createdAt)}</span>
                    {message.messageType !== "text" && <span>• {message.messageType}</span>}
                    {message.direction === "out" && (
                      <span className="inline-flex items-center gap-0.5" title={delivery.label}>
                        <DeliveryIcon className="h-3 w-3" />{delivery.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {loading && !visibleMessages.length && <div className="text-center text-xs text-muted-foreground py-8">Carregando conversa...</div>}
          {!loading && !visibleMessages.length && <div className="text-center text-xs text-muted-foreground py-8">Sem histórico anterior. As novas mensagens aparecerão aqui.</div>}
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

      {!linked && showQuickRegistration && (
        <WhatsAppLeadRegistrationDialog
          open={registrationOpen}
          onClose={() => setRegistrationOpen(false)}
          initialName={target.name || ""}
          initialPhone={target.phone}
          initialCampaignId={target.metaCampanhaId || ""}
          initialCampaignName={target.metaCampanhaNome || ""}
          initialSource={target.fonteLead || "Online"}
          contextText={`${target.metaReferralHeadline || ""} ${target.metaReferralBody || ""} ${greetingToShow}`}
          onSave={async (form, selectedCampaignId, campaignName) => {
            try {
              const result = await createLeadFromChat({
                chatId,
                phone: form.telefone,
                name: form.nome,
                dataCriacao: form.dataCriacao,
                dataContato: form.dataContato,
                servicoProcurado: form.servicoProcurado,
                captador: form.captador,
                fonteLead: form.fonteLead,
                etapaLead: form.etapaLead,
                status: form.status,
                respostaLead: form.respostaLead,
                comparecimento: form.comparecimento,
                dataFollowUp: form.dataFollowUp,
                dataAgendamento: form.dataAgendamento,
                dataRetornoLigacao: form.dataRetornoLigacao,
                observacao: form.observacao,
                followUpCount: form.followUpCount,
                lembretes: form.lembretes,
                customFields: form.customFields,
                metaCampanhaId: selectedCampaignId || target.metaCampanhaId || "",
                metaCampanhaNome: campaignName || target.metaCampanhaNome || "",
              });
              if (result?.lead) onLeadLinked?.(result.lead as Lead);
              toast.success(result?.created ? "Lead cadastrado e conversa mantida aberta." : "Contato já existia e foi vinculado à conversa.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Erro ao cadastrar lead");
              throw error;
            }
          }}
        />
      )}
    </>
  );
}