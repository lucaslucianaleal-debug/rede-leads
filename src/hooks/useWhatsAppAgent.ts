import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export type WhatsAppQueueItem = {
  leadId: string;
  phone: string;
  name?: string;
  message: string;
  kind?: "followup" | "manual";
  stage?: string;
  nextStage?: string;
  clientRequestId?: string;
};

type AgentStatus = {
  configured: boolean;
  paired: boolean;
  online: boolean;
  connected: boolean;
  lastSeenAt?: string | null;
  connectedPhone?: string;
  lastError?: string | null;
  agentVersion?: string | null;
  qrCode?: string | null;
  qrUpdatedAt?: string | null;
};

export function useWhatsAppAgent() {
  const { user, currentClinic } = useAuth();
  const [status, setStatus] = useState<AgentStatus>({ configured: false, paired: false, online: false, connected: false, qrCode: null });
  const [loadingStatus, setLoadingStatus] = useState(false);

  const authHeaders = useCallback(async () => {
    if (!user) throw new Error("Usuário não autenticado");
    const token = await user.getIdToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, [user]);

  const refreshStatus = useCallback(async () => {
    if (!user || !currentClinic) return;
    setLoadingStatus(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/whatsapp/status?clinicId=${encodeURIComponent(currentClinic)}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erro ao consultar agente WhatsApp");
      setStatus({
        configured: data.configured === true,
        paired: data.paired === true,
        online: data.online === true,
        connected: data.connected === true,
        lastSeenAt: data.lastSeenAt || null,
        connectedPhone: data.connectedPhone || "",
        lastError: data.lastError || null,
        agentVersion: data.agentVersion || null,
        qrCode: data.qrCode || null,
        qrUpdatedAt: data.qrUpdatedAt || null,
      });
    } catch (error) {
      setStatus((prev) => ({ ...prev, online: false, connected: false, qrCode: null, lastError: error instanceof Error ? error.message : String(error) }));
    } finally {
      setLoadingStatus(false);
    }
  }, [user, currentClinic, authHeaders]);

  useEffect(() => {
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 8000);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  const pairAgent = useCallback(async () => {
    if (!currentClinic) throw new Error("Clínica não selecionada");
    const headers = await authHeaders();
    const res = await fetch("/api/whatsapp/status", {
      method: "POST",
      headers,
      body: JSON.stringify({ clinicId: currentClinic, action: "pair" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro ao preparar o agente");
    if (!data.agentSecret) throw new Error("Chave do agente não foi gerada");
    setStatus((prev) => ({ ...prev, configured: true, paired: true, connected: false, online: false, qrCode: null }));
    return String(data.agentSecret);
  }, [currentClinic, authHeaders]);

  const queueMessages = useCallback(async (items: WhatsAppQueueItem[]) => {
    if (!currentClinic) throw new Error("Clínica não selecionada");
    if (!items.length) return { queued: 0, skipped: 0, total: 0 };
    const headers = await authHeaders();
    const prepared = items.map((item) => ({
      ...item,
      clientRequestId: item.clientRequestId || (item.kind === "manual" && typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined),
    }));
    const res = await fetch("/api/whatsapp/queue", {
      method: "POST",
      headers,
      body: JSON.stringify({ clinicId: currentClinic, items: prepared }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro ao criar fila do WhatsApp");
    return {
      queued: Number(data.queued || 0),
      skipped: Number(data.skipped || 0),
      total: Number(data.total || items.length),
    };
  }, [currentClinic, authHeaders]);

  const fetchChats = useCallback(async () => {
    if (!currentClinic) return [];
    const headers = await authHeaders();
    const res = await fetch(`/api/whatsapp/chats?clinicId=${encodeURIComponent(currentClinic)}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro ao carregar conversas");
    return Array.isArray(data.items) ? data.items : [];
  }, [currentClinic, authHeaders]);

  const fetchMessages = useCallback(async (chatId: string) => {
    if (!currentClinic || !chatId) return [];
    const headers = await authHeaders();
    const res = await fetch(`/api/whatsapp/chats?clinicId=${encodeURIComponent(currentClinic)}&chatId=${encodeURIComponent(chatId)}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro ao carregar mensagens");
    return Array.isArray(data.items) ? data.items : [];
  }, [currentClinic, authHeaders]);

  const markChatRead = useCallback(async (chatId: string) => {
    if (!currentClinic || !chatId) return;
    const headers = await authHeaders();
    const res = await fetch("/api/whatsapp/chats", {
      method: "POST",
      headers,
      body: JSON.stringify({ clinicId: currentClinic, chatId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Erro ao marcar conversa como lida");
    }
  }, [currentClinic, authHeaders]);

  return {
    status,
    loadingStatus,
    refreshStatus,
    pairAgent,
    queueMessages,
    fetchChats,
    fetchMessages,
    markChatRead,
  };
}
