import { useState, useMemo, useEffect, useRef } from "react";
import { Lead, ClinicFilter, DashboardStats, LeadStage } from "@/types/crm";
import { mockLeads } from "@/data/mockLeads";
import { format } from "date-fns";
import Papa from "papaparse";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

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
});

// Garantir que todo lead tem dataCriacao (fallback para dataContato ou hoje)
const ensureDateCriacao = (lead: Lead): Lead => {
  if (lead.dataCriacao) return lead;
  return {
    ...lead,
    dataCriacao: lead.dataContato || format(new Date(), "dd/MM/yyyy"),
  };
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

  // Count follow-ups done today
  const followUpsDoneToday = useMemo(() => {
    const today = format(new Date(), "dd/MM/yyyy");
    return leads.filter((l) => l.dataFollowUp === today).length;
  }, [leads]);

  const stats = useMemo<DashboardStats>(() => {
    const quentes = leads.filter((l) => l.status === "QUENTE").length;
    const mornos = leads.filter((l) => l.status === "MORNO").length;
    const frios = leads.filter((l) => l.status === "FRIO").length;
    const agendados = leads.filter((l) => l.dataAgendamento && l.dataAgendamento !== "").length;
    const todayFormatted = format(new Date(), "dd/MM/yyyy");
    const agendadosHoje = leads.filter((l) => l.dataAgendamento === todayFormatted).length;
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
    return leads
      .filter(
        (l) =>
          l.etapaLead.startsWith("Follow-Up") &&
          l.etapaLead !== "Desistência" &&
          l.comparecimento !== "COMPARECEU"
      )
      .sort((a, b) => {
        // Sort by follow-up date, oldest first
        if (!a.dataFollowUp) return 1;
        if (!b.dataFollowUp) return -1;
        const [dayA, monthA, yearA] = a.dataFollowUp.split('/');
        const [dayB, monthB, yearB] = b.dataFollowUp.split('/');
        const dateA = new Date(parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
        const dateB = new Date(parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
        return dateA.getTime() - dateB.getTime();
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
    
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        const nextCount = l.followUpCount + 1;
        
        // After Follow-Up 12, mark as Desistência
        if (nextCount > 12) {
          return {
            ...l,
            etapaLead: "Desistência",
            dataFollowUp: todayFormatted,
            observacao: l.observacao 
              ? `${l.observacao} | Ciclo de follow-ups completo (12 tentativas)`
              : "Ciclo de follow-ups completo (12 tentativas)",
          };
        }
        
        // Calcular próxima data de follow-up
        // Follow-Up 1-4: +1 dia, Follow-Up 5+: +2 dias
        const nextFollowUpDate = new Date(today);
        const daysToAdd = nextCount >= 5 ? 2 : 1;
        nextFollowUpDate.setDate(today.getDate() + daysToAdd);
        const nextFollowUpFormatted = format(nextFollowUpDate, "dd/MM/yyyy");
        
        const nextStage = `Follow-Up ${nextCount}` as LeadStage;
        const newObservacao = observacao 
          ? (l.observacao ? `${l.observacao} | [${todayFormatted}] ${observacao}` : `[${todayFormatted}] ${observacao}`)
          : l.observacao;
        
        return {
          ...l,
          followUpCount: nextCount,
          etapaLead: nextStage,
          dataFollowUp: nextFollowUpFormatted,
          observacao: newObservacao,
        };
      })
    );
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
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...updates } : l)));
  };

  const registerCall = (leadId: string, outcome: string, obs: string) => {
    const now = new Date();
    const timestamp = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const nota = obs ? `📞 ${outcome} (${timestamp}) — ${obs}` : `📞 ${outcome} (${timestamp})`;
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          observacao: l.observacao ? `${l.observacao} | ${nota}` : nota,
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

  const exportDailyReport = async (date: Date = new Date()) => {
    const ExcelJS = (await import("exceljs")).default;
    const formatted = format(date, "dd/MM/yyyy");

    const newLeads = leads.filter(l => l.dataContato === formatted);
    const followUpsDone = leads.filter(l => l.dataFollowUp === formatted);
    // Agendamentos feitos: follow-up foi hoje E a consulta agendada é na mesma data ou posterior
    const appointmentsMade = followUpsDone.filter(l => {
      if (!l.dataAgendamento) return false;
      const [ad, am, ay] = l.dataAgendamento.split("/");
      const [fd, fm, fy] = formatted.split("/");
      const agendDate = new Date(parseInt(ay), parseInt(am) - 1, parseInt(ad));
      const followDate = new Date(parseInt(fy), parseInt(fm) - 1, parseInt(fd));
      return agendDate >= followDate;
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
    followUpGoal: 20, // Meta diária
    reminderQueue,
    sendFollowUp,
    markReminder,
    updateLead,
    registerCall,
    exportCSV,
    importCSV,
    getAppointmentsFor,
    exportAppointments,
    exportDailyReport,
    exportWeeklyReport,
    deleteLeads,
    clearAllLeads,
    clearDuplicates,
  };
}
