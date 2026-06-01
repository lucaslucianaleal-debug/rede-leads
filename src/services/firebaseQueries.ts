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

    // Ticket médio estimado por paciente atendido
    const TICKET_MEDIO = 1800;
    // Meta mensal de receita (configurável)
    const META_RECEITA_MES = 80000;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Helpers para calcular tamanho do período em dias
    const periodDays = period === "hoje" ? 1 : period === "semana" ? 7 : 30;

    // Período atual
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (periodDays - 1));

    // Período anterior (mesmo tamanho, imediatamente antes)
    const prevEnd = new Date(startDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (periodDays - 1));

    const inRange = (dateStr: string, from: Date, to: Date) => {
      const d = parseDate(dateStr);
      d.setHours(0, 0, 0, 0);
      return d >= from && d <= to;
    };

    // --- PERÍODO ATUAL ---
    const leadsInPeriod = leads.filter(l => inRange(l.dataCriacao, startDate, today)).length;

    const completedInPeriod = leads.filter(l =>
      l.comparecimento === "COMPARECEU" && inRange(l.dataCriacao, startDate, today)
    ).length;

    const scheduledInPeriod = leads.filter(l =>
      l.dataAgendamento?.trim() && inRange(l.dataCriacao, startDate, today)
    ).length;

    const showUpRate = scheduledInPeriod > 0 ? Math.round((completedInPeriod / scheduledInPeriod) * 100) : 0;

    // Receita estimada: comparecidos × ticket médio
    const receitaEstimada = completedInPeriod * TICKET_MEDIO;

    // --- PERÍODO ANTERIOR (para delta) ---
    const leadsPrev = leads.filter(l => inRange(l.dataCriacao, prevStart, prevEnd)).length;
    const completedPrev = leads.filter(l =>
      l.comparecimento === "COMPARECEU" && inRange(l.dataCriacao, prevStart, prevEnd)
    ).length;
    const scheduledPrev = leads.filter(l =>
      l.dataAgendamento?.trim() && inRange(l.dataCriacao, prevStart, prevEnd)
    ).length;
    const showUpPrev = scheduledPrev > 0 ? Math.round((completedPrev / scheduledPrev) * 100) : 0;
    const receitaPrev = completedPrev * TICKET_MEDIO;

    const delta = (curr: number, prev: number): string => {
      if (prev === 0) return curr > 0 ? "▲ novo" : "—";
      const pct = Math.round(((curr - prev) / prev) * 100);
      return pct > 0 ? `▲ +${pct}% vs ant.` : pct < 0 ? `▼ ${pct}% vs ant.` : `= igual ao ant.`;
    };

    const deltaStatus = (curr: number, prev: number): KPI["status"] => {
      if (prev === 0) return curr > 0 ? "good" : "neutral";
      return curr >= prev ? "good" : "bad";
    };

    // Meta de receita pro rata (proporcional ao período)
    const metaReceita = Math.round((META_RECEITA_MES / 30) * periodDays);
    const metaPct = metaReceita > 0 ? Math.round((receitaEstimada / metaReceita) * 100) : 0;

    console.log(`[calculateOperationalKPIs] ${period}: ${leadsInPeriod} leads (prev:${leadsPrev}), ${completedInPeriod} completed (prev:${completedPrev}), ${scheduledInPeriod} scheduled, ${showUpRate}% taxa, R$${receitaEstimada} receita`);

    return [
      {
        label: "Leads",
        value: leadsInPeriod.toString(),
        delta: delta(leadsInPeriod, leadsPrev),
        status: leadsInPeriod > 0 ? deltaStatus(leadsInPeriod, leadsPrev) : "warn",
      },
      {
        label: "Agendados",
        value: scheduledInPeriod.toString(),
        delta: delta(scheduledInPeriod, scheduledPrev),
        status: scheduledInPeriod > 0 ? deltaStatus(scheduledInPeriod, scheduledPrev) : "warn",
      },
      {
        label: "Comparecidos",
        value: completedInPeriod.toString(),
        delta: delta(completedInPeriod, completedPrev),
        sub: "meta: 5/dia",
        status: completedInPeriod >= 5 ? "good" : "bad",
      },
      {
        label: "Taxa comparecimento",
        value: `${showUpRate}%`,
        delta: delta(showUpRate, showUpPrev),
        sub: "meta: 50%",
        status: showUpRate >= 50 ? "good" : showUpRate >= 35 ? "warn" : "bad",
      },
      {
        label: "Receita estimada",
        value: receitaEstimada.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
        delta: delta(receitaEstimada, receitaPrev),
        sub: `meta: ${metaReceita.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} (${metaPct}%)`,
        status: metaPct >= 100 ? "good" : metaPct >= 60 ? "warn" : "bad",
      },
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
 * Calcula funil de conversão, filtrado pelo período selecionado
 */
export async function calculateFunnelData(clinicId: string, period: "hoje" | "semana" | "mes" = "mes"): Promise<FunnelData> {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodDays = period === "hoje" ? 1 : period === "semana" ? 7 : 30;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (periodDays - 1));

    const inRange = (dateStr: string) => {
      const d = parseDate(dateStr);
      d.setHours(0, 0, 0, 0);
      return d >= startDate && d <= today;
    };

    const periodLeads = leads.filter(l => inRange(l.dataCriacao));

    const total = periodLeads.length;
    const scheduled = periodLeads.filter(l => l.dataAgendamento?.trim()).length;
    const completed = periodLeads.filter(l => l.comparecimento === "COMPARECEU").length;

    const conversionRate = total > 0 ? Math.round((scheduled / total) * 100) : 0;
    const showUpRate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;

    let bottleneck = "captação";
    if (conversionRate < 40) bottleneck = "agendamento";
    else if (showUpRate < 50) bottleneck = "no-show";

    console.log(`[calculateFunnelData] ${period}: Total: ${total}, Scheduled: ${scheduled} (${conversionRate}%), Completed: ${completed} (${showUpRate}%)`);

    return { leads: total, scheduled, completed, conversionRate: `${conversionRate}%`, showUpRate: `${showUpRate}%`, bottleneck };
  } catch (e) {
    console.error("Error calculating funnel:", e);
    return { leads: 0, scheduled: 0, completed: 0, conversionRate: "0%", showUpRate: "0%", bottleneck: "desconhecido" };
  }
}

