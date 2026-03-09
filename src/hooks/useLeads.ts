import { useState, useMemo, useEffect, useRef } from "react";
import { Lead, ClinicFilter, DashboardStats, LeadStage, LeadComparecimento } from "@/types/crm";
import { mockLeads } from "@/data/mockLeads";
import { format, addDays, parse } from "date-fns";
import { normalizePhoneTo11Digits } from "@/lib/phone";
import Papa from "papaparse";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, updateDoc, getDoc } from "firebase/firestore";

const STORAGE_KEY = "rede_leads_data";
const FIREBASE_DOC = doc(db, "crm_data", "shared");

// Normalizar fontes antigas para as novas (unificar variações de maiúscula e agrupar online)
const normalizeFonteLead = (fonte: string): string => {
  if (!fonte) return "Outro";
  const normalized = fonte.trim().toLowerCase();
  
  // Mapeamento exato
  const fonteMaps: Record<string, string> = {
    "instagram": "Online",
    "facebook": "Online",
    "whatsapp": "Online",
    "google": "Google",
    "sorteio radio": "Sorteio Radio",
    "sorteio rádio": "Sorteio Radio",
    "site": "Site",
    "indicação": "Indicação",
    "cupom indicação": "Indicação",
    "cupom indicaçao": "Indicação",
    "online": "Online",
  };
  
  // Se encontra no mapa, retorna
  if (fonteMaps[normalized]) {
    return fonteMaps[normalized];
  }
  
  // Busca parcial (se contém a palavra)
  if (normalized.includes("instagram") || normalized.includes("facebook") || normalized.includes("whatsapp")) {
    return "Online";
  }
  if (normalized.includes("google")) return "Google";
  if (normalized.includes("site")) return "Site";
  if (normalized.includes("sorteio") || normalized.includes("radio")) return "Sorteio Radio";
  if (normalized.includes("indicação") || normalized.includes("indicaçao")) {
    return "Indicação";
  }

  // Se o valor corresponde a uma etapa do lead (coluna trocada na importação), ignora
  const etapasConhecidas = [
    "novo", "em contato", "follow-up", "avaliação agendada",
    "desistência", "desistencia", "finalizado",
  ];
  if (etapasConhecidas.some((e) => normalized.startsWith(e))) {
    return "Outro";
  }

  // Valores de status/resposta/comparecimento que não são fontes válidas
  const naoSaoFontes = ["quente", "morno", "frio", "respondeu", "não respondeu", "compareceu", "não compareceu"];
  if (naoSaoFontes.includes(normalized)) {
    return "Outro";
  }
  
  // Se não reconhecer, retorna como está (preserva valor original)
  return fonte;
};

const normalizeLead = (lead: Lead): Lead => ({
  ...lead,
  fonteLead: normalizeFonteLead(lead.fonteLead),
  dataRetornoLigacao: lead.dataRetornoLigacao ?? "",
});

// Garantir que todo lead tem dataCriacao (fallback para dataContato ou hoje)
const ensureDateCriacao = (lead: Lead): Lead => {
  const created = lead.dataCriacao || lead.dataContato || format(new Date(), "dd/MM/yyyy");
  const out: Lead = { ...lead, dataCriacao: created };
  // If there is an appointment but no recorded creation date for that appointment,
  // use the lead creation date as an estimate for when the appointment was registered.
  if (out.dataAgendamento && (!out.dataAgendamentoCriado || out.dataAgendamentoCriado.trim() === "")) {
    out.dataAgendamentoCriado = created;
  }
  return out;
};

