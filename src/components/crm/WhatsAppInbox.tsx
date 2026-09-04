import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWhatsAppAgent } from "@/hooks/useWhatsAppAgent";
import { Lead } from "@/types/crm";
import { WhatsAppConversationPanel, WhatsAppConversationTarget } from "./WhatsAppConversationPanel";

export type WhatsAppChatSummary = WhatsAppConversationTarget & {
  id: string;
  lastMessage: string;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
  lastDirection?: "in" | "out";
  unreadCount?: number;
  lastMessageStatus?: string;
};

type InboxFilter = "todos" | "novos" | "nao_lidos" | "cadastrados";

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

function canonicalPhoneKey(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === "9") digits = `${digits.slice(0, 2)}${digits.slice(3)}`;
  return digits.length === 10 ? `55${digits}` : "";
}

function findLead(leads: Lead[], chat: WhatsAppChatSummary | null) {
  if (!chat) return null;
  if (chat.leadId) {
    const byId = leads.find((lead) => lead.id === chat.leadId);
    if (byId) return byId;
  }
  const key = canonicalPhoneKey(chat.phone);
  if (!key) return null;
  return leads.find((lead) => canonicalPhoneKey(lead.telefone) === key) || null;
}

export function WhatsAppInbox({
  leads = [],
  onNewCountChange,
  onUpdateLead,
}: {
  leads?: Lead[];
  onNewCountChange?: (count: number) => void;
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
}) {
  const { fetchChats } = useWhatsAppAgent();
  const [chats, setChats] = useState<WhatsAppChatSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("todos");
  const [loadingChats, setLoadingChats] = useState(false);
  const chatSinceRef = useRef("");

  const selectedChat = chats.find((chat) => chat.id === selectedId) || null;
  const selectedLead = useMemo(() => findLead(leads, selectedChat), [leads, selectedChat]);

  const loadChats = useCallback(async (forceFull = false) => {
    setLoadingChats(true);
    try {
      const since = forceFull ? "" : chatSinceRef.current;
      const items = await fetchChats(since);
      setChats((current) => {
        const map = new Map<string, WhatsAppChatSummary>();
        if (since) current.forEach((item) => map.set(item.id, item));
        items.forEach((item: WhatsAppChatSummary) => map.set(item.id, item));
        return [...map.values()].sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")));
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

  useEffect(() => {
    chatSinceRef.current = "";
    loadChats(true);
    const timer = window.setInterval(() => loadChats(false), 6000);
    return () => window.clearInterval(timer);
  }, [loadChats]);

  const chatInfo = useMemo(() => chats.map((chat) => {
    const lead = findLead(leads, chat);
    return {
      chat,
      lead,
      hasLead: Boolean(chat.leadId || lead),
      unread: Number(chat.unreadCount || 0) > 0,
    };
  }), [chats, leads]);

  const newCount = useMemo(() => chatInfo.filter((item) => !item.hasLead).length, [chatInfo]);
  const unreadCount = useMemo(() => chatInfo.filter((item) => item.unread).length, [chatInfo]);
  const registeredCount = chatInfo.length - newCount;

  useEffect(() => {
    onNewCountChange?.(newCount);
  }, [newCount, onNewCountChange]);

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase();
    return chatInfo
      .filter(({ chat, hasLead, unread }) => {
        if (filter === "novos" && hasLead) return false;
        if (filter === "cadastrados" && !hasLead) return false;
        if (filter === "nao_lidos" && !unread) return false;
        if (!term) return true;
        return (
          String(chat.name || "").toLowerCase().includes(term) ||
          chat.phone.includes(term) ||
          String(chat.lastMessage || "").toLowerCase().includes(term) ||
          String(chat.metaCampanhaNome || "").toLowerCase().includes(term)
        );
      })
      .map((item) => item.chat);
  }, [chatInfo, filter, search]);

  useEffect(() => {
    if (!filteredChats.length) {
      if (filter !== "todos" || search.trim()) setSelectedId("");
      return;
    }
    if (!filteredChats.some((chat) => chat.id === selectedId)) {
      setSelectedId(filteredChats[0].id);
    }
  }, [filteredChats, selectedId, filter, search]);

  const selectChat = (chat: WhatsAppChatSummary) => {
    setSelectedId(chat.id);
    if ((chat.unreadCount || 0) > 0) {
      setChats((current) => current.map((item) => item.id === chat.id ? { ...item, unreadCount: 0 } : item));
    }
  };

  const filters: Array<{ id: InboxFilter; label: string; count: number }> = [
    { id: "todos", label: "Todos", count: chats.length },
    { id: "novos", label: "Novos", count: newCount },
    { id: "nao_lidos", label: "Não lidos", count: unreadCount },
    { id: "cadastrados", label: "Cadastrados", count: registeredCount },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {filters.map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition ${filter === item.id ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            {item.label}{item.count > 0 ? <span className="ml-1 opacity-80">{item.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-0 border rounded-xl overflow-hidden bg-card min-h-[650px]">
        <div className="border-r bg-muted/20 flex flex-col min-h-[320px]">
          <div className="p-3 border-b flex gap-2 shrink-0">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa, campanha..." />
            <Button variant="outline" size="icon" onClick={() => loadChats(true)} disabled={loadingChats}>
              <RefreshCw className={`h-4 w-4 ${loadingChats ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto max-h-[590px]">
            {filteredChats.map((chat) => {
              const active = chat.id === selectedId;
              const hasLead = Boolean(chat.leadId || findLead(leads, chat));
              return (
                <button
                  key={chat.id}
                  onClick={() => selectChat(chat)}
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
                      <div className="flex flex-wrap gap-1 mt-1">
                        {!hasLead && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Novo lead</span>}
                        {hasLead && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border">Cadastrado</span>}
                        {chat.metaCampanhaNome && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 truncate max-w-[220px]">Meta • {chat.metaCampanhaNome}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!filteredChats.length && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {filter === "novos" ? "Nenhum novo lead aguardando cadastro." : "Nenhuma conversa encontrada com este filtro."}
              </div>
            )}
          </div>
        </div>

        <WhatsAppConversationPanel
          target={selectedChat}
          lead={selectedLead}
          onUpdateLead={onUpdateLead}
          height="650px"
          className="border-0 rounded-none"
          onLeadLinked={(newLead) => {
            if (!selectedChat) return;
            setChats((current) => current.map((chat) => chat.id === selectedChat.id ? { ...chat, leadId: newLead.id, name: newLead.nome } : chat));
          }}
        />
      </div>
    </div>
  );
}