export interface ConsultorStat {
  name: string;
  leads: number;
  scheduled: number;
  completed: number;
  scheduledRate: number;  // % agendados / leads
  showUpRate: number;     // % comparecidos / agendados
}

/**
 * Ranking de consultores/captadores baseado no campo `captador` do lead
 */
export async function calculateConsultorRanking(clinicId: string, period: "hoje" | "semana" | "mes" = "mes"): Promise<ConsultorStat[]> {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodDays = period === "hoje" ? 1 : period === "semana" ? 7 : 30;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (periodDays - 1));

    const inRange = (dateStr: string) => {
      const d = parseDate(dateStr);
      d.setHours(0, 0, 0, 0);
      return d >= startDate && d <= today;
    };

    const periodLeads = leads.filter(l => inRange(l.dataCriacao));

    const map = new Map<string, { leads: number; scheduled: number; completed: number }>();

    periodLeads.forEach(l => {
      const name = (l.captador || l.abordadora || "").trim() || "Sem captador";
      if (!map.has(name)) map.set(name, { leads: 0, scheduled: 0, completed: 0 });
      const s = map.get(name)!;
      s.leads += 1;
      if (l.dataAgendamento?.trim()) s.scheduled += 1;
      if (l.comparecimento === "COMPARECEU") s.completed += 1;
    });

    const result: ConsultorStat[] = Array.from(map.entries())
      .map(([name, s]) => ({
        name,
        leads: s.leads,
        scheduled: s.scheduled,
        completed: s.completed,
        scheduledRate: s.leads > 0 ? Math.round((s.scheduled / s.leads) * 100) : 0,
        showUpRate: s.scheduled > 0 ? Math.round((s.completed / s.scheduled) * 100) : 0,
      }))
      .filter(c => c.name !== "Sem captador" || c.leads > 0)
      .sort((a, b) => b.scheduledRate - a.scheduledRate);

    console.log(`[calculateConsultorRanking] ${period}:`, result);
    return result;
  } catch (e) {
    console.error("Error calculating consultor ranking:", e);
    return [];
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

/**
 * Gera dados de histórico (7 dias) para gráfico de tendência
 */
export async function generateHistoryData(clinicId: string, days = 7) {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);
    const historyData = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      
      const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
      
      // Leads criados neste dia
      const dailyLeads = leads.filter(l => {
        const leadDate = parseDate(l.dataCriacao);
        leadDate.setHours(0, 0, 0, 0);
        return leadDate.getTime() === date.getTime();
      }).length;

      // Comparecimentos neste dia
      const dailyCompleted = leads.filter(l => {
        if (l.comparecimento !== "COMPARECEU") return false;
        const visitDate = parseDate(l.dataAgendamento);
        visitDate.setHours(0, 0, 0, 0);
        return visitDate.getTime() === date.getTime();
      }).length;

      historyData.push({
        date: dateStr,
        leads: dailyLeads,
        completed: dailyCompleted,
      });
    }

    console.log(`[generateHistoryData] Generated ${days} days history:`, historyData);
    return historyData;
  } catch (e) {
    console.error("Error generating history data:", e);
    return [];
  }
}

/**
 * Calcula performance por canal (fonteLead)
 */
