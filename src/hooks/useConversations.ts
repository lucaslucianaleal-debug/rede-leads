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

        // Notificar quando chegar mensagem nova
        const prevUnread = prevUnreadMap.current[conv.telefone] ?? conv.unreadCount;
        if (conv.unreadCount > prevUnread) {
          const diff = conv.unreadCount - prevUnread;
          toast(`💬 ${conv.leadNome}`, {
            description: conv.lastMessage,
            duration: 6000,
            action: { label: "Ver", onClick: () => {} },
          });

          // Notificação do navegador (se permitido)
          if (Notification.permission === "granted") {
            new Notification(`💬 ${conv.leadNome}`, {
              body: conv.lastMessage,
              icon: "/favicon.ico",
            });
          }
        }
        prevUnreadMap.current[conv.telefone] = conv.unreadCount;
      });

      // Ordenar por mensagem mais recente
      list.sort((a, b) => {
        const ta = a.lastMessageAt?.toMillis() || 0;
        const tb = b.lastMessageAt?.toMillis() || 0;
        return tb - ta;
      });

      setConversations(list);
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
      const cleanTel = telefone.replace(/\D/g, "");
      const msgsRef = collection(db, "conversations", cleanTel, "messages");
      const q = query(msgsRef, orderBy("timestamp", "asc"));

      const unsub = onSnapshot(q, (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
        setMessages(msgs);
      });

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

      if (!res.ok) throw new Error("Falha ao enviar");
      return true;
    } catch (e) {
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
