import { useEffect, useState, useRef, useCallback } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  addDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";

export interface ChatMessage {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: Timestamp;
  read: boolean;
  replyTo?: {
    messageId: string;
    bodyPreview: string;
    fromMe: boolean;
  };
}

export interface Conversation {
  telefone: string;
  leadNome: string;
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  unreadCount: number;
}

const SERVER_URL = "http://localhost:3001";

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const prevUnreadMap = useRef<Record<string, number>>({});

  // ─── Escutar lista de conversas ──────────────────────────────────────────────
  useEffect(() => {
    const convRef = collection(db, "conversations");
    const unsubscribe = onSnapshot(convRef, (snapshot) => {
      const list: Conversation[] = [];

      snapshot.docs.forEach((d) => {
        const data = d.data();
        const conv: Conversation = {
          telefone: data.telefone || d.id,
          leadNome: data.leadNome || data.telefone || d.id,
          lastMessage: data.lastMessage || "",
          lastMessageAt: data.lastMessageAt || null,
          unreadCount: data.unreadCount || 0,
        };
        list.push(conv);
      });

      // Deduplicar conversas por telefone (mesmo contato com IDs diferentes)
      const dedupMap = new Map<string, Conversation>();
      const getKey = (conv: Conversation) => {
        const digits = conv.telefone.replace(/\D/g, "");
        if (digits.length >= 11) return `11:${digits.slice(-11)}`;
        if (digits.length >= 8) return `8:${digits.slice(-8)}`;
        return `raw:${conv.telefone}`;
      };
      const hasBetterName = (name: string) => {
        const trimmed = (name || "").trim();
        if (!trimmed) return false;
        const onlyDigits = trimmed.replace(/\D/g, "");
        return onlyDigits.length < 8;
      };

      for (const conv of list) {
        const key = getKey(conv);
        const existing = dedupMap.get(key);

        if (!existing) {
          dedupMap.set(key, conv);
          continue;
        }

        const existingTs = existing.lastMessageAt?.toMillis() || 0;
        const currentTs = conv.lastMessageAt?.toMillis() || 0;
        const base = currentTs >= existingTs ? conv : existing;
        const other = currentTs >= existingTs ? existing : conv;

        const merged: Conversation = {
          ...base,
          leadNome: hasBetterName(base.leadNome)
            ? base.leadNome
            : hasBetterName(other.leadNome)
              ? other.leadNome
              : base.leadNome || other.leadNome,
          unreadCount: Math.max(base.unreadCount || 0, other.unreadCount || 0),
        };

        dedupMap.set(key, merged);
      }

      const deduped = Array.from(dedupMap.values());

      // Segunda deduplicação: mesmo leadNome (nome real), mantém só a conversa mais recente
      const nameDedupMap = new Map<string, Conversation>();
      const isRealName = (name: string) => {
        const trimmed = (name || "").trim();
        if (!trimmed) return false;
        if (/^\+?\d+$/.test(trimmed)) return false;
        if (/^WhatsApp\s+\d+$/i.test(trimmed)) return false;
        return /[a-zA-ZÀ-ÿ]/.test(trimmed);
      };

      for (const conv of deduped) {
        if (!isRealName(conv.leadNome)) {
          nameDedupMap.set(`phone:${conv.telefone}`, conv);
          continue;
        }

        const key = `name:${conv.leadNome.trim().toLowerCase()}`;
        const existing = nameDedupMap.get(key);
        if (!existing) {
          nameDedupMap.set(key, conv);
          continue;
        }

        const existingTs = existing.lastMessageAt?.toMillis() || 0;
        const currentTs = conv.lastMessageAt?.toMillis() || 0;
        if (currentTs >= existingTs) {
          nameDedupMap.set(key, conv);
        }
      }

      const finalList = Array.from(nameDedupMap.values());

      // Filtrar conversas órfãs (ID inválido "55unknown...")
      const validConversations = finalList.filter((conv) => {
        if (conv.telefone.includes("unknown")) {
          console.warn(`[useConversations] Filtrando conversa órfã: ${conv.telefone}`);
          return false; // Não incluir na lista final
        }
        return true;
      });

      // Ordenar por mensagem mais recente
      validConversations.sort((a, b) => {
        const ta = a.lastMessageAt?.toMillis() || 0;
        const tb = b.lastMessageAt?.toMillis() || 0;
        return tb - ta;
      });

      // Notificar quando chegar mensagem nova — usar lista final (deduplicada)
      const getKey = (conv: Conversation) => {
        const digits = conv.telefone.replace(/\D/g, "");
        if (digits.length >= 11) return `11:${digits.slice(-11)}`;
        if (digits.length >= 8) return `8:${digits.slice(-8)}`;
        return `raw:${conv.telefone}`;
      };

      for (const conv of validConversations) {
        const key = getKey(conv);
        const prevUnread = prevUnreadMap.current[key] ?? conv.unreadCount;
        if (conv.unreadCount > prevUnread) {
          toast(`💬 ${conv.leadNome}`, {
            description: conv.lastMessage,
            duration: 6000,
            action: { label: "Ver", onClick: () => {} },
          });
          if (Notification.permission === "granted") {
            new Notification(`💬 ${conv.leadNome}`, {
              body: conv.lastMessage,
              icon: "/favicon.ico",
            });
          }
        }
        prevUnreadMap.current[key] = conv.unreadCount;
      }

      setConversations(validConversations);
    });

    return () => unsubscribe();
  }, []);

  // ─── Verificar status do servidor ─────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/status`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        setServerConnected(data.connected === true);
      } catch {
        setServerConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // ─── Polling do QR Code ───────────────────────────────────────────────────
  useEffect(() => {
    const fetchQR = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/qr`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        setQrCode(data.qr || null);
      } catch {
        setQrCode(null);
      }
    };
    fetchQR();
    const interval = setInterval(fetchQR, 5000);
    return () => clearInterval(interval);
  }, []);

  // ─── Buscar mensagens de uma conversa ─────────────────────────────────────
  const useMessages = (telefone: string | null) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    useEffect(() => {
      if (!telefone) return;
      
      // O ID da conversa é exato - não limpar dígitos se já é um ID válido
      // (pode ser "55...", "55unknown...", ou outro formato salvos no Firestore)
      const msgsRef = collection(db, "conversations", telefone, "messages");
      const q = query(msgsRef, orderBy("timestamp", "asc"));

      const unsub = onSnapshot(
        q,
        (snap) => {
          const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
          setMessages(msgs);
        },
        (err) => {
          // Se falhar com ID exato, tenta buscar por matching de dígitos como fallback
          console.warn(`[useMessages] Falha ao buscar mensagens para ${telefone}:`, err.message);
          setMessages([]);
        }
      );

      return () => unsub();
    }, [telefone]);

    return messages;
  };

  // ─── Enviar mensagem ──────────────────────────────────────────────────────
  const sendMessage = useCallback(async (telefone: string, message: string) => {
    try {
      const res = await fetch(`${SERVER_URL}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone, message }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Falha ao enviar mensagem.");
        return false;
      }
      return true;
    } catch {
      toast.error("Servidor WhatsApp offline. Verifique se o servidor está rodando.");
      return false;
    }
  }, []);

  // ─── Marcar como lido ─────────────────────────────────────────────────────
  const markAsRead = useCallback(async (telefone: string) => {
    try {
      await fetch(`${SERVER_URL}/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone }),
      });
    } catch {
      // silencioso
    }
  }, []);

  // ─── Total não lidas ──────────────────────────────────────────────────────
  const totalUnread = conversations.reduce((acc, c) => acc + c.unreadCount, 0);

  return {
    conversations,
    totalUnread,
    serverConnected,
    qrCode,
    sendMessage,
    markAsRead,
    useMessages,
  };
}
