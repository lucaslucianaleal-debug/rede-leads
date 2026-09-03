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
};

type AgentStatus = {
  configured: boolean;
  online: boolean;
  connected: boolean;
  lastSeenAt?: string | null;
  connectedPhone?: string;
  lastError?: string | null;
  agentVersion?: string | null;
};

export function useWhatsAppAgent() {
  const { user, currentClinic } = useAuth();
  const [status, setStatus] = useState<AgentStatus>({ configured: false, online: false, connected: false });
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
        online: data.online === true,
        connected: data.connected === true,
        lastSeenAt: data.lastSeenAt || null,
        connectedPhone: data.connectedPhone || "",
        lastError: data.lastError || null,
        agentVersion: data.agentVersion || null,
      });
    } catch (error) {
      setStatus((prev) => ({ ...prev, online: false, connected: false, lastError: error instanceof Error ? error.message : String(error) }));
    } finally {
      setLoadingStatus(false);
    }
  }, [user, currentClinic, authHeaders]);

  useEffect(() => {
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 2 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  const queueMessages = useCallback(async (items: WhatsAppQueueItem[]) => {
    if (!currentClinic) throw new Error("Clínica não selecionada");
    if (!items.length) return { queued: 0, skipped: 0, total: 0 };
    const headers = await authHeaders();
    const res = await fetch("/api/whatsapp/queue", {
      method: "POST",
      headers,
      body: JSON.stringify({ clinicId: currentClinic, items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro ao criar fila do WhatsApp");
    return {
      queued: Number(data.queued || 0),
      skipped: Number(data.skipped || 0),
      total: Number(data.total || items.length),
    };
  }, [currentClinic, authHeaders]);

  return {
    status,
    loadingStatus,
    refreshStatus,
    queueMessages,
  };
}
