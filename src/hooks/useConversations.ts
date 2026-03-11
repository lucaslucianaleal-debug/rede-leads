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
import { normalizePhoneTo10Digits } from "@/lib/phone";

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
        const rawPhone = data.telefone || d.id || "";
        const normalizedPhone = normalizePhoneTo10Digits(String(rawPhone));
        const conv: Conversation = {
          telefone: normalizedPhone || rawPhone,
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
        if (digits.length >= 10) return `10:${digits.slice(-10)}`;
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

      // Ordenar por mensagem mais recente (sem filtrar órfãs automaticamente)
      // O sistema mantém conversas mesmo que temporariamente sem lead sincronizado
      finalList.sort((a, b) => {
        // Preferir timestamp real da última mensagem, se disponível
        const ta = a.lastMessageAt?.toMillis() || 0;
        const tb = b.lastMessageAt?.toMillis() || 0;
        // Se lastMessageAt for nulo, buscar timestamp da última mensagem (se existir)
        // (opcional: pode ser ajustado se houver campo timestamp na mensagem)
        return tb - ta;
      });

      // Notificar quando chegar mensagem nova — usar lista final (deduplicada)
      for (const conv of finalList) {
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

      setConversations(finalList);
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
      // Implementa a mesma lógica de tentativa em cascata do backend para
      // localizar o documento de conversa correto no Firestore.
      // Ordem: 55+DDD+9, 10-digits canonical, raw input.
      const rawDigits = String(telefone).replace(/\D/g, "");
      const canonical = normalizePhoneTo10Digits(telefone);
      const with9 = canonical && canonical.length === 10 ? `${canonical.slice(0,2)}9${canonical.slice(2)}` : null;

      const tryIds: string[] = [];
      if (with9) tryIds.push(`55${with9}`);
      if (canonical) tryIds.push(canonical);
      if (rawDigits) tryIds.push(rawDigits);

      console.log(`[useMessages] Tentando localizar conversa. Input: ${telefone} → tentativas: ${JSON.stringify(tryIds)}`);

      let unsub: (() => void) | null = null;
      const tryNext = async (i: number) => {
        if (i >= tryIds.length) {
          console.warn(`[useMessages] Nenhuma conversa encontrada para ${telefone}`);
          setMessages([]);
          return;
        }
        const id = tryIds[i];
        try {
          const msgsRef = collection(db, "conversations", id, "messages");
          const q = query(msgsRef, orderBy("timestamp", "desc"));
          const listener = onSnapshot(
            q,
            (snap) => {
              if (snap.docs.length > 0) {
                const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
                console.log(`[useMessages] ${msgs.length} mensagens encontradas para conv ${id}`);
                setMessages(msgs);
                // found — keep this listener
                unsub = () => listener();
              } else {
                // no messages here — try next id
                listener();
                tryNext(i + 1);
              }
            },
            (err) => {
              console.error(`[useMessages] Erro ao buscar mensagens para ${id}:`, err && err.message ? err.message : err);
              listener();
              tryNext(i + 1);
            }
          );
        } catch (e) {
          console.warn(`[useMessages] Falha ao tentar id ${id}:`, e && e.message ? e.message : e);
          tryNext(i + 1);
        }
      };

      tryNext(0);

      return () => {
        if (unsub) unsub();
      };
    }, [telefone]);

    return messages;
  };

  // ─── Enviar mensagem ──────────────────────────────────────────────────────
    const sendMessage = useCallback(async (telefone: string, message: string) => {
    try {
      // Monte as variações na ordem oficial: 55+DDD+9, 10-digits, raw
      const rawDigits = String(telefone).replace(/\D/g, "");
      const canonical = normalizePhoneTo10Digits(telefone);
      const with9 = canonical && canonical.length === 10 ? `${canonical.slice(0,2)}9${canonical.slice(2)}` : null;

      const variants: string[] = [];
      if (with9) variants.push(`55${with9}`);
      if (canonical) variants.push(canonical);
      if (rawDigits) variants.push(rawDigits);

      for (const v of variants) {
        try {
          const res = await fetch(`${SERVER_URL}/send-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ telefone: v, message }),
          });
          if (res.ok) {
            // success — no need to try other variants
            toast.success("Mensagem enviada");
            return true;
          }
          const data = await res.json().catch(() => ({}));
          console.warn(`[sendMessage] tentativa ${v} falhou:`, data.error || res.statusText);
        } catch (err) {
          console.warn(`[sendMessage] Erro na tentativa ${v}:`, err && err.message ? err.message : err);
        }
      }

      toast.error("Falha ao enviar mensagem com todas as variações.");
      return false;
    } catch {
      toast.error("Servidor WhatsApp offline. Verifique se o servidor está rodando.");
      return false;
    }
  }, []);

  // ─── Marcar como lido ─────────────────────────────────────────────────────
  const markAsRead = useCallback(async (telefone: string) => {
    try {
      // Normalizar telefone para 11 dígitos (compatível com backend)
      const normalizedPhone = normalizePhoneTo10Digits(telefone);
      if (!normalizedPhone) return; // silencioso se não conseguir normalizar

      await fetch(`${SERVER_URL}/mark-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: normalizedPhone }),
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
