import { useState, useEffect } from "react";
import type { WhatsAppMessage, WhatsAppMetrics, WhatsAppKPI, Diagnostic } from "@/types/commandCenter";
import { MOCK_MESSAGES, MOCK_WA_METRICS, WHATSAPP_KPIS, WHATSAPP_DIAGNOSTICS } from "@/data/commandCenterMock";
import { fetchRecentConversations, fetchConversationMessages } from "@/services/firebaseQueries";

export function useWhatsApp(unitId?: string) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [metrics, setMetrics] = useState<WhatsAppMetrics | null>(null);
  const [kpis, setKpis] = useState<WhatsAppKPI[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Busca conversas recentes reais
        const convs = await fetchRecentConversations(10);
        
        // Transforma em WhatsAppMessage
        const formattedMessages: WhatsAppMessage[] = convs.map((conv, idx) => ({
          id: conv.id,
          name: conv.nome,
          initials: conv.nome?.substring(0, 2).toUpperCase() || "??",
          avatarColor: ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899"][idx % 5],
          message: conv.ultimaMensagem || "Sem mensagens",
          timeLabel: "recentemente",
          status: conv.naoLidas > 0 ? "pending" : "responded",
          responseTime: "—",
        }));

        setMessages(formattedMessages);
        setMetrics(MOCK_WA_METRICS); // Usar mock por enquanto, depois integrar
        setKpis(WHATSAPP_KPIS);
        setDiagnostics(WHATSAPP_DIAGNOSTICS);
      } catch (e) {
        console.error("Error loading WhatsApp data:", e);
        // Fallback para mock
        setMessages(MOCK_MESSAGES);
        setMetrics(MOCK_WA_METRICS);
        setKpis(WHATSAPP_KPIS);
        setDiagnostics(WHATSAPP_DIAGNOSTICS);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [unitId]);

  const pending = messages.filter(m => m.status === "pending");
  const responded = messages.filter(m => m.status === "responded");
  const automated = messages.filter(m => m.status === "auto");

  return { messages, metrics, kpis, diagnostics, loading, pending, responded, automated };
}
