import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore";
import type { KPI, Diagnostic, FunnelData, Campaign, WhatsAppMessage, Automation } from "@/types/commandCenter";

/**
 * Converte data DD/MM/YYYY para Date
 */
function parseDate(dateStr: string | undefined): Date {
  if (!dateStr) return new Date(0);
  
  // Se for uma string DD/MM/YYYY
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  
  // Se for timestamp com propriedade seconds
  if (typeof dateStr === 'object' && (dateStr as any)?.seconds) {
    return new Date((dateStr as any).seconds * 1000);
  }
  
  // Se for ISO string
  return new Date(dateStr);
}

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
    const leads = (data?.leads || []) as any[];
    console.log(`[firebaseQueries] Fetched ${leads.length} leads from ${clinicId}`);
    return leads;
  } catch (e) {
    console.error("Error fetching clinic leads:", e);
    return [];
  }
}

/**
 * Calcula KPIs operacionais a partir dos leads reais
 */
export async function calculateOperationalKPIs(clinicId: string, period: "hoje" | "semana" | "mes" = "mes"): Promise<KPI[]> {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);
    console.log(`[calculateOperationalKPIs] Processing ${leads.length} leads for period: ${period}`);
    
    // Define range de datas baseado no período
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate = new Date(today);
    if (period === "hoje") {
      // Apenas hoje
      startDate = new Date(today);
    } else if (period === "semana") {
      // Últimos 7 dias
      startDate.setDate(today.getDate() - 7);
    } else if (period === "mes") {
      // Últimos 30 dias
      startDate.setDate(today.getDate() - 30);
    }

    // Leads no período
    const leadsInPeriod = leads.filter(l => {
      const leadDate = parseDate(l.dataCriacao);
      leadDate.setHours(0, 0, 0, 0);
      return leadDate >= startDate && leadDate <= today;
    }).length;

    // Comparecidos no período
    const completedInPeriod = leads.filter(l => {
      if (l.comparecimento !== "COMPARECEU") return false;
      const visitDate = parseDate(l.dataAgendamento);
      visitDate.setHours(0, 0, 0, 0);
      return visitDate >= startDate && visitDate <= today;
    }).length;

    // Total agendados (tendo dataAgendamento preenchida)
    const scheduled = leads.filter(l => l.dataAgendamento && l.dataAgendamento.trim()).length;

    // Taxa de comparecimento (do total agendado, quantos compareceram)
    const comparecidos = leads.filter(l => l.comparecimento === "COMPARECEU").length;
    const showUpRate = scheduled > 0 ? Math.round((comparecidos / scheduled) * 100) : 0;

    console.log(`[calculateOperationalKPIs] ${period}: ${leadsInPeriod} leads, ${completedInPeriod} completed, ${scheduled} scheduled, ${comparecidos} attended, ${showUpRate}%`);

    return [
      { label: "Leads", value: leadsInPeriod.toString(), status: leadsInPeriod > 0 ? "good" : "warn" },
      { label: "Comparecidos", value: completedInPeriod.toString(), sub: "meta: 5", status: completedInPeriod >= 5 ? "good" : "bad" },
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

    // Diagnóstico 1: Leads sem resposta (sem agendamento)
    const noSchedule = leads.filter(l => !l.dataAgendamento || !l.dataAgendamento.trim());
    if (noSchedule.length > 3) {
      diagnostics.push({
        type: "crit",
        title: `${noSchedule.length} leads sem agendamento — risco de perda imediata`,
        description: `Cada hora reduz chance de agendamento em ~12%.`,
        action: "Enviar WA agora",
        actionId: "send_whatsapp_unresponded",
      });
    }

    // Diagnóstico 2: Taxa de comparecimento baixa
    const scheduled = leads.filter(l => l.dataAgendamento && l.dataAgendamento.trim()).length;
    const completed = leads.filter(l => l.comparecimento === "COMPARECEU").length;
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
    const scheduled = leads.filter(l => l.dataAgendamento && l.dataAgendamento.trim()).length;
    const completed = leads.filter(l => l.comparecimento === "COMPARECEU").length;

    const conversionRate = total > 0 ? Math.round((scheduled / total) * 100) : 0;
    const showUpRate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;

    // Gargalo: onde está perdendo mais?
    let bottleneck = "captação";
    if (conversionRate < 40) {
      bottleneck = "agendamento";
    } else if (showUpRate < 50) {
      bottleneck = "no-show";
    }

    console.log(`[calculateFunnelData] Total: ${total}, Scheduled: ${scheduled} (${conversionRate}%), Completed: ${completed} (${showUpRate}%), Bottleneck: ${bottleneck}`);

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
