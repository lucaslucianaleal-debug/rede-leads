import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import type { KPI, Diagnostic, FunnelData, Campaign, WhatsAppMessage, Automation } from "@/types/commandCenter";

/**
 * Busca leads de uma clínica específica
 */
export async function fetchLeadsFromClinic(clinicId: string) {
  try {
    const docRef = doc(db, "clinics", clinicId, "shared", "shared");
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      console.warn(`Clinic doc not found: ${clinicId}`);
      return [];
    }

    const data = docSnap.data();
    return (data?.leads || []) as any[];
  } catch (e) {
    console.error("Error fetching clinic leads:", e);
    return [];
  }
}

/**
 * Calcula KPIs operacionais a partir dos leads reais
 */
export async function calculateOperationalKPIs(clinicId: string): Promise<KPI[]> {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);
    
    // Leads de hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const leadsToday = leads.filter(l => {
      const leadDate = new Date(l.dataCriacao?.seconds * 1000 || 0);
      leadDate.setHours(0, 0, 0, 0);
      return leadDate.getTime() === today.getTime();
    }).length;

    // Comparecidos hoje
    const completedToday = leads.filter(l => {
      if (l.etapaLead !== "compareceu") return false;
      const visitDate = new Date(l.dataAgendamento?.seconds * 1000 || 0);
      visitDate.setHours(0, 0, 0, 0);
      return visitDate.getTime() === today.getTime();
    }).length;

    // Total agendados
    const scheduled = leads.filter(l => l.etapaLead === "agendado" || l.etapaLead === "confirmado").length;

    // Taxa de comparecimento
    const comparecidos = leads.filter(l => l.etapaLead === "compareceu").length;
    const showUpRate = scheduled > 0 ? Math.round((comparecidos / scheduled) * 100) : 0;

    return [
      { label: "Leads hoje", value: leadsToday.toString(), status: "good" },
      { label: "Comparecidos", value: completedToday.toString(), sub: "meta: 5 hoje", status: completedToday >= 5 ? "good" : "bad" },
      { label: "Taxa comparecimento", value: `${showUpRate}%`, sub: "meta: 50%", status: showUpRate >= 50 ? "good" : "warn" },
      { label: "Agendados", value: scheduled.toString(), status: scheduled > 0 ? "good" : "warn" },
    ];
  } catch (e) {
    console.error("Error calculating KPIs:", e);
    return [];
  }
}

/**
 * Busca conversas WhatsApp recentes
 */
export async function fetchRecentConversations(limit_count = 10) {
  try {
    const convsRef = collection(db, "conversations");
    const q = query(convsRef, orderBy("lastMessageAt", "desc"), limit(limit_count));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        nome: data.leadNome || "Unknown",
        telefone: data.telefone,
        ultimaMensagem: data.lastMessage,
        ultimoMensagemEm: data.lastMessageAt,
        naoLidas: data.unreadCount || 0,
      };
    });
  } catch (e) {
    console.error("Error fetching conversations:", e);
    return [];
  }
}

/**
 * Busca mensagens de uma conversa
 */
export async function fetchConversationMessages(telefone: string, limit_count = 50) {
  try {
    const msgsRef = collection(db, "conversations", telefone, "messages");
    const q = query(msgsRef, orderBy("timestamp", "desc"), limit(limit_count));
    const snapshot = await getDocs(q);

    return snapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          body: data.body || "",
          fromMe: data.fromMe || false,
          timestamp: data.timestamp,
          read: data.read || false,
        };
      })
      .reverse(); // Cronológica crescente
  } catch (e) {
    console.error("Error fetching messages:", e);
    return [];
  }
}

/**
 * Gera diagnósticos baseado em leads reais
 */
export async function generateOperationalDiagnostics(clinicId: string): Promise<Diagnostic[]> {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);
    const diagnostics: Diagnostic[] = [];

    // Diagnóstico 1: Leads sem resposta há +24h
    const noResponse = leads.filter(l => l.etapaLead === "pendente");
    if (noResponse.length > 3) {
      diagnostics.push({
        type: "crit",
        title: `${noResponse.length} leads sem resposta +24h — risco de perda imediata`,
        description: `Cada hora reduz chance de agendamento em ~12%.`,
        action: "Enviar WA agora",
        actionId: "send_whatsapp_unresponded",
      });
    }

    // Diagnóstico 2: Taxa de comparecimento baixa
    const scheduled = leads.filter(l => l.etapaLead === "agendado" || l.etapaLead === "confirmado").length;
    const completed = leads.filter(l => l.etapaLead === "compareceu").length;
    const showUpRate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 100;
    if (showUpRate < 50 && scheduled > 5) {
      diagnostics.push({
        type: "imp",
        title: `Comparecimento em ${showUpRate}% — meta é 50%`,
        description: `Confirmação 2h antes reduz no-show em ~15pp. Considerar automação.`,
        action: "Ativar confirmação",
        actionId: "activate_automation_confirmation",
      });
    } else if (showUpRate >= 50) {
      diagnostics.push({
        type: "ok",
        title: `Taxa de comparecimento ${showUpRate}% — acima da meta`,
        description: `Equipe performando bem. Manter cadência.`,
      });
    }

    return diagnostics;
  } catch (e) {
    console.error("Error generating diagnostics:", e);
    return [];
  }
}

/**
 * Calcula funil de conversão
 */
export async function calculateFunnelData(clinicId: string): Promise<FunnelData> {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);

    const total = leads.length;
    const scheduled = leads.filter(l => l.etapaLead === "agendado" || l.etapaLead === "confirmado").length;
    const completed = leads.filter(l => l.etapaLead === "compareceu").length;

    const conversionRate = total > 0 ? Math.round((scheduled / total) * 100) : 0;
    const showUpRate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;

    // Gargalo: onde está perdendo mais?
    let bottleneck = "captação";
    if (conversionRate < 40) {
      bottleneck = "agendamento";
    } else if (showUpRate < 50) {
      bottleneck = "no-show";
    }

    return {
      leads: total,
      scheduled,
      completed,
      conversionRate: `${conversionRate}%`,
      showUpRate: `${showUpRate}%`,
      bottleneck,
    };
  } catch (e) {
    console.error("Error calculating funnel:", e);
    return {
      leads: 0,
      scheduled: 0,
      completed: 0,
      conversionRate: "0%",
      showUpRate: "0%",
      bottleneck: "desconhecido",
    };
  }
}

/**
 * Subscribe to real-time updates (para implementação futura)
 */
export function subscribeToConversations(callback: (convs: any[]) => void) {
  try {
    const convsRef = collection(db, "conversations");
    const q = query(convsRef, orderBy("lastMessageAt", "desc"), limit(20));
    
    return onSnapshot(q, snapshot => {
      const convs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(convs);
    });
  } catch (e) {
    console.error("Error subscribing to conversations:", e);
    return () => {};
  }
}
