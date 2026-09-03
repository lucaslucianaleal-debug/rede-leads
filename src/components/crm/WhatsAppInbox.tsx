import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, RefreshCw, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWhatsAppAgent } from "@/hooks/useWhatsAppAgent";

export type WhatsAppChatSummary = {
  id: string;
  phone: string;
  name: string;
  leadId?: string;
  lastMessage: string;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
  lastDirection?: "in" | "out";
  unreadCount?: number;
};

export type WhatsAppChatMessage = {
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

function shortTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function newerIso(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) || "";
}

export function WhatsAppInbox() {
  const { fetchChats, fetchMessages, queueMessages, markChatRead, status } = useWhatsAppAgent();
  const [chats, setChats] = useState<WhatsAppChatSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [messages, setMessages] = useState<WhatsAppChatMessage[]>([]);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const chatSinceRef = useRef("");
  const messageSinceRef = useRef("");

  const selectedChat = chats.find((chat) => chat.id === selectedId) || null;

  const loadChats = useCallback(async (forceFull = false) => {
    setLoadingChats(true);
    try {
      const since = forceFull ? "" : chatSinceRef.current;
      const items = await fetchChats(since);

      setChats((current) => {
        const map = new Map<string, WhatsAppChatSummary>();
        if (since) current.forEach((item) => map.set(item.id, item));
        items.forEach((item: WhatsAppChatSummary) => map.set(item.id, item));
        const next = [...map.values()].sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")));
        return next;
      });

      const maxUpdated = newerIso(items.map((item: WhatsAppChatSummary) => item.updatedAt || item.lastMessageAt));
      if (maxUpdated) chatSinceRef.current = maxUpdated;
      if (!selectedId && items.length) setSelectedId(items[0].id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar conversas");
    } finally {
      setLoadingChats(false);
    }
  }, [fetchChats, selectedId]);

  const loadMessages = useCallback(async (forceFull = false) => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const since = forceFull ? "" : messageSinceRef.current;
      const items = await fetchMessages(selectedId, since);
      setMessages((current) => {
        const map = new Map<string, WhatsAppChatMessage>();
        if (since) current.forEach((item) => map.set(item.id, item));
        items.forEach((item: WhatsAppChatMessage) => map.set(item.id, item));
        return [...map.values()].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      });
      const maxCreated = newerIso(items.map((item: WhatsAppChatMessage) => item.createdAt));
      if (maxCreated) messageSinceRef.current = maxCreated;
      if (items.some((item: WhatsAppChatMessage) => item.direction === "in")) {
        await markChatRead(selectedId).catch(() => {});
        setChats((current) => current.map((chat) => chat.id === selectedId ? { ...chat, unreadCount: 0 } : chat));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar mensagens");
    } finally {
      setLoadingMessages(false);
    }
  }, [fetchMessages, markChatRead, selectedId]);

  useEffect(() => {
    chatSinceRef.current = "";
    loadChats(true);
    const timer = window.setInterval(() => loadChats(false), 12000);
    return () => window.clearInterval(timer);
  }, [loadChats]);

  useEffect(() => {
    messageSinceRef.current = "";
    setMessages([]);
    loadMessages(true);
    if (!selectedId) return;
    const timer = window.setInterval(() => loadMessages(false), 6000);
    return () => window.clearInterval(timer);
  }, [loadMessages, selectedId]);

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return chats;
    return chats.filter((chat) =>
      chat.name.toLowerCase().includes(term) ||
      chat.phone.includes(term) ||
      chat.lastMessage.toLowerCase().includes(term)
    );
  }, [chats, search]);

  const send = async () => {
    if (!selectedChat || !text.trim()) return;
    if (!status.connected) {
      toast.error("Conecte o WhatsApp antes de enviar mensagens.");
      return;
    }
    setSending(true);
    try {
      const body = text.trim();
      const result = await queueMessages([{
        leadId: selectedChat.leadId || selectedChat.id,
        phone: selectedChat.phone,
        name: selectedChat.name,
        message: body,
        kind: "manual",
      }]);
      if (!result.queued) throw new Error("Não foi possível colocar a mensagem na fila.");
      setText("");
      toast.success("Mensagem enviada para o agente do WhatsApp.");
      window.setTimeout(() => loadMessages(false), 1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  const refreshSelected = () => {
    messageSinceRef.current = "";
    loadMessages(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] min-h-[620px] border rounded-xl overflow-hidden bg-card">
      <div className="border-r bg-muted/20 flex flex-col min-h-[300px]">
        <div className="p-3 border-b flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa..." />
          <Button variant="outline" size="icon" onClick={() => loadChats(true)} disabled={loadingChats}>
            <RefreshCw className={`h-4 w-4 ${loadingChats ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <ScrollArea className="flex-1 h-[540px]">
          {filteredChats.map((chat) => {
            const active = chat.id === selectedId;
            return (
              <button
                key={chat.id}
                onClick={() => setSelectedId(chat.id)}
                className={`w-full text-left p-3 border-b hover:bg-muted/60 transition-colors ${active ? "bg-primary/10" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserRound className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{chat.name || chat.phone}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{shortTime(chat.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {chat.lastDirection === "out" ? "Você: " : ""}{chat.lastMessage || "Sem mensagens"}
                      </p>
                      {(chat.unreadCount || 0) > 0 && (
                        <span className="bg-primary text-primary-foreground rounded-full min-w-5 h-5 px-1 text-[10px] flex items-center justify-center">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {!filteredChats.length && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Nenhuma conversa comercial registrada ainda.
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex flex-col min-h-[620px]">
        {selectedChat ? (
          <>
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{selectedChat.name || selectedChat.phone}</div>
                <div className="text-xs text-muted-foreground">{selectedChat.phone}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={refreshSelected} disabled={loadingMessages} title="Atualizar mensagens">
                  <RefreshCw className={`h-4 w-4 ${loadingMessages ? "animate-spin" : ""}`} />
                </Button>
                <div className={`text-xs px-2 py-1 rounded-full border ${status.connected ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-amber-700 border-amber-200 bg-amber-50"}`}>
                  {status.connected ? "WhatsApp conectado" : "WhatsApp desconectado"}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 h-[470px] bg-muted/10">
              <div className="p-4 space-y-3">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] rounded-xl px-3 py-2 text-sm shadow-sm ${message.direction === "out" ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                      <div className="whitespace-pre-wrap break-words">{message.text}</div>
                      <div className={`text-[10px] mt-1 text-right ${message.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {shortTime(message.createdAt)}{message.messageType !== "text" ? ` • ${message.messageType}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
                {loadingMessages && !messages.length && <div className="text-center text-xs text-muted-foreground py-8">Carregando mensagens...</div>}
                {!loadingMessages && !messages.length && <div className="text-center text-xs text-muted-foreground py-8">Sem histórico nesta conversa. Vamos registrar a partir de agora.</div>}
              </div>
            </ScrollArea>

            <div className="p-3 border-t flex gap-2 items-end">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Digite uma mensagem... Shift+Enter para quebrar linha"
                disabled={!status.connected || sending}
                rows={2}
                className="min-h-[44px] max-h-32 resize-y"
              />
              <Button onClick={send} disabled={!status.connected || sending || !text.trim()}>
                <Send className="h-4 w-4 mr-2" />{sending ? "Enviando" : "Enviar"}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
              Selecione uma conversa.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