export function useLeads() {
  const isFromFirebase = useRef(false);
  const isMounted = useRef(true);

  // Carregar dados do localStorage na inicialização (enquanto Firebase carrega)
  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const data = saved ? JSON.parse(saved) : mockLeads;
      // Normalizar fontes e garantir dataCriacao ao carregar
      return data.map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
    } catch {
      return mockLeads.map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
    }
  });
  const [filters, setFilters] = useState<ClinicFilter>({
    etapa: "Todas",
    status: "Todos",
    resposta: "Todas",
    busca: "",
  });

  // Escutar mudanças em tempo real do Firebase (todos os usuários compartilham os mesmos dados)
  useEffect(() => {
    isMounted.current = true;
    const unsubscribe = onSnapshot(FIREBASE_DOC, (snapshot) => {
      if (!isMounted.current) return;
      if (snapshot.exists()) {
        let data = snapshot.data().leads as Lead[];
        if (data && Array.isArray(data)) {
          // Normalizar fontes antigas para novos padrões e garantir dataCriacao
          data = data.map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
          isFromFirebase.current = true;
          setLeads(data);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
      }
    }, () => {
      // Se Firebase falhar, mantém dados do localStorage silenciosamente
    });
    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, []);

  // Salvar no Firebase + localStorage quando leads mudarem (com debounce)
  useEffect(() => {
    // Se a mudança veio do Firebase, não salva de volta (evita loop)
    if (isFromFirebase.current) {
      isFromFirebase.current = false;
      return;
    }
    // Salva localmente imediatamente
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
    // Salva no Firebase com debounce de 1,5s, normalizando fontes e garantindo dataCriacao
    const timer = setTimeout(async () => {
      try {
        const normalizedLeads = leads.map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
        await setDoc(FIREBASE_DOC, { leads: normalizedLeads, lastUpdated: new Date().toISOString() }, { merge: true });
      } catch {
        // Falha silenciosa — dados ainda estão no localStorage
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (filters.etapa !== "Todas" && lead.etapaLead !== filters.etapa) return false;
      if (filters.status !== "Todos" && lead.status !== filters.status) return false;
      if (filters.resposta !== "Todas" && lead.respostaLead !== filters.resposta) return false;
      if (filters.busca) {
        const q = filters.busca.toLowerCase();
        return (
          lead.nome.toLowerCase().includes(q) ||
          lead.telefone.includes(q) ||
          lead.servicoProcurado.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [leads, filters]);

  // Count follow-ups done today (sincronizado com PerformanceChart)
  const followUpsDoneToday = useMemo(() => {
    const today = format(new Date(), "dd/MM/yyyy");
    return leads.filter((l) => {
      const done = l.lastFollowUpDone || "";
      return done.startsWith(today) && l.etapaLead.startsWith("Follow-Up");
    }).length;
  }, [leads]);

  // Contar agendamentos criados/atualizados HOJE
  const scheduledTodayCount = useMemo(() => {
    const today = format(new Date(), "dd/MM/yyyy");
    return leads.filter((l) => {
      // Count appointments CREATED today (dataAgendamentoCriado)
      const dac = l.dataAgendamentoCriado || "";
      return dac.startsWith(today);
    }).length;
  }, [leads]);

  // Helper: pular fins de semana (sábado +2 dias, domingo +1 dia)
  const getNextBusinessDay = (date: Date): Date => {
    const dayOfWeek = date.getDay();
    const daysToSkip = dayOfWeek === 6 ? 2 : dayOfWeek === 0 ? 1 : 0;
    return addDays(date, daysToSkip);
  };

  const stats = useMemo<DashboardStats>(() => {
    const quentes = leads.filter((l) => l.status === "QUENTE").length;
    const mornos = leads.filter((l) => l.status === "MORNO").length;
    const frios = leads.filter((l) => l.status === "FRIO").length;
    const agendados = leads.filter((l) => l.dataAgendamento && l.dataAgendamento !== "").length;
    const todayFormatted = format(new Date(), "dd/MM/yyyy");
    const agendadosHoje = leads.filter((l) => {
      const dac = l.dataAgendamentoCriado || "";
      return dac.startsWith(todayFormatted);
    }).length;
    const followUpsPendentes = leads.filter((l) => l.etapaLead.startsWith("Follow-Up") && l.respostaLead !== "RESPONDEU").length;
    const compareceram = leads.filter((l) => l.comparecimento === "COMPARECEU").length;
    
    // Count reminders only for future appointments (tomorrow or later)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const lembretesPendentes = leads.filter((l) => {
      if (!l.dataAgendamento) return false;
      if (l.lembretes.h24 && l.lembretes.today) return false;
      
      const [day, month, year] = l.dataAgendamento.split('/');
      const agendamentoDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      agendamentoDate.setHours(0, 0, 0, 0);
      
      return agendamentoDate >= tomorrow;
    }).length;

    return {
      totalLeads: leads.length,
      quentes,
      mornos,
      frios,
      agendados,
      agendadosHoje,
      followUpsPendentes,
      compareceram,
      lembretesPendentes,
    };
  }, [leads]);

  const followUpQueue = useMemo(() => {
    const today = format(new Date(), "dd/MM/yyyy");
    
    // Helper para comparar datas em formato dd/MM/yyyy (ignora horário se presente)
    const parseDate = (dateStr: string) => {
      const datePart = dateStr.split(" ")[0]; // Extrai apenas dd/MM/yyyy
      const [day, month, year] = datePart.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    };

    const filtered = leads.filter(
      (l) =>
        (
          l.etapaLead === "Novo" ||
          l.etapaLead === "Em contato" ||
          l.etapaLead === "Avaliação agendada" ||
          l.etapaLead.startsWith("Follow-Up")
        ) &&
        l.etapaLead !== "Desistência" &&
        l.comparecimento !== "COMPARECEU" &&
        // Filtro: leads com dataFollowUp hoje/antes OU leads novos sem dataFollowUp (criados hoje/antes)
        (
          (l.dataFollowUp && parseDate(l.dataFollowUp) <= parseDate(today)) ||
          (!l.dataFollowUp && l.dataCriacao && parseDate(l.dataCriacao) <= parseDate(today))
        ) &&
        // Excluir se tiver agendamento com data >= hoje
        !(l.dataAgendamento && l.dataAgendamento.trim() !== "" && parseDate(l.dataAgendamento) >= parseDate(today))
    );

    // Separar em leads novos vs. que não compareceram
    const parseDateCriacao = (dateStr: string) => {
      const datePart = dateStr.split(" ")[0]; // Extrai apenas dd/MM/yyyy
      const [day, month, year] = datePart.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    };

    const novos = filtered
      .filter((l) => l.comparecimento !== "NÃO COMPARECEU")
      .sort((a, b) => {
        const dateA = parseDateCriacao(a.dataCriacao);
        const dateB = parseDateCriacao(b.dataCriacao);
        return dateB.getTime() - dateA.getTime(); // Mais recente primeiro
      });

    const naoCompareceram = filtered
      .filter((l) => l.comparecimento === "NÃO COMPARECEU")
      .sort((a, b) => {
        const dateA = parseDateCriacao(a.dataCriacao);
        const dateB = parseDateCriacao(b.dataCriacao);
        return dateA.getTime() - dateB.getTime(); // Mais antigo primeiro
      });

    // Intercalar: 1 novo, 1 que não compareceu, 1 novo, etc
    const resultado: Lead[] = [];
    let iNovo = 0,
      iNaoCompareceram = 0;
    while (iNovo < novos.length || iNaoCompareceram < naoCompareceram.length) {
      if (iNovo < novos.length) resultado.push(novos[iNovo++]);
      if (iNaoCompareceram < naoCompareceram.length) resultado.push(naoCompareceram[iNaoCompareceram++]);
    }
    return resultado;
  }, [leads]);

  // Leads com retorno de ligação agendado (futuros e vencidos)
  const callReturnQueue = useMemo(() => {
    return leads
      .filter((l) => !!l.dataRetornoLigacao)
      .sort((a, b) => {
        const toMs = (s: string) => {
          const parts = s.split(" ");
          const [day, month, year] = parts[0].split("/");
          const [hour, minute] = (parts[1] || "00:00").split(":");
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)).getTime();
        };
        return toMs(a.dataRetornoLigacao) - toMs(b.dataRetornoLigacao);
      });
  }, [leads]);

  const reminderQueue = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    return leads
      .filter((l) => {
        if (!l.dataAgendamento) return false;
        
        // Parse dd/MM/yyyy to Date
        const [day, month, year] = l.dataAgendamento.split('/');
        const agendamentoDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        agendamentoDate.setHours(0, 0, 0, 0);
        
        // Show only if appointment is tomorrow or later
        return agendamentoDate >= tomorrow;
      })
      .sort((a, b) => {
        // Sort by appointment date, closest first
        const [dayA, monthA, yearA] = a.dataAgendamento.split('/');
        const [dayB, monthB, yearB] = b.dataAgendamento.split('/');
        const dateA = new Date(parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
        const dateB = new Date(parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
        return dateA.getTime() - dateB.getTime();
      });
  }, [leads]);

  const sendFollowUp = (leadId: string, observacao: string = "") => {
    const today = new Date();
    const todayFormatted = format(today, "dd/MM/yyyy");
    
    // Calcula o novo estado ANTES de atualizar, para salvar no Firebase imediatamente
    const newLeads = leads.map((l) => {
      if (l.id !== leadId) return l;

      const newObservacao = observacao 
        ? (l.observacao ? `${l.observacao} | [${todayFormatted}] ${observacao}` : `[${todayFormatted}] ${observacao}`)
        : l.observacao;

      // Se lead tem agendamento, mover para Avaliação agendada
      if (l.dataAgendamento) {
        return {
          ...l,
          etapaLead: "Avaliação agendada" as LeadStage,
          comparecimento: "AGUARDANDO DATA" as LeadComparecimento,
          dataFollowUp: todayFormatted,
          lastFollowUpDone: todayFormatted,
          observacao: newObservacao,
        };
      }

      const nextCount = l.followUpCount + 1;
      
      // After Follow-Up 12, mark as Desistência
      if (nextCount > 12) {
        return {
          ...l,
          etapaLead: "Desistência" as LeadStage,
          dataFollowUp: todayFormatted,
          lastFollowUpDone: todayFormatted,
          observacao: l.observacao 
            ? `${l.observacao} | Ciclo de follow-ups completo (12 tentativas)`
            : "Ciclo de follow-ups completo (12 tentativas)",
        };
      }
      
      const nextStage = `Follow-Up ${nextCount}` as LeadStage;
      
      // Calcular próximo follow-up: +1 dia para Follow-Up 1-4, +2 dias para 5+
      const daysToAdd = nextCount < 5 ? 1 : 2;
      let nextFollowUpDate = addDays(today, daysToAdd);
      nextFollowUpDate = getNextBusinessDay(nextFollowUpDate);
      const nextFollowUpFormatted = format(nextFollowUpDate, "dd/MM/yyyy");
      
      return {
        ...l,
        followUpCount: nextCount,
        etapaLead: nextStage,
        dataFollowUp: nextFollowUpFormatted,
        lastFollowUpDone: todayFormatted,
        observacao: newObservacao,
      };
    });

    // Atualiza estado local imediatamente
    setLeads(newLeads);
    
    // Salva imediatamente no Firebase (sem debounce) para evitar race condition com listener
    setTimeout(async () => {
      try {
        const normalizedLeads = newLeads.map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
        await setDoc(FIREBASE_DOC, { leads: normalizedLeads, lastUpdated: new Date().toISOString() }, { merge: true });
        console.log(`[sendFollowUp] Lead ${leadId} salvo no Firebase`);
        // Mark que veio do nosso save, não do listener
        isFromFirebase.current = false;
      } catch (e) {
        console.error("[sendFollowUp] Erro ao salvar no Firebase:", e);
      }
    }, 50); // Pequeno delay para permitir que setLeads seja processado
  };

  const markReminder = (leadId: string, type: "h24" | "today") => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          lembretes: { ...l.lembretes, [type]: true },
          dataFollowUp: format(new Date(), "dd/MM/yyyy"),
          observacao: l.observacao ? `${l.observacao} | Lembrete ${type} enviado` : `Lembrete ${type} enviado`,
        };
      })
    );
  };

  const updateLead = (leadId: string, updates: Partial<Lead>) => {
    setLeads((prev) => {
      const todayFormatted = format(new Date(), "dd/MM/yyyy");
      const updated = prev.map((l) => {
        if (l.id !== leadId) return l;
        // If dataAgendamento is being set now (and previously empty), record the creation date
        if (updates.dataAgendamento && (!l.dataAgendamento || l.dataAgendamento.trim() === "")) {
          return { ...l, ...updates, dataAgendamentoCriado: todayFormatted };
        }
        // If dataAgendamento cleared, also clear the created date
        if ((updates.dataAgendamento === "" || updates.dataAgendamento === undefined) && l.dataAgendamentoCriado) {
          return { ...l, ...updates, dataAgendamentoCriado: undefined };
        }
        return { ...l, ...updates };
      });
      // Se o nome foi alterado, sincroniza o leadNome na conversa do Firestore
      if (updates.nome !== undefined) {
        const lead = prev.find((l) => l.id === leadId);
        if (lead?.telefone) {
          const cleanPhone = lead.telefone.replace(/\D/g, "");
          console.log(`Atualizando leadNome para ${updates.nome} na conversa ${cleanPhone}`);
          
          // Variações do telefone para buscar a conversa existente
          const phoneVariants = [
            cleanPhone,                           // 17992633297
            `55${cleanPhone}`,                   // 5517992633297  
            cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone  // Remove 55 se existir
          ];

          // Busca qual variação já existe no Firestore antes de atualizar
          const findAndUpdateConversation = async () => {
            for (const [index, phone] of phoneVariants.entries()) {
              try {
                const convRef = doc(db, "conversations", phone);
                const convSnap = await getDoc(convRef);
                
                if (convSnap.exists()) {
                  // Encontrou! Atualiza só esta conversa
                  await updateDoc(convRef, { leadNome: updates.nome });
                  console.log(`leadNome atualizado na conversa existente ${phone}: ${updates.nome}`);
                  return; // Para aqui, não tenta outras variações
                } else {
                  console.log(`Tentativa ${index + 1} (${phone}): conversa não existe`);
                }
              } catch (err) {
                console.log(`Erro na tentativa ${index + 1} (${phone}):`, err);
              }
            }
            console.log('Nenhuma conversa existente encontrada para atualizar');
          };

          findAndUpdateConversation();
        }
      }
      return updated;
    });
  };

  const createLead = (leadData: Omit<Lead, 'id'>) => {
    const newId = `lead_${Date.now()}`;
    const raw: Lead = { ...leadData, id: newId } as Lead;
    const newLead = ensureDateCriacao(normalizeLead(raw));
    setLeads((prev) => [...prev, newLead]);

    // Try to link the new lead to an existing conversation in Firestore
    (async () => {
      try {
        const telefone = leadData.telefone || "";
        const normalized11 = normalizePhoneTo11Digits(telefone);
        if (!normalized11) return;

        const convRef = doc(db, "conversations", normalized11);
        // Merge so we don't overwrite existing conversation fields
        await setDoc(convRef, { telefone: normalized11, leadNome: leadData.nome || "", leadId: newId }, { merge: true });
        console.log(`[createLead] Conversa vinculada/atualizada: ${normalized11} -> lead ${newId}`);
      } catch (err) {
        console.error("[createLead] Falha ao vincular conversa no Firestore:", err);
      }
    })();
  };

  const clearCallReturn = (leadId: string) => {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, dataRetornoLigacao: "" } : l));
  };

  const registerCall = (leadId: string, outcome: string, obs: string, returnDate?: string) => {
    const now = new Date();
    const timestamp = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const nota = obs ? `📞 ${outcome} (${timestamp}) — ${obs}` : `📞 ${outcome} (${timestamp})`;
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          observacao: l.observacao ? `${l.observacao} | ${nota}` : nota,
          dataRetornoLigacao: returnDate ?? l.dataRetornoLigacao ?? "",
          respostaLead: outcome === "Atendeu" ? "RESPONDEU" : "NÃO RESPONDEU",
        };
      })
    );
  };

  // return leads whose `dataAgendamento` matches the given date (formatted as dd/MM/yyyy)
  const getAppointmentsFor = (date: Date = new Date()) => {
    const formatted = format(date, "dd/MM/yyyy");
    return leads.filter((l) => l.dataAgendamento.startsWith(formatted));
  };

  const exportAppointments = (date: Date = new Date()) => {
    const appts = getAppointmentsFor(date);
    const data = appts.map((l) => ({
      "NOME DO LEAD": l.nome,
      TELEFONE: l.telefone,
      "SERVIÇO PROCURADO": l.servicoProcurado,
      "DATA DE AGENDAMENTO": l.dataAgendamento,
      "DATA AGENDAMENTO CRIADO": l.dataAgendamentoCriado || "",
      COMPARECIMENTO: l.comparecimento,
      OBSERVAÇÃO: l.observacao,
    }));
    const csv = Papa.unparse(data, { delimiter: ";" });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rede_Leads_Agendados_${format(date, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportWeeklyAppointments = (date: Date = new Date()) => {
    // Calcular início e fim da semana (domingo a sábado)
    const dayOfWeek = date.getDay();
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const appts = leads.filter((l) => {
      if (!l.dataAgendamento) return false;
      const parts = l.dataAgendamento.split('/');
      if (parts.length < 3) return false;
      // dataAgendamento may have time after space
      const [day, month, yearAndRest] = parts;
      const year = yearAndRest.split(' ')[0];
      const agDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return agDate >= startOfWeek && agDate <= endOfWeek;
    });

    const data = appts.map((l) => ({
      "NOME DO LEAD": l.nome,
      TELEFONE: l.telefone,
      "SERVIÇO PROCURADO": l.servicoProcurado,
      "DATA DE AGENDAMENTO": l.dataAgendamento,
      "DATA AGENDAMENTO CRIADO": l.dataAgendamentoCriado || "",
      COMPARECIMENTO: l.comparecimento,
      OBSERVAÇÃO: l.observacao,
    }));

    const csv = Papa.unparse(data, { delimiter: ";" });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rede_Leads_Agendados_Semana_${format(date, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDailyReport = async (date: Date = new Date()) => {
    const ExcelJS = (await import("exceljs")).default;
    const formatted = format(date, "dd/MM/yyyy");

    const newLeads = leads.filter(l => {
      const dc = l.dataContato || "";
      return dc.startsWith(formatted);
    });
    const followUpsDone = leads.filter(l => {
      const df = l.dataFollowUp || "";
      return df.startsWith(formatted);
    });
    // Agendamentos feitos: contar agendamentos CRIADOS na UI hoje (dataAgendamentoCriado)
    const appointmentsMade = leads.filter(l => {
      const dac = l.dataAgendamentoCriado || "";
      return dac.startsWith(formatted);
    });

    // Deduplicar: cada lead aparece uma vez; prioridade = agendamento > followup > novo
    const seen = new Set<string>();
    const allDetails: Lead[] = [];
    for (const l of [...appointmentsMade, ...followUpsDone, ...newLeads]) {
      if (!seen.has(l.id)) { seen.add(l.id); allDetails.push(l); }
    }

    const now = new Date();
    const generatedAt = `${format(now, "dd/MM/yyyy")} ${format(now, "HH:mm")}`;

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Relatório Diário");

    ws.columns = [
      { width: 32 },
      { width: 18 },
      { width: 18 },
      { width: 14 },
      { width: 16 },
      { width: 20 },
      { width: 14 },
      { width: 12 },
    ];

    const addInfoRow = (label: string, value?: string | number) => {
      const row = ws.addRow(value !== undefined ? [label, value] : [label]);
      row.getCell(1).font = { bold: !value };
      return row;
    };

    addInfoRow("REDE LEADS");
    ws.getRow(ws.rowCount).getCell(1).font = { bold: true, size: 14 };
    addInfoRow("Central de Conversão de Leads");
    addInfoRow("WhatsApp: (17) 99115-4763");
    ws.addRow([]);
    addInfoRow("RELATÓRIO DIÁRIO");
    ws.getRow(ws.rowCount).getCell(1).font = { bold: true, size: 12 };
    addInfoRow("Data do Relatório", formatted);
    addInfoRow("Gerado em", generatedAt);
    ws.addRow(["=========================================="]);
    ws.addRow([]);
    addInfoRow("RESUMO");
    addInfoRow("ENTRADA DE LEADS", newLeads.length);
    addInfoRow("FOLLOW-UPS REALIZADOS", followUpsDone.length);
    addInfoRow("AGENDAMENTOS FEITOS", appointmentsMade.length);
    ws.addRow([]);
    addInfoRow("===== DETALHAMENTO =====");
    ws.addRow([]);

    const appointmentIds = new Set(appointmentsMade.map(l => l.id));

    const headerRow = ws.addRow(["NOME", "TELEFONE", "SERVIÇO", "ETAPA", "RESPOSTA", "DATA AGENDAMENTO", "FONTE", "STATUS"]);
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8B8B8" } };
    });

    allDetails.forEach(l => {
      const row = ws.addRow([
        l.nome,
        l.telefone,
        l.servicoProcurado,
        l.etapaLead || "",
        l.respostaLead || "",
        l.dataAgendamento || "",
        l.fonteLead,
        l.status,
      ]);
      if (appointmentIds.has(l.id)) {
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        });
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rede_Leads_Relatorio_Diario_${format(date, "yyyy-MM-dd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportWeeklyReport = async (date: Date = new Date()) => {
    // Calcular início e fim da semana (domingo a sábado)
    const dayOfWeek = date.getDay();
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    // Filtrar comparecimentos da semana
    const comparecimentos = leads.filter(l => {
      if (l.comparecimento !== "COMPARECEU" || !l.dataAgendamento) return false;
      
      const [day, month, year] = l.dataAgendamento.split('/');
      const agendDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      return agendDate >= startOfWeek && agendDate <= endOfWeek;
    });
    
    // Contar agendados da semana
    const agendadosSemana = leads.filter(l => {
      if (!l.dataAgendamento) return false;
      
      const [day, month, year] = l.dataAgendamento.split('/');
      const agendDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      return agendDate >= startOfWeek && agendDate <= endOfWeek;
    }).length;

    // Contar leads criados na semana (baseado em `dataCriacao` no formato dd/MM/yyyy)
    const leadsCriadosSemana = leads.filter(l => {
      if (!l.dataCriacao) return false;
      const parts = l.dataCriacao.split('/');
      if (parts.length !== 3) return false;
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      return d >= startOfWeek && d <= endOfWeek;
    }).length;
    
    const taxaComparecimento = agendadosSemana > 0 
      ? ((comparecimentos.length / agendadosSemana) * 100).toFixed(1)
      : "0.0";
    
    const now = new Date();
    const generatedAt = `${format(now, "dd/MM/yyyy")} ${format(now, "HH:mm")}`;

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Relatório Semanal");

    ws.columns = [
      { width: 32 },
      { width: 18 },
      { width: 18 },
      { width: 20 },
      { width: 14 },
      { width: 30 },
    ];

    const addInfoRow = (label: string, value?: string | number) => {
      const row = ws.addRow(value !== undefined ? [label, value] : [label]);
      row.getCell(1).font = { bold: !value };
      return row;
    };

    addInfoRow("REDE LEADS");
    ws.getRow(ws.rowCount).getCell(1).font = { bold: true, size: 14 };
    addInfoRow("Central de Conversão de Leads");
    addInfoRow("WhatsApp: (17) 99115-4763");
    ws.addRow([]);
    addInfoRow("RELATÓRIO SEMANAL");
    ws.getRow(ws.rowCount).getCell(1).font = { bold: true, size: 12 };
    addInfoRow("Período", `${format(startOfWeek, "dd/MM/yyyy")} a ${format(endOfWeek, "dd/MM/yyyy")}`);
    addInfoRow("Gerado em", generatedAt);
    ws.addRow(["=========================================="]);
    ws.addRow([]);
    addInfoRow("RESUMO");
    addInfoRow("COMPARECIMENTOS", comparecimentos.length);
    addInfoRow("LEADS CRIADOS", leadsCriadosSemana);
    addInfoRow("AGENDADOS NA SEMANA", agendadosSemana);
    addInfoRow("TAXA DE COMPARECIMENTO", `${taxaComparecimento}%`);
    ws.addRow([]);
    addInfoRow("===== DETALHAMENTO DOS COMPARECIMENTOS =====");
    ws.addRow([]);

    const headerRow = ws.addRow(["NOME", "TELEFONE", "SERVIÇO", "DATA AGENDAMENTO", "FONTE", "OBSERVAÇÃO"]);
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8B8B8" } };
    });

    comparecimentos.forEach(l => {
      const row = ws.addRow([
        l.nome,
        l.telefone,
        l.servicoProcurado,
        l.dataAgendamento,
        l.fonteLead,
        l.observacao || "",
      ]);
      row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rede_Leads_Relatorio_Semanal_${format(date, "yyyy-MM-dd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const data = leads.map((l) => ({
      "DATA DE CRIAÇÃO": l.dataCriacao,
      "DATA DO CONTATO": l.dataContato,
      "NOME DO LEAD": l.nome,
      "TELEFONE": l.telefone,
      "SERVIÇO PROCURADO": l.servicoProcurado,
      "CAPTADOR": l.captador,
      "FONTE DO LEAD": l.fonteLead,
      "ETAPA DO LEAD": l.etapaLead,
      "STATUS": l.status,
      "RESPOSTA LEAD": l.respostaLead,
      "COMPARECIMENTO": l.comparecimento,
      "DATA DE FOLLOW UP": l.dataFollowUp,
      "ÚLTIMO FOLLOW UP REALIZADO": l.lastFollowUpDone || "",
      "DATA DE AGENDAMENTO": l.dataAgendamento,
      "OBSERVAÇÃO": l.observacao,
      "LEMBRETE 24H": l.lembretes.h24 ? "SIM" : "NÃO",
      "LEMBRETE HOJE": l.lembretes.today ? "SIM" : "NÃO",
    }));
    const csv = Papa.unparse(data, { delimiter: ";" });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rede_Leads_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;

      // Decode: try UTF-8 first (strict), fallback to Windows-1252
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        text = new TextDecoder("windows-1252").decode(buffer);
      }

      // Remove BOM if present
      text = text.replace(/^\uFEFF/, "");

      // Split lines and find the actual header row (first 5 lines)
      // The CSV may start with a company title row before the real headers
      const lines = text.split(/\r?\n/);
      let headerIdx = 0;
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const upper = lines[i].toUpperCase();
        if (upper.includes("NOME") && upper.includes("TELEFONE")) {
          headerIdx = i;
          break;
        }
      }

      // Rebuild CSV starting from the actual header row
      const csvContent = lines.slice(headerIdx).join("\n");

      // Detect delimiter: count semicolons vs commas in header line
      const headerLine = lines[headerIdx];
      const commas = (headerLine.match(/,/g) || []).length;
      const semis  = (headerLine.match(/;/g) || []).length;
      const delimiter = semis > commas ? ";" : ",";

      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        complete: (results) => {
          if (!results.data.length) return;

          // Smart column resolver: find best matching key for each field
          const allKeys = Object.keys(results.data[0] as any).map(k =>
            k.replace(/^\uFEFF/, "").trim()
          );

          const findKey = (...patterns: string[]): string | null => {
            for (const pattern of patterns) {
              const exact = allKeys.find(k => k.toUpperCase() === pattern.toUpperCase());
              if (exact) return exact;
            }
            for (const pattern of patterns) {
              const partial = allKeys.find(k => k.toUpperCase().includes(pattern.toUpperCase()));
              if (partial) return partial;
            }
            return null;
          };

          const col = {
            dataCriacao:     findKey("DATA DE CRIAÇÃO", "DATA CRIACAO", "CRIAÇÃO"),
            dataContato:     findKey("DATA DO CONTATO", "DATA CONTATO"),
            nome:            findKey("NOME DO LEAD", "NOME LEAD", "NOME"),
            telefone:        findKey("TELEFONE", "FONE", "CEL", "CELULAR"),
            servico:         findKey("SERVIÇO PROCURADO", "SERVICO PROCURADO", "SERVIÇO", "SERVICO"),
            captador:        findKey("CAPTADOR"),
            fonte:           findKey("FONTE DO LEAD", "FONTE LEAD", "FONTE"),
            etapa:           findKey("ETAPA DO LEAD", "ETAPA LEAD", "ETAPA"),
            status:          findKey("STATUS"),
            resposta:        findKey("RESPOSTA LEAD", "RESPOSTA"),
            comparecimento:  findKey("COMPARECIMENTO"),
            dataFollowUp:    findKey("DATA DE FOLLOW UP", "DATA FOLLOW UP", "FOLLOW UP"),
            dataAgendamento: findKey("DATA DE AGENDAMENTO", "DATA AGENDAMENTO", "AGENDAMENTO"),
            observacao:      findKey("OBSERVAÇÃO", "OBSERVACAO", "OBS"),
          };

          // Get value from row by resolved key (handles BOM-stripped keys)
          const get = (row: any, key: string | null): string => {
            if (!key) return "";
            if (row[key] !== undefined) return String(row[key] || "").trim();
            const match = Object.keys(row).find(
              k => k.replace(/^\uFEFF/, "").trim().toUpperCase() === key.toUpperCase()
            );
            return match ? String(row[match] || "").trim() : "";
          };

          const imported: Lead[] = (results.data as any[])
            .filter((row: any) => {
              const nome = get(row, col.nome);
              if (!nome) return false;
              // Skip rows that are re-parsed header lines
              if (nome.toUpperCase().includes("NOME DO LEAD")) return false;
              return true;
            })
            .map((row: any, i: number) => {
              const etapaRaw = get(row, col.etapa) || "Novo";
              return {
                id: `imported-${Date.now()}-${i}`,
                dataCriacao: get(row, col.dataCriacao) || get(row, col.dataContato) || format(new Date(), "dd/MM/yyyy"),
                dataContato: get(row, col.dataContato),
                nome: get(row, col.nome),
                telefone: get(row, col.telefone),
                servicoProcurado: get(row, col.servico),
                captador: get(row, col.captador),
                fonteLead: get(row, col.fonte) || "Outro",
                etapaLead: etapaRaw as LeadStage,
                status: get(row, col.status) as any,
                respostaLead: get(row, col.resposta) as any,
                comparecimento: get(row, col.comparecimento) as any,
                dataFollowUp: get(row, col.dataFollowUp),
                dataAgendamento: get(row, col.dataAgendamento),
                dataAgendamentoCriado: get(row, col.dataAgendamento) ? (get(row, col.dataCriacao) || format(new Date(), "dd/MM/yyyy")) : "",
                dataRetornoLigacao: "",
                observacao: get(row, col.observacao),
                followUpCount: parseInt(etapaRaw?.match(/\d+/)?.[0] || "0", 10),
                lembretes: { h24: false, today: false },
              };
            });

          const normalized = imported.map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
          setLeads((prev) => [...prev, ...normalized]);
        },
        error: (error) => {
          console.error("CSV Parse Error:", error);
        },
      });
    };
    reader.readAsArrayBuffer(file);
  };

  const deleteLeads = (leadIds: string[]) => {
    setLeads((prev) => prev.filter((lead) => !leadIds.includes(lead.id)));
  };

  const clearAllLeads = () => {
    setLeads([]);
  };

  const clearDuplicates = () => {
    // Função para normalizar telefone (apenas números)
    const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
    
    // Agrupar leads por telefone normalizado
    const phoneGroups = new Map<string, Lead[]>();
    leads.forEach((lead) => {
      const normalizedPhone = normalizePhone(lead.telefone);
      if (!normalizedPhone) return; // Ignorar telefones vazios
      
      if (!phoneGroups.has(normalizedPhone)) {
        phoneGroups.set(normalizedPhone, []);
      }
      phoneGroups.get(normalizedPhone)!.push(lead);
    });

    // Para cada grupo, manter apenas o mais recente
    const leadsToKeep: Lead[] = [];
    let removedCount = 0;

    phoneGroups.forEach((group) => {
      if (group.length > 1) {
        // Ordenar por data de contato (mais recente primeiro) ou por ID
        const sorted = group.sort((a, b) => {
          // Tentar ordenar por data de contato
          if (a.dataContato && b.dataContato) {
            const [dayA, monthA, yearA] = a.dataContato.split('/');
            const [dayB, monthB, yearB] = b.dataContato.split('/');
            const dateA = new Date(parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
            const dateB = new Date(parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
            return dateB.getTime() - dateA.getTime();
          }
          // Fallback: ordenar por ID (assumindo que IDs mais recentes são maiores)
          return b.id.localeCompare(a.id);
        });
        // Manter apenas o primeiro (mais recente)
        leadsToKeep.push(sorted[0]);
        removedCount += sorted.length - 1;
      } else {
        // Não é duplicata, manter
        leadsToKeep.push(group[0]);
      }
    });

    setLeads(leadsToKeep);
    return removedCount;
  };

  return {
    leads: filteredLeads,
    allLeads: leads,
    filters,
    setFilters,
    stats,
    followUpQueue,
    followUpsDoneToday,
    scheduledTodayCount,
    followUpGoal: 20, // Meta diária
    callReturnQueue,
    reminderQueue,
    sendFollowUp,
    markReminder,
    updateLead,
    createLead,
    clearCallReturn,
    registerCall,
    exportCSV,
    importCSV,
    getAppointmentsFor,
    exportAppointments,
    exportDailyReport,
    exportWeeklyReport,
    exportWeeklyAppointments,
    deleteLeads,
    clearAllLeads,
    clearDuplicates,
  };
}
