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
export async function calculateOperationalKPIs(clinicId: string, period: "hoje" | "semana" | "mes" = "mes", ticketMedio = 1800): Promise<KPI[]> {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);
    console.log(`[calculateOperationalKPIs] Processing ${leads.length} leads for period: ${period}`);

    // Ticket médio estimado por paciente atendido
    const TICKET_MEDIO = ticketMedio;
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
 * Gera diagnósticos inteligentes com comparativos de período e ações diretas
 */
export async function generateOperationalDiagnostics(clinicId: string, ticketMedio = 1800): Promise<Diagnostic[]> {
  try {
    const leads = await fetchLeadsFromClinic(clinicId);
    const diagnostics: Diagnostic[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inRange = (dateStr: string, from: Date, to: Date) => {
      const d = parseDate(dateStr);
      d.setHours(0, 0, 0, 0);
      return d >= from && d <= to;
    };

    // Semana atual (últimos 7 dias)
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6);
    // Semana anterior
    const prevWeekEnd = new Date(weekStart); prevWeekEnd.setDate(weekStart.getDate() - 1);
    const prevWeekStart = new Date(prevWeekEnd); prevWeekStart.setDate(prevWeekEnd.getDate() - 6);

    const weekLeads = leads.filter(l => inRange(l.dataCriacao, weekStart, today));
    const prevWeekLeads = leads.filter(l => inRange(l.dataCriacao, prevWeekStart, prevWeekEnd));

    // ── DIAGNÓSTICO 1: Leads sem agendamento (urgente se > 50) ──
    const noSchedule = leads.filter(l => !l.dataAgendamento?.trim());
    if (noSchedule.length > 50) {
      diagnostics.push({
        type: "crit",
        title: `${noSchedule.length} leads sem agendamento — risco de perda imediata`,
        description: `Cada hora sem contato reduz a chance de agendamento em ~12%. Prioridade máxima.`,
        action: "Enviar WA agora",
        actionId: "send_whatsapp_unresponded",
      });
    } else if (noSchedule.length > 10) {
      diagnostics.push({
        type: "imp",
        title: `${noSchedule.length} leads aguardam agendamento`,
        description: `Ainda recuperáveis com follow-up personalizado. Iniciar contato hoje.`,
        action: "Ver leads",
        actionId: "view_unscheduled_leads",
      });
    }

    // ── DIAGNÓSTICO 2: Queda de leads na semana vs anterior ──
    const weekCount = weekLeads.length;
    const prevWeekCount = prevWeekLeads.length;
    if (prevWeekCount > 0) {
      const pct = Math.round(((weekCount - prevWeekCount) / prevWeekCount) * 100);
      if (pct <= -20) {
        diagnostics.push({
          type: "crit",
          title: `Volume de leads caiu ${Math.abs(pct)}% vs semana passada`,
          description: `Esta semana: ${weekCount} leads | Semana anterior: ${prevWeekCount}. Verificar campanhas ativas.`,
          action: "Ver campanhas",
          actionId: "view_meta_campaigns",
        });
      } else if (pct <= -10) {
        diagnostics.push({
          type: "imp",
          title: `Leads em queda: ${Math.abs(pct)}% abaixo da semana passada`,
          description: `Esta semana: ${weekCount} leads | Semana anterior: ${prevWeekCount}. Avaliar investimento em mídia.`,
          action: "Ver Meta Ads",
          actionId: "view_meta_campaigns",
        });
      } else if (pct >= 15) {
        diagnostics.push({
          type: "ok",
          title: `Volume de leads subiu ${pct}% vs semana passada`,
          description: `Esta semana: ${weekCount} leads | Semana anterior: ${prevWeekCount}. Manter estratégia atual.`,
        });
      }
    }

    // ── DIAGNÓSTICO 3: Taxa de comparecimento global ──
    const scheduled = leads.filter(l => l.dataAgendamento?.trim()).length;
    const completed = leads.filter(l => l.comparecimento === "COMPARECEU").length;
    const showUpRate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
    if (showUpRate < 35 && scheduled > 10) {
      diagnostics.push({
        type: "crit",
        title: `Comparecimento crítico: ${showUpRate}% — meta é 50%`,
        description: `${completed} de ${scheduled} agendados compareceram. Ativar confirmação automática D-1 pode recuperar 15pp.`,
        action: "Ativar confirmação",
        actionId: "activate_automation_confirmation",
      });
    } else if (showUpRate < 50 && scheduled > 10) {
      diagnostics.push({
        type: "imp",
        title: `Comparecimento em ${showUpRate}% — ${50 - showUpRate}pp abaixo da meta`,
        description: `Confirmação 2h antes + lembrete no dia do agendamento reduz no-show significativamente.`,
        action: "Ativar confirmação",
        actionId: "activate_automation_confirmation",
      });
    } else if (showUpRate >= 50 && scheduled > 5) {
      diagnostics.push({
        type: "ok",
        title: `Comparecimento ${showUpRate}% — acima da meta de 50%`,
        description: `${completed} pacientes atendidos de ${scheduled} agendados. Manter cadência de confirmação.`,
      });
    }

    // ── DIAGNÓSTICO 4: Melhor canal de conversão ──
    const channelMap = new Map<string, { total: number; scheduled: number }>();
    leads.forEach(l => {
      const ch = (l.fonteLead || "Desconhecido").trim();
      if (!channelMap.has(ch)) channelMap.set(ch, { total: 0, scheduled: 0 });
      const s = channelMap.get(ch)!;
      s.total += 1;
      if (l.dataAgendamento?.trim()) s.scheduled += 1;
    });
    const channels = Array.from(channelMap.entries())
      .map(([name, s]) => ({ name, total: s.total, rate: s.total > 5 ? Math.round((s.scheduled / s.total) * 100) : 0 }))
      .filter(c => c.total > 5)
      .sort((a, b) => b.rate - a.rate);

    if (channels.length >= 2) {
      const best = channels[0];
      const worst = channels[channels.length - 1];
      if (best.rate > 0) {
        diagnostics.push({
          type: "info",
          title: `Melhor canal: ${best.name} (${best.rate}% conversão) — ${best.total} leads`,
          description: `Pior canal: ${worst.name} com ${worst.rate}% (${worst.total} leads). Revisar script ou redirecionar verba do ${worst.name}.`,
          action: "Ver por canal",
          actionId: "view_channel_performance",
        });
      }
    }

    // ── DIAGNÓSTICO 5: Melhor dia da semana ──
    const dayCount: Record<number, { leads: number; scheduled: number }> = {};
    leads.forEach(l => {
      const d = parseDate(l.dataCriacao);
      const dow = d.getDay(); // 0=dom...6=sab
      if (!dayCount[dow]) dayCount[dow] = { leads: 0, scheduled: 0 };
      dayCount[dow].leads += 1;
      if (l.dataAgendamento?.trim()) dayCount[dow].scheduled += 1;
    });
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const bestDay = Object.entries(dayCount)
      .map(([dow, s]) => ({ dow: parseInt(dow), rate: s.leads > 5 ? Math.round((s.scheduled / s.leads) * 100) : 0, leads: s.leads }))
      .filter(d => d.leads > 5 && d.dow !== 0 && d.dow !== 6)
      .sort((a, b) => b.rate - a.rate)[0];
    if (bestDay && bestDay.rate > 0) {
      diagnostics.push({
        type: "info",
        title: `Melhor dia para captar: ${dayNames[bestDay.dow]} (${bestDay.rate}% conversão)`,
        description: `Concentrar ações de captação e follow-up às ${dayNames[bestDay.dow]}s aumenta ROI da equipe de campo.`,
      });
    }

    // ── DIAGNÓSTICO 6: Consultores sem comparecimento ──
    const captadorMap = new Map<string, { leads: number; completed: number }>();
    weekLeads.forEach(l => {
      const name = (l.captador || "").trim();
      if (!name) return;
      if (!captadorMap.has(name)) captadorMap.set(name, { leads: 0, completed: 0 });
      const s = captadorMap.get(name)!;
      s.leads += 1;
      if (l.comparecimento === "COMPARECEU") s.completed += 1;
    });
    const zeroCaptadores = Array.from(captadorMap.entries())
      .filter(([, s]) => s.leads >= 3 && s.completed === 0)
      .map(([name]) => name);
    if (zeroCaptadores.length > 0) {
      diagnostics.push({
        type: "imp",
        title: `${zeroCaptadores.length} captador(es) sem comparecimento essa semana`,
        description: `${zeroCaptadores.slice(0, 3).join(", ")} — leads captados mas nenhum compareceu. Revisar abordagem ou script de confirmação.`,
        action: "Ver captadores",
        actionId: "view_consultor_ranking",
      });
    }

    // ── DIAGNÓSTICO 7: Receita estimada vs meta ──
    const TICKET = ticketMedio;
    const META_MES = 80000;
    const mesStart = new Date(today); mesStart.setDate(today.getDate() - 29);
    const mesCompleted = leads.filter(l => l.comparecimento === "COMPARECEU" && inRange(l.dataCriacao, mesStart, today)).length;
    const receitaEstimada = mesCompleted * TICKET;
    const metaPct = Math.round((receitaEstimada / META_MES) * 100);
    const diasRestantes = 30 - Math.round((today.getTime() - mesStart.getTime()) / 86400000);
    if (metaPct < 30 && diasRestantes > 10) {
      diagnostics.push({
        type: "crit",
        title: `Receita estimada R$${receitaEstimada.toLocaleString("pt-BR")} — apenas ${metaPct}% da meta`,
        description: `Faltam ${diasRestantes} dias e R$${(META_MES - receitaEstimada).toLocaleString("pt-BR")} para bater R$${META_MES.toLocaleString("pt-BR")}. Intensificar confirmações.`,
        action: "Planejar ação",
        actionId: "view_revenue_plan",
      });
    } else if (metaPct < 60 && diasRestantes > 0) {
      diagnostics.push({
        type: "imp",
        title: `Receita em ${metaPct}% da meta — R$${(META_MES - receitaEstimada).toLocaleString("pt-BR")} ainda a gerar`,
        description: `${mesCompleted} comparecimentos × R$1.800 = R$${receitaEstimada.toLocaleString("pt-BR")}. Meta: R$${META_MES.toLocaleString("pt-BR")}/mês.`,
      });
    } else if (metaPct >= 100) {
      diagnostics.push({
        type: "ok",
        title: `Meta de receita batida! ${metaPct}% — R$${receitaEstimada.toLocaleString("pt-BR")}`,
        description: `${mesCompleted} atendimentos este mês. Excelente resultado — considerar meta mais agressiva.`,
      });
    }

    // Ordenar: crit primeiro, depois imp, ok, info
    const order = { crit: 0, imp: 1, ok: 2, info: 3 };
    diagnostics.sort((a, b) => order[a.type] - order[b.type]);

    console.log(`[generateOperationalDiagnostics] Generated ${diagnostics.length} diagnostics`);
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

    // Debug: mostra leads com comparecimento nos últimos 7 dias
    const completedLeads = leads.filter(l => l.comparecimento === "COMPARECEU");
    console.log(`[generateHistoryData] Total leads com COMPARECEU: ${completedLeads.length}`, 
      completedLeads.slice(0, 3).map(l => ({ name: l.nome, dataAgendamento: l.dataAgendamento, comparecimento: l.comparecimento }))
    );

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

      // Comparecimentos neste dia = leads com dataAgendamento neste dia E status COMPARECEU
      // dataAgendamento é a data da consulta (DD/MM/YYYY)
      const dailyCompleted = leads.filter(l => {
        if (l.comparecimento !== "COMPARECEU") return false;
        
        // Validar que tem dataAgendamento preenchida
        if (!l.dataAgendamento || !l.dataAgendamento.trim()) return false;
        
        const visitDate = parseDate(l.dataAgendamento);
        visitDate.setHours(0, 0, 0, 0);
        
        const match = visitDate.getTime() === date.getTime();
        if (match) {
          console.log(`[generateHistoryData] Match encontrado em ${dateStr}: ${l.nome} (agend: ${l.dataAgendamento})`);
        }
        return match;
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
 * Filtra canais com volume insuficiente (< 10 leads) para evitar distorções estatísticas
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

    // Converter para array e calcular métricas
    const iconMap: Record<string, string> = {
      "Online": "💻",
      "E-presencial": "🎥",
      "Google": "🔍",
      "WhatsApp": "💬",
      "Facebook": "📱",
      "Instagram": "📸",
    };

    // FILTRO: apenas canais com >= 10 leads para ter confiabilidade estatística
    const MIN_LEADS = 10;
    
    const result = Array.from(channels.entries())
      .filter(([_, stats]) => stats.total >= MIN_LEADS) // Apenas canais com volume
      .map(([name, stats], idx) => {
        const conversionRate = stats.total > 0 ? Math.round((stats.scheduled / stats.total) * 100) : 0;
        const showUpRate = stats.scheduled > 0 ? Math.round((stats.completed / stats.scheduled) * 100) : 0;
        
        // Status baseado em comparecimentos reais, não conversão
        let status = "bad";
        if (showUpRate >= 50) status = "good";
        else if (showUpRate >= 30) status = "warning";
        
        return {
          id: `channel-${idx}`,
          name,
          leads: stats.total,
          scheduled: stats.scheduled,
          completed: stats.completed,
          conversionRate: `${conversionRate}%`,
          showUpRate: `${showUpRate}%`,
          status,
          icon: iconMap[name] || "📊",
        };
      })
      .sort((a, b) => parseInt(b.showUpRate) - parseInt(a.showUpRate)); // Ordena por comparecimento real

    console.log(`[calculateChannelPerformance] Filtered channels (>=${MIN_LEADS} leads):`, result);
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

      // Tendência real: compara taxa de comparecimento semana atual vs semana anterior
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6);
      const prevWeekEnd = new Date(weekStart); prevWeekEnd.setDate(weekStart.getDate() - 1);
      const prevWeekStart = new Date(prevWeekEnd); prevWeekStart.setDate(prevWeekEnd.getDate() - 6);
      const inW = (d: string, from: Date, to: Date) => { const p = parseDate(d); p.setHours(0,0,0,0); return p >= from && p <= to; };
      const schCurr = leads.filter(l => l.dataAgendamento?.trim() && inW(l.dataCriacao, weekStart, now)).length;
      const compCurr = leads.filter(l => l.comparecimento === "COMPARECEU" && inW(l.dataCriacao, weekStart, now)).length;
      const schPrev = leads.filter(l => l.dataAgendamento?.trim() && inW(l.dataCriacao, prevWeekStart, prevWeekEnd)).length;
      const compPrev = leads.filter(l => l.comparecimento === "COMPARECEU" && inW(l.dataCriacao, prevWeekStart, prevWeekEnd)).length;
      const rateCurr = schCurr > 0 ? Math.round((compCurr / schCurr) * 100) : 0;
      const ratePrev = schPrev > 0 ? Math.round((compPrev / schPrev) * 100) : 0;
      const delta = rateCurr - ratePrev;
      const comparison = delta > 0 ? `+${delta}pp vs semana` : delta < 0 ? `${delta}pp vs semana` : `= estável`;

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