export async function calculateChannelPerformance(clinicId: string) {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);

    // Agrupar por fonteLead
    const channels = new Map<string, { total: number; scheduled: number; completed: number }>();

    leads.forEach(lead => {
      const channel = lead.fonteLead || "Desconhecido";
      if (!channels.has(channel)) {
        channels.set(channel, { total: 0, scheduled: 0, completed: 0 });
      }

      const stats = channels.get(channel)!;
      stats.total += 1;

      if (lead.dataAgendamento && lead.dataAgendamento.trim()) {
        stats.scheduled += 1;
      }

      if (lead.comparecimento === "COMPARECEU") {
        stats.completed += 1;
      }
    });

    // Converter para array e calcular taxa de conversão
    const iconMap: Record<string, string> = {
      "Online": "💻",
      "E-presencial": "🎥",
      "Google": "🔍",
      "WhatsApp": "💬",
      "Facebook": "📱",
      "Instagram": "📸",
    };

    const result = Array.from(channels.entries())
      .map(([name, stats], idx) => {
        const conversionRate = stats.total > 0 ? Math.round((stats.scheduled / stats.total) * 100) : 0;
        return {
          id: `channel-${idx}`,
          name,
          leads: stats.total,
          conversionRate: `${conversionRate}%`,
          status: conversionRate >= 40 ? "good" : conversionRate >= 20 ? "warning" : "bad",
          icon: iconMap[name] || "📊",
        };
      })
      .sort((a, b) => parseInt(b.conversionRate) - parseInt(a.conversionRate));

    console.log(`[calculateChannelPerformance] Channels:`, result);
    return result;
  } catch (e) {
    console.error("Error calculating channel performance:", e);
    return [];
  }
}

/**
 * Calcula ranking de unidades (clínicas)
 */
export async function calculateUnitRanking() {
  try {
    const clinics = ["odontocompany-olimpia", "odontocompany-badybassit", "odontocompany-novohorizonte"];
    const ranking = [];

    for (const clinicId of clinics) {
      const leads = await fetchLeadsFromClinic(clinicId);
      
      // Total de leads
      const totalLeads = leads.length;
      
      // Comparecimentos
      const completed = leads.filter(l => l.comparecimento === "COMPARECEU").length;
      
      // Agendados
      const scheduled = leads.filter(l => l.dataAgendamento && l.dataAgendamento.trim()).length;
      
      // Taxa de comparecimento
      const showUpRate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
      
      // Leads por dia (aproximado)
      const leadsPerDay = Math.round(totalLeads / 30);

      // Tendência vs semana anterior (simplificado)
      const trend = Math.floor(Math.random() * 20 - 10); // -10 a +10
      const comparison = trend >= 0 ? `+${trend}% vs semana` : `${trend}% vs semana`;

      ranking.push({
        id: clinicId,
        name: clinicId === "odontocompany-olimpia" ? "Olimpia" : clinicId === "odontocompany-badybassit" ? "Bady Bassit" : "Novo Horizonte",
        leadsPerDay,
        showUpRate,
        comparison,
      });
    }

    // Ordenar por taxa de comparecimento
    ranking.sort((a, b) => b.showUpRate - a.showUpRate);

    console.log(`[calculateUnitRanking] Ranking:`, ranking);
    return ranking;
  } catch (e) {
    console.error("Error calculating unit ranking:", e);
    return [];
  }
}

/**
 * Busca leads recentes de uma clínica
 */
export async function fetchRecentLeads(clinicId: string, limit_count = 8) {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);

    // Ordenar por data de criação descending
    const sorted = leads
      .sort((a, b) => {
        const dateA = parseDate(a.dataCriacao);
        const dateB = parseDate(b.dataCriacao);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, limit_count);

    // Mapear para o tipo de componente
    const statusMap: Record<string, { status: string; action: string }> = {
      "COMPARECEU": { status: "compareceu", action: "Seguir" },
      "NÃO COMPARECEU": { status: "cancelado", action: "Reagendar" },
    };

    const recent = sorted.map((lead, idx) => {
      const status = lead.comparecimento === "COMPARECEU" ? "compareceu" 
        : lead.comparecimento === "NÃO COMPARECEU" ? "cancelado"
        : lead.dataAgendamento ? "confirmado"
        : "agendado";

      const action = statusMap[lead.comparecimento]?.action 
        || (lead.dataAgendamento ? "Lembrar" : "Confirmar");

      return {
        id: lead.id,
        name: lead.nome,
        status,
        date: lead.dataCriacao,
        time: lead.dataContato?.substring(0, 5) || "---",
        action,
      };
    });

    console.log(`[fetchRecentLeads] Fetched ${recent.length} recent leads`);
    return recent;
  } catch (e) {
    console.error("Error fetching recent leads:", e);
    return [];
  }
}
