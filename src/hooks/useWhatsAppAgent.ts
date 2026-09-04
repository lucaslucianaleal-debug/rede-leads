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

export type WhatsAppCreateLeadInput = {
  chatId: string;
  phone: string;
  name?: string;
  dataCriacao?: string;
  dataContato?: string;
  servicoProcurado?: string;
  captador?: string;
  fonteLead?: string;
  etapaLead?: string;
  status?: string;
  respostaLead?: string;
  comparecimento?: string;
  dataFollowUp?: string;
  dataAgendamento?: string;
  dataRetornoLigacao?: string;
  observacao?: string;
  followUpCount?: number;
  lembretes?: { h24?: boolean; today?: boolean };
  customFields?: Record<string, unknown>;
  metaCampanhaId?: string;
  metaCampanhaNome?: string;
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
    if (!items.length) return { queued: 0, skipped: 0, total: 0, queuedIds: [] as string[], skippedIds: [] as string[] };
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
      queuedIds: Array.isArray(data.queuedIds) ? data.queuedIds.map(String) : [],
      skippedIds: Array.isArray(data.skippedIds) ? data.skippedIds.map(String) : [],
    };
  }, [currentClinic, authHeaders]);

  const fetchChats = useCallback(async (since = "") => {
    if (!currentClinic) return [];
    const headers = await authHeaders();
    const params = new URLSearchParams({ clinicId: currentClinic });
    if (since) params.set("since", since);
    const res = await fetch(`/api/whatsapp/chats?${params.toString()}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro ao carregar conversas");
    return Array.isArray(data.items) ? data.items : [];
  }, [currentClinic, authHeaders]);

  const fetchMessages = useCallback(async (chatId: string, since = "") => {
    if (!currentClinic || !chatId) return [];
    const headers = await authHeaders();
    const params = new URLSearchParams({ clinicId: currentClinic, chatId });
    if (since) params.set("since", since);
    const res = await fetch(`/api/whatsapp/chats?${params.toString()}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro ao carregar mensagens");
    return Array.isArray(data.items) ? data.items : [];
  }, [currentClinic, authHeaders]);

  const postChatAction = useCallback(async (body: Record<string, unknown>) => {
    if (!currentClinic) throw new Error("Clínica não selecionada");
    const headers = await authHeaders();
    const res = await fetch("/api/whatsapp/chats", {
      method: "POST",
      headers,
      body: JSON.stringify({ clinicId: currentClinic, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro ao atualizar conversa");
    return data;
  }, [currentClinic, authHeaders]);

  const markChatRead = useCallback(async (chatId: string) => {
    if (!chatId) return;
    await postChatAction({ chatId, action: "read" });
  }, [postChatAction]);

  const linkChatToLead = useCallback(async (chatId: string, leadId: string, name?: string) => {
    if (!chatId || !leadId) return;
    return postChatAction({ chatId, action: "linkLead", leadId, name: name || "" });
  }, [postChatAction]);

  const createLeadFromChat = useCallback(async (input: WhatsAppCreateLeadInput) => {
    if (!input.chatId || !input.phone) throw new Error("Conversa/telefone inválido");
    return postChatAction({ ...input, action: "createLead" });
  }, [postChatAction]);

  return {
    status,
    loadingStatus,
    refreshStatus,
    pairAgent,
    queueMessages,
    fetchChats,
    fetchMessages,
    markChatRead,
    linkChatToLead,
    createLeadFromChat,
  };
}