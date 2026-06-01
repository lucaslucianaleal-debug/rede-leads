import { useState, useEffect } from "react";
import type { WhatsAppMessage, WhatsAppMetrics, WhatsAppKPI, Diagnostic } from "@/types/commandCenter";
import { MOCK_MESSAGES, MOCK_WA_METRICS, WHATSAPP_KPIS, WHATSAPP_DIAGNOSTICS } from "@/data/commandCenterMock";

export function useWhatsApp(unitId?: string) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [metrics, setMetrics] = useState<WhatsAppMetrics | null>(null);
  const [kpis, setKpis] = useState<WhatsAppKPI[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      // Futuramente: chamada para /api/whatsapp/messages?unitId=...
      setMessages(MOCK_MESSAGES);
      setMetrics(MOCK_WA_METRICS);
      setKpis(WHATSAPP_KPIS);
      setDiagnostics(WHATSAPP_DIAGNOSTICS);
      setLoading(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [unitId]);

  const pending = messages.filter(m => m.status === "pending");
  const responded = messages.filter(m => m.status === "responded");
  const automated = messages.filter(m => m.status === "auto");

  return { messages, metrics, kpis, diagnostics, loading, pending, responded, automated };
}
