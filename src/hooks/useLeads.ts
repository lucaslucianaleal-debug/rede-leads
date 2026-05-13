import { useState, useMemo, useEffect, useRef } from "react";
import { Lead, ClinicFilter, DashboardStats, LeadStage, LeadComparecimento } from "@/types/crm";
import { format, addDays, parse } from "date-fns";
import { normalizePhoneTo10Digits } from "@/lib/phone";
import Papa from "papaparse";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, updateDoc, getDoc, collection } from "firebase/firestore";
import { attachLastWriter } from '../lib/crmGuard';
import { saveLeadWithSync } from '@/lib/crmSync';
import { useAuth } from "./useAuth";
import { saveTimelineActivity } from "./useTimeline";

// Use per-clinic and per-user localStorage key to avoid mixing caches between clinics and users
const getStorageKey = (clinicId?: string | null, userId?: string | null) => {
  const uid = userId || 'anon';
  return clinicId ? `rede_leads_${uid}_${clinicId}` : `rede_leads_${uid}_default`;
};
// FIREBASE_DOC will be resolved per-clinic inside the hook when available
let DEFAULT_FIREBASE_DOC = doc(db, "crm_data", "shared");

const resolveTargetDoc = (clinicId?: string) => {
  // Use clinics/{clinicId}/shared/shared as the document path (4 segments)
  return clinicId ? doc(db, "clinics", clinicId, "shared", "shared") : DEFAULT_FIREBASE_DOC;
};

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
    "sorteio cupom": "Sorteio Cupom",
    "cupom sorteio": "Sorteio Cupom",
    "visita comercial": "Visita Comercial",
    "site": "Site",
    "indicação": "Indicação",
    "cupom indicação": "Indicação",
    "cupom indicaçao": "Indicação",
    "online": "Online",
    "influenciadora": "Influenciadora",
    "influenciador": "Influenciadora",
    "influencer": "Influenciadora",
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
  if (normalized.includes("influenc") || normalized.includes("influencer") || normalized.includes("influenciador")) return "Influenciadora";
  if (normalized.includes("cupom") && normalized.includes("sorteio")) return "Sorteio Cupom";
  if (normalized.includes("visita") && normalized.includes("comercial")) return "Visita Comercial";
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
  // use the known creation date as an estimate. Never fall back to today — that would
  // inflate the "agendamentos hoje" count for old leads that simply lack this field.
  if (out.dataAgendamento && (!out.dataAgendamentoCriado || out.dataAgendamentoCriado.trim() === "")) {
    const knownCreated = lead.dataCriacao || lead.dataContato;
    out.dataAgendamentoCriado = knownCreated || out.dataAgendamento.split(" ")[0];
  }
  return out;
};

export function useLeads() {
  const isFromFirebase = useRef(false);
  // canWriteRef espelha canWrite mas pode ser lido sincronamente dentro de callbacks async
  const canWriteRef = useRef(false);
  // Trava para bloquear gravação até doc remoto ser carregado
  const [canWrite, setCanWrite] = useState(false);
  // loading: true enquanto o primeiro getDoc ainda não resolveu
  const [loading, setLoading] = useState(true);

  // Inicializa vazio — nunca arriscamos gravar dados mock no Firestore
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filters, setFilters] = useState<ClinicFilter>({
    etapa: "Todas",
    status: "Todos",
    resposta: "Todas",
    busca: "",
  });

  // Use clinic-specific document when available. Prefer `currentClinic`,
  // but fall back to `selectedClinic` (chosen on login form) to avoid
  // race conditions while auth state resolves.
  const { currentClinic, selectedClinic, user } = useAuth();
  const userId = user?.uid || null;

  useEffect(() => {
    // flag local por run de effect — imune a async stale de runs anteriores
    let active = true;
    // Bloqueia escritas imediatamente (sincronamente) até o novo doc remoto ser confirmado
    canWriteRef.current = false;
    setCanWrite(false);
    setLoading(true);
    const effectiveClinic = currentClinic || selectedClinic || undefined;
    const targetDoc = resolveTargetDoc(effectiveClinic);
    // Sanitize clinic id for logging
    const clinicLabel = typeof effectiveClinic === 'string' ? String(effectiveClinic).replace(/[^\w\-]/g, '') : effectiveClinic;
    try { console.log(`[useLeads] resolving ${clinicLabel ? `clinics/${clinicLabel}/shared/shared` : 'crm_data/shared'} (current=${currentClinic} selected=${selectedClinic})`); } catch {}

    let unsub: () => void = () => {};

    // Pré-carrega o cache local imediatamente para evitar flash de tela vazia.
    // canWrite=false garante que não será gravado de volta no Firestore.
    if (effectiveClinic && userId) {
      try {
        const preload = localStorage.getItem(getStorageKey(effectiveClinic, userId));
        if (preload) {
          const parsed = JSON.parse(preload) as Lead[];
          const normalized = (Array.isArray(parsed) ? parsed : []).map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
          if (normalized.length > 0) setLeads(normalized);
        }
      } catch (e) {}
    }

    const init = async () => {
      try {
        // First attempt a one-time read from Firestore to prefer remote state
        const snap = await getDoc(targetDoc as any);
        if (!active) return;
        if (snap && snap.exists()) {
          let data = (snap.data() as any).leads as Lead[];
          if (data && Array.isArray(data)) {
            data = data.map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
            isFromFirebase.current = true;
            setLeads(data);
            try { localStorage.setItem(getStorageKey(effectiveClinic, userId), JSON.stringify(data)); } catch {}
          }
          // Remote doc present -> allow writes
          canWriteRef.current = true;
          setCanWrite(true);
          setLoading(false);
        } else {
          // Remote doc missing: bootstrap from localStorage if available
          try {
            const cached = localStorage.getItem(getStorageKey(effectiveClinic, userId));
            if (cached) {
              const parsed = JSON.parse(cached) as Lead[];
              const normalized = (Array.isArray(parsed) ? parsed : []).map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
              if (normalized.length > 0) {
                setLeads(normalized);
                console.log(`[useLeads] bootstrapping Firestore from local cache for clinic=${String(effectiveClinic)} (${normalized.length} leads)`);
                // Bootstrap the remote doc so future reads see fresh data
                try {
                  const payload = { leads: JSON.parse(JSON.stringify(normalized)), lastUpdated: new Date().toISOString() };
                  await setDoc(targetDoc as any, payload, { merge: true });
                  canWriteRef.current = true;
                  setCanWrite(true);
                } catch (writeErr) {
                  console.warn('[useLeads] bootstrap write failed, reads-only mode', writeErr);
                }
              } else {
                console.log(`[useLeads] clinic doc not found and local cache empty for clinic=${String(effectiveClinic)} — preserving current in-memory leads`);
              }
            } else {
              console.log(`[useLeads] clinic doc not found and no local cache for clinic=${String(effectiveClinic)} — preserving current in-memory leads`);
            }
          } catch (e) {
            console.warn('[useLeads] failed to read local cache after missing remote', e);
          }
          setLoading(false);
        }
      } catch (err) {
        // If getDoc fails (network), try local cache before giving up
        try { console.error('[useLeads] getDoc error, falling back to local cache', { effectiveClinic, clinicLabel, err }); } catch {}
        try {
          const cached = localStorage.getItem(getStorageKey(effectiveClinic, userId));
          if (cached) {
            const parsed = JSON.parse(cached) as Lead[];
            const normalized = (Array.isArray(parsed) ? parsed : []).map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
            setLeads(normalized);
            console.log(`[useLeads] used local cache after getDoc failure for clinic=${String(effectiveClinic)}`);
          }
        } catch (e) {}
        setLoading(false);
      }

      // After initial resolution, subscribe to realtime updates
      try {
        unsub = onSnapshot(targetDoc, (snapshot) => {
          if (!active) return;
          if (snapshot.exists()) {
            let data = (snapshot.data() as any).leads as Lead[];
            if (data && Array.isArray(data)) {
              data = data.map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
              isFromFirebase.current = true;
              setLeads(data);
              try { localStorage.setItem(getStorageKey(effectiveClinic, userId), JSON.stringify(data)); } catch {}
            }
            // Remote doc present -> allow writes
            canWriteRef.current = true;
            setCanWrite(true);
          } else {
            try {
              // Remote doc deleted/missing — DO NOT clear local in-memory leads automatically.
              console.log(`[useLeads] clinic doc not found on snapshot -> leaving in-memory leads intact for clinic=${String(effectiveClinic)}`);
            } catch {}
            // Block writes until a remote doc appears
            canWriteRef.current = false;
            setCanWrite(false);
          }
        }, (err) => {
          try { console.error('[useLeads] onSnapshot error', { effectiveClinic, clinicLabel, err }); } catch (e) { console.error('[useLeads] onSnapshot error (fallback)', err); }
        });
      } catch (e) {
        try { console.error('[useLeads] failed to start onSnapshot', e); } catch {}
      }
    };

    init();

    return () => {
      active = false;
      try { unsub(); } catch {}
    };
  }, [currentClinic, selectedClinic]);

  // Salvar no Firebase + localStorage quando leads mudarem (com debounce)
  useEffect(() => {
    // Se a mudança veio do Firebase, não salva de volta (evita loop)
    if (isFromFirebase.current) {
      isFromFirebase.current = false;
      return;
    }
    // Não grava se não pode gravar (trava de segurança)
    if (!canWrite) return;
    // Salva localmente imediatamente (por clínica e usuário)
    try { localStorage.setItem(getStorageKey(currentClinic || selectedClinic, userId), JSON.stringify(leads)); } catch {}
    // Salva no Firebase com debounce de 3s, normalizando fontes e garantindo dataCriacao
    const timer = setTimeout(async () => {
      try {
        // Verificação dupla dentro do callback async — previne escritas obsoletas
        // caso a clínica tenha mudado entre o agendamento e a execução do timeout
        if (!canWriteRef.current) return;
        // Não sobrescreve Firestore com array vazio automaticamente!
        if (!leads || leads.length === 0) return;
        const normalizedLeads = leads.map((l: Lead) => ensureDateCriacao(normalizeLead(l)));
        const effectiveClinic = currentClinic || selectedClinic || undefined;
        const targetDoc = resolveTargetDoc(effectiveClinic);
        // Sanitize payload to remove undefined fields (Firestore rejects undefined)
        const payload = {
          leads: normalizedLeads,
          lastUpdated: new Date().toISOString(),
        };
        const sanitized = JSON.parse(JSON.stringify(payload));
        const withWriter = attachLastWriter(sanitized, userId ?? null);
        await setDoc(targetDoc, withWriter, { merge: true });
      } catch (error) {
        // Falha silenciosa — dados ainda estão no localStorage
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [leads, canWrite, currentClinic, selectedClinic, userId]);

  const filteredLeads = useMemo(() => { return leads; }, [leads, filters]);

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

  const exportWeeklyAppointmentsXlsx = async (date: Date = new Date()) => {
    // Calcular início e fim da semana (domingo a sábado)
    const dayOfWeek = date.getDay();
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Leads criados na semana
    const leadsCriadosSemana = leads.filter(l => {
      if (l.etapaLead === "Fora da região") return false;
      if (!l.dataCriacao) return false;
      const parts = l.dataCriacao.split('/');
      if (parts.length !== 3) return false;
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      return d >= startOfWeek && d <= endOfWeek;
    });

    // Agendamentos realizados na semana (dataAgendamentoCriado)
    const agendamentosSemana = leads.filter(l => {
      if (l.etapaLead === "Fora da região") return false;
      if (!l.dataAgendamentoCriado) return false;
      const parts = l.dataAgendamentoCriado.split('/');
      if (parts.length !== 3) return false;
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      return d >= startOfWeek && d <= endOfWeek;
    });

    // Agendados Novos/Recuperados
    let agendadosNovos = 0;
    let agendadosRecuperados = 0;
    agendamentosSemana.forEach(l => {
      if (l.dataCriacao === l.dataAgendamentoCriado) agendadosNovos++;
      else agendadosRecuperados++;
    });

    // Comparecimentos dos agendamentos da semana
    const comparecimentos = agendamentosSemana.filter(l => l.comparecimento === "COMPARECEU");

    // Porcentagem de agendamentos: (Total Agendamentos / Leads Criados na semana) × 100
    const totalAgendamentos = agendamentosSemana.length;
    const taxaAgendamentos = leadsCriadosSemana.length > 0 ? ((totalAgendamentos / leadsCriadosSemana.length) * 100).toFixed(1) : "0.0";
    const taxaComparecimento = totalAgendamentos > 0 ? ((comparecimentos.length / totalAgendamentos) * 100).toFixed(1) : "0.0";

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

    const now = new Date();
    const generatedAt = `${format(now, "dd/MM/yyyy")} ${format(now, "HH:mm")}`;

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
    addInfoRow("LEADS CRIADOS", leadsCriadosSemana.length);
    addInfoRow("TOTAL AGENDAMENTOS", `${totalAgendamentos} (${taxaAgendamentos}%)`);
    addInfoRow("AGENDADOS NOVOS", agendadosNovos);
    addInfoRow("AGENDADOS RECUPERADOS", agendadosRecuperados);
    addInfoRow("COMPARECIMENTOS", `${comparecimentos.length} (${taxaComparecimento}%)`);
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

  const exportFilteredAppointmentsXlsx = async (startDate: Date, endDate: Date) => {
    // Filtrar agendamentos no período
    const agendamentosPeríodo = leads.filter(l => {
      if (l.etapaLead === "Fora da região") return false;
      if (!l.dataAgendamento) return false;
      
      const [datePart] = l.dataAgendamento.split(" ");
      if (!datePart) return false;
      
      const [d, m, y] = datePart.split("/");
      const leadDateISO = `${y}-${m}-${d}`;
      const startISO = format(startDate, "yyyy-MM-dd");
      const endISO = format(endDate, "yyyy-MM-dd");
      
      return leadDateISO >= startISO && leadDateISO <= endISO;
    }).sort((a, b) => {
      const [dateA, timeA] = a.dataAgendamento.split(" ");
      const [dateB, timeB] = b.dataAgendamento.split(" ");
      
      const [dA, mA, yA] = dateA.split("/");
      const [dB, mB, yB] = dateB.split("/");
      const isoA = `${yA}-${mA}-${dA}`;
      const isoB = `${yB}-${mB}-${dB}`;
      
      const dateComp = isoA.localeCompare(isoB);
      if (dateComp !== 0) return dateComp;
      
      return (timeA || "00:00").localeCompare(timeB || "00:00");
    });

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Agendamentos");

    ws.columns = [
      { width: 30 },
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 18 },
    ];

    const headerRow = ws.addRow(["NOME", "DATA", "DIA", "HORÁRIO", "COMPARECIMENTO"]);
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8B8B8" } };
    });

    agendamentosPeríodo.forEach(l => {
      const [datePart, timePart] = l.dataAgendamento.split(" ");
      const [d, m, y] = datePart.split("/");
      const leadDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
      const dayName = dayNames[leadDate.getDay()];
      
      const comparecimento = l.comparecimento || "Pendente";
      const comparecimentoColor = l.comparecimento === "COMPARECEU" ? "FFC6EFCE" : l.comparecimento === "NÃO COMPARECEU" ? "FFFFC7CE" : "FFFFFF";
      
      const row = ws.addRow([
        l.nome,
        datePart,
        dayName,
        timePart || "—",
        comparecimento,
      ]);
      
      row.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: comparecimentoColor } };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rede_Leads_Agendamentos_${format(startDate, "yyyy-MM-dd")}_a_${format(endDate, "yyyy-MM-dd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDailyReport = async (date: Date = new Date()) => {
    const ExcelJS = (await import("exceljs")).default;
    const formatted = format(date, "dd/MM/yyyy");

    const newLeads = leads.filter(l => {
      if (l.etapaLead === "Fora da região") return false;
      const dc = l.dataContato || "";
      return dc.startsWith(formatted);
    });
    // Count follow-ups either by scheduled follow-up date (`dataFollowUp`) OR
    // by the date the follow-up was actually done (`lastFollowUpDone`). This
    // ensures registered calls that set `lastFollowUpDone` are included in
    // the daily report.
    const followUpsDone = leads.filter(l => {
      if (l.etapaLead === "Fora da região") return false;
      const df = l.dataFollowUp || "";
      const last = l.lastFollowUpDone || "";
      return df.startsWith(formatted) || last.startsWith(formatted);
    });
    // Agendamentos feitos: contar agendamentos CRIADOS na UI hoje (dataAgendamentoCriado)
    const appointmentsMade = leads.filter(l => {
      if (l.etapaLead === "Fora da região") return false;
      const dac = l.dataAgendamentoCriado || "";
      return dac.startsWith(formatted);
    });

    // Reagendamentos: contar alterações de agendamento feitas nesse dia (dataAgendamentoAlterado)
    const reschedulesMade = leads.filter(l => {
      if (l.etapaLead === "Fora da região") return false;
      const daa = l.dataAgendamentoAlterado || "";
      return daa.startsWith(formatted);
    });

    // Deduplicar: cada lead aparece uma vez; prioridade = agendamento > reagendamento > followup > novo
    const appointmentIds = new Set(appointmentsMade.map(l => l.id));
    const rescheduleIds = new Set(reschedulesMade.map(l => l.id));
    const newLeadIds = new Set(newLeads.map(l => l.id));
    const followUpIds = new Set(followUpsDone.map(l => l.id));

    const seen = new Set<string>();
    const allDetails: Lead[] = [];
    // Counters with deduplication by priority (appointment > reschedule > follow-up > new)
    let dedupAppointments = 0;
    let dedupReschedules = 0;
    let dedupFollowUps = 0;
    let dedupNewLeads = 0;

    for (const l of [...appointmentsMade, ...reschedulesMade, ...followUpsDone, ...newLeads]) {
      const id = l.id || '';
      if (!seen.has(id)) {
        seen.add(id);
        allDetails.push(l);
        if (appointmentIds.has(id)) dedupAppointments++;
        else if (rescheduleIds.has(id)) dedupReschedules++;
        else if (followUpIds.has(id)) dedupFollowUps++;
        else if (newLeadIds.has(id)) dedupNewLeads++;
      }
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
    // Use deduplicated counts so each lead is counted once according to priority
    addInfoRow("ATENDIMENTOS", allDetails.length);
    addInfoRow("AGENDAMENTOS FEITOS", dedupAppointments);
    addInfoRow("REAGENDAMENTOS", dedupReschedules);
    addInfoRow("FOLLOW-UPS REALIZADOS", dedupFollowUps);
    addInfoRow("ENTRADA DE LEADS", dedupNewLeads);
    ws.addRow([]);
    addInfoRow("===== DETALHAMENTO =====");
    ws.addRow([]);

    const appointmentIdsDetail = new Set(appointmentsMade.map(l => l.id));

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
      if (appointmentIdsDetail.has(l.id)) {
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

    // Leads criados na semana
    const leadsCriadosSemana = leads.filter(l => {
      if (l.etapaLead === "Fora da região") return false;
      if (!l.dataCriacao) return false;
      const parts = l.dataCriacao.split('/');
      if (parts.length !== 3) return false;
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      return d >= startOfWeek && d <= endOfWeek;
    });

    // Agendamentos realizados na semana (dataAgendamentoCriado)
    const agendamentosSemana = leads.filter(l => {
      if (l.etapaLead === "Fora da região") return false;
      if (!l.dataAgendamentoCriado) return false;
      const parts = l.dataAgendamentoCriado.split('/');
      if (parts.length !== 3) return false;
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      return d >= startOfWeek && d <= endOfWeek;
    });

    // Agendados Novos/Recuperados
    let agendadosNovos = 0;
    let agendadosRecuperados = 0;
    agendamentosSemana.forEach(l => {
      if (l.dataCriacao === l.dataAgendamentoCriado) agendadosNovos++;
      else agendadosRecuperados++;
    });

    // Comparecimentos dos agendamentos da semana
    const comparecimentos = agendamentosSemana.filter(l => l.comparecimento === "COMPARECEU");

    // Porcentagem de agendamentos: (Total Agendamentos / Leads Criados na semana) × 100
    const totalAgendamentos = agendamentosSemana.length;
    const taxaAgendamentos = leadsCriadosSemana.length > 0 ? ((totalAgendamentos / leadsCriadosSemana.length) * 100).toFixed(1) : "0.0";
    const taxaComparecimento = totalAgendamentos > 0 ? ((comparecimentos.length / totalAgendamentos) * 100).toFixed(1) : "0.0";

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
    addInfoRow("LEADS CRIADOS", leadsCriadosSemana.length);
    addInfoRow("TOTAL AGENDAMENTOS", `${totalAgendamentos} (${taxaAgendamentos}%)`);
    addInfoRow("AGENDADOS NOVOS", agendadosNovos);
    addInfoRow("AGENDADOS RECUPERADOS", agendadosRecuperados);
    addInfoRow("COMPARECIMENTOS", `${comparecimentos.length} (${taxaComparecimento}%)`);
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

  const exportRangeReport = async (startDate: Date, endDate: Date, leadsParam?: Lead[]) => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    // Use provided leads array when given (e.g., filtered view), otherwise use full leads
    const source = (leadsParam || leads).filter((l) => !(l as any)._deleted && l.etapaLead !== "Fora da região");

    // Filtrar agendamentos no período (inclusivo)
    const appts = source.filter(l => {
      if (!l.dataAgendamento) return false;
      const parts = l.dataAgendamento.split('/');
      if (parts.length < 3) return false;
      const [day, month, yearAndRest] = parts;
      const year = yearAndRest.split(' ')[0];
      const agDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return agDate >= start && agDate <= end;
    });

    const comparecimentos = appts.filter(l => l.comparecimento === "COMPARECEU");
    const agendadosPeriodo = appts.length;

    const leadsCriadosPeriodo = source.filter(l => {
      if (!l.dataCriacao) return false;
      const parts = l.dataCriacao.split('/');
      if (parts.length !== 3) return false;
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      return d >= start && d <= end;
    }).length;

    const taxaComparecimento = agendadosPeriodo > 0
      ? ((comparecimentos.length / agendadosPeriodo) * 100).toFixed(1)
      : "0.0";
    const pctAgendamentos = leadsCriadosPeriodo > 0
      ? ((agendadosPeriodo / leadsCriadosPeriodo) * 100).toFixed(1)
      : "0.0";

    const now = new Date();
    const generatedAt = `${format(now, "dd/MM/yyyy")} ${format(now, "HH:mm")}`;

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Relatório Período");

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
    addInfoRow("AGENDAMENTOS - RELATÓRIO POR PERÍODO");
    ws.getRow(ws.rowCount).getCell(1).font = { bold: true, size: 12 };
    addInfoRow("Período", `${format(start, "dd/MM/yyyy")} a ${format(end, "dd/MM/yyyy")}`);
    addInfoRow("Gerado em", generatedAt);
    ws.addRow(["=========================================="]);
    ws.addRow([]);
    addInfoRow("RESUMO");
    addInfoRow("LEADS CRIADOS", leadsCriadosPeriodo);
    addInfoRow("AGENDADOS NO PERÍODO", `${agendadosPeriodo} (${pctAgendamentos}%)`);
    addInfoRow("COMPARECIMENTOS", `${comparecimentos.length} (${taxaComparecimento}%)`);
    ws.addRow([]);
    addInfoRow("===== DETALHAMENTO DOS AGENDAMENTOS =====");
    ws.addRow([]);

    const headerRow = ws.addRow(["NOME", "TELEFONE", "SERVIÇO", "DATA AGENDAMENTO", "FONTE", "OBSERVAÇÃO"]);
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB8B8B8" } };
    });

    appts.forEach(l => {
      const row = ws.addRow([
        l.nome,
        l.telefone,
        l.servicoProcurado,
        l.dataAgendamento,
        l.fonteLead,
        l.observacao || "",
      ]);
      if (l.comparecimento === "COMPARECEU") {
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
    // Build clinic label similar to CSV export
    const sanitize = (s?: string | null) => {
      if (!s) return "Clinic";
      try {
        return String(s)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, "_")
          .replace(/[^\w\-]/g, "");
      } catch {
        return String(s).replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
      }
    };
    const clinicNameRaw = (currentClinic || selectedClinic || 'Clinic');
    const clinicLabel = sanitize(clinicNameRaw as any);
    a.download = `${clinicLabel}_Agendamentos_Periodo_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = (leadsParam?: Lead[]) => {
    const source = (leadsParam || leads).filter(l => l.etapaLead !== "Fora da região");
    const formatPhoneBR = (raw: string) => {
      if (!raw) return "";
      const nums = String(raw).replace(/\D/g, "");
      if (nums.length === 11) {
        // (AA) 9XXXX-XXXX
        return `(${nums.slice(0,2)}) ${nums.slice(2,7)}-${nums.slice(7)}`;
      }
      if (nums.length === 10) {
        // (AA) XXXX-XXXX
        return `(${nums.slice(0,2)}) ${nums.slice(2,6)}-${nums.slice(6)}`;
      }
      // fallback: try grouping last 4 digits
      if (nums.length > 4) {
        return `${nums.slice(0, nums.length-4)}-${nums.slice(-4)}`;
      }
      return nums;
    };

    const data = source.map((l) => ({
      "NOME DO LEAD": l.nome,
      "TELEFONE": formatPhoneBR(l.telefone),
      "SERVIÇO PROCURADO": l.servicoProcurado,
      "FONTE DO LEAD": l.fonteLead,
      "ETAPA DO LEAD": l.etapaLead,
      "STATUS": l.status,
      "COMPARECIMENTO": l.comparecimento,
      "DATA DE AGENDAMENTO": l.dataAgendamento,
    }));
    const csv = Papa.unparse(data, { delimiter: ";" });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Build filename: <ClinicName>_Agendamentos_yyyy-mm-dd.csv
    const sanitize = (s?: string | null) => {
      if (!s) return "Clinic";
      try {
        return String(s)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, "_")
          .replace(/[^\w\-]/g, "");
      } catch {
        return String(s).replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
      }
    };
    const clinicNameRaw = (currentClinic || selectedClinic || 'Clinic');
    const clinicLabel = sanitize(clinicNameRaw);
    const filename = `${clinicLabel}_Agendamentos_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.download = filename;
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
    // Soft-delete: mark leads with `_deleted`, record metadata for auditing
    const by = user?.email || user?.uid || 'unknown';
    const at = new Date().toISOString();
    setLeads((prev) => prev.map((lead) => {
      if (leadIds.includes(lead.id)) {
        return { ...lead, _deleted: true, deletedAt: at, deletedBy: by } as Lead & any;
      }
      return lead;
    }));
  };

  // Deletar um único lead (para botão de lixeira rápido)
  const deleteLead = (leadId: string) => {
    deleteLeads([leadId]);
  };

  const clearAllLeads = () => {
    // Soft-delete all leads (keep data for audit/restore)
    const by = user?.email || user?.uid || 'unknown';
    const at = new Date().toISOString();
    setLeads((prev) => prev.map((lead) => ({ ...lead, _deleted: true, deletedAt: at, deletedBy: by } as Lead & any)));
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

  const stats: DashboardStats = useMemo(() => {
    const activeLeads = leads.filter(l => !(l as any)._deleted);
    const totalLeads = activeLeads.length;
    const quentes = activeLeads.filter(l => l.status === 'QUENTE').length;
    const mornos = activeLeads.filter(l => l.status === 'MORNO').length;
    const frios = activeLeads.filter(l => l.status === 'FRIO').length;
    const agendados = activeLeads.filter(l => l.dataAgendamento && l.dataAgendamento.trim() !== '').length;
    const reagendamentosHoje = activeLeads.filter(l => l.dataAgendamentoAlterado && l.dataAgendamentoAlterado.startsWith(format(new Date(), 'dd/MM/yyyy'))).length;
    const followUpsPendentes = activeLeads.filter(l => l.dataFollowUp && l.dataFollowUp.trim() !== '').length;
    const followUpsOverdue = activeLeads.filter(l => {
      if (!l.dataFollowUp) return false;
      const parts = l.dataFollowUp.split('/');
      if (parts.length < 3) return false;
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      d.setHours(0,0,0,0);
      const today = new Date(); today.setHours(0,0,0,0);
      return d < today;
    }).length;
    const compareceram = activeLeads.filter(l => l.comparecimento === 'COMPARECEU').length;
    const lembretesPendentes = activeLeads.filter(l => l.lembretes && !(l.lembretes.h24 && l.lembretes.today)).length;

    return {
      totalLeads,
      quentes,
      mornos,
      frios,
      agendados,
      reagendamentosHoje,
      followUpsPendentes,
      followUpsOverdue,
      compareceram,
      lembretesPendentes,
    };
  }, [leads]);

  // Fila de retornos de ligação: leads com dataRetornoLigacao definida e não deletados
  const callReturnQueue = useMemo(
    () => leads.filter(l => l.dataRetornoLigacao && !(l as any)._deleted),
    [leads]
  );

  // Fila de follow-ups pendentes: só leads com dataFollowUp <= hoje (vencidos ou no prazo)
  const followUpQueue = useMemo(() => {
    const todayStr = format(new Date(), "dd/MM/yyyy");
    const [td, tm, ty] = todayStr.split('/').map(Number);
    const todayMs = new Date(ty, tm - 1, td).setHours(0, 0, 0, 0);
    const finalStages = ["FINALIZADO", "FINALIZADA", "DESISTÊNCIA", "DESISTENCIA", "FORA DA REGIÃO", "FORA DA REGIAO"];
    
    return leads.filter(l => {
      if ((l as any)._deleted) return false;
      // Sempre inclui se foi feito hoje (para aparecer na aba "Feitos Hoje")
      if (l.lastFollowUpDone === todayStr) return true;
      // Leads com agendamento mas sem comparecimento marcado devem aparecer na fila
      if (l.dataAgendamento && !l.comparecimento) return true;
      // Se está finalizado/desistência/fora região → não aparece
      if (finalStages.includes((l.etapaLead || '').toUpperCase())) return false;
      // Se não tem dataFollowUp mas tbm não está finalizado → aparece (assegura que novos leads apareçam)
      if (!l.dataFollowUp) return true;
      const parts = l.dataFollowUp.split('/');
      if (parts.length < 3) return true; // Se formato inválido, inclui para segurança
      const dueDateMs = new Date(+parts[2], +parts[1] - 1, +parts[0]).setHours(0, 0, 0, 0);
      return dueDateMs <= todayMs;
    });
  }, [leads]);

  // Fila de lembretes pendentes: leads com lembretes não enviados
  const reminderQueue = useMemo(
    () => leads.filter(l => l.lembretes && (!l.lembretes.h24 || !l.lembretes.today) && !l._deleted),
    [leads]
  );

  // Quantidade de follow-ups feitos hoje
  const followUpsDoneToday = useMemo(() => {
    const today = format(new Date(), "dd/MM/yyyy");
    return leads.filter(l => l.lastFollowUpDone === today && !l._deleted).length;
  }, [leads]);

  // Calcula próximo dia útil (pula sábado e domingo)
  const calcNextFollowUpDate = (followUpCount: number): string => {
    const daysToAdd = followUpCount >= 5 ? 2 : 1;
    let next = addDays(new Date(), daysToAdd);
    const dow = next.getDay();
    if (dow === 6) next = addDays(next, 2);
    else if (dow === 0) next = addDays(next, 1);
    return format(next, "dd/MM/yyyy");
  };

  // Calcular próxima etapa automática (progressão linear)
  const getNextLeadStage = (currentStage?: string): LeadStage => {
    const stageProgression: LeadStage[] = [
      "Novo",
      "Em contato",
      "Follow-Up 1",
      "Follow-Up 2",
      "Follow-Up 3",
      "Follow-Up 4",
      "Follow-Up 5",
      "Follow-Up 6",
      "Follow-Up 7",
      "Follow-Up 8",
      "Follow-Up 9",
      "Follow-Up 10",
      "Follow-Up 11",
      "Follow-Up 12",
      "Avaliação agendada",
    ];
    // Se final (Finalizado, Desistência, Fora da região), não muda
    const finalStages: LeadStage[] = ["Finalizado", "Desistência", "Fora da região"];
    if (currentStage && finalStages.includes(currentStage as LeadStage)) {
      return currentStage as LeadStage;
    }
    // Normalize currentStage: replace spaces with hyphens in "Follow-Up" stages
    const normalized = currentStage ? currentStage.replace(/Follow Up/g, "Follow-Up") : "";
    const currentIdx = stageProgression.findIndex(s => s === normalized);
    if (currentIdx === -1) return "Novo"; // Default
    // Avança para próxima, ou fica na última se já está
    const nextIdx = Math.min(currentIdx + 1, stageProgression.length - 1);
    return stageProgression[nextIdx];
  };

  // Função para registrar follow-up
  const sendFollowUp = (leadId: string, observacao: string = "", nextStage?: LeadStage) => {
    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l;
      const newCount = (l.followUpCount || 0) + 1;
      // Use provided stage or auto-calculate next
      const stageToUse = nextStage || getNextLeadStage(l.etapaLead);
      return {
        ...l,
        lastFollowUpDone: format(new Date(), "dd/MM/yyyy"),
        observacao,
        followUpCount: newCount,
        dataFollowUp: calcNextFollowUpDate(newCount),
        etapaLead: stageToUse,
      };
    }));

    // Registrar na timeline
    const clinicId = currentClinic || selectedClinic;
    if (clinicId) {
      const lead = leads.find(l => l.id === leadId);
      const stageToUse = nextStage || getNextLeadStage(lead?.etapaLead || "Novo");
      saveTimelineActivity(
        clinicId,
        leadId,
        "FOLLOW_UP",
        { etapa: stageToUse, observacao },
        userId
      );
    }
  };

  // Função para marcar lembrete
  const markReminder = (leadId: string, type: "h24" | "today") => {
    setLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, lembretes: { ...l.lembretes, [type]: true } } : l
    ));
  };

  // Função para atualizar lead
  const updateLead = (leadId: string, updates: Partial<Lead>) => {
    // Whenever dataAgendamento is set or changed, automatically reset comparecimento to "AGUARDANDO DATA"
    // unless the caller is explicitly providing a comparecimento value in the same update
    const finalUpdates: Partial<Lead> = { ...updates };
    if ("dataAgendamento" in updates && updates.dataAgendamento && !("comparecimento" in updates)) {
      finalUpdates.comparecimento = "AGUARDANDO DATA";
    }
    
    // Update local state immediately (hook will sync to Firestore via debounce)
    setLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, ...finalUpdates } : l
    ));

    // Registrar agendamento/reagendamento na timeline
    const clinicId = currentClinic || selectedClinic;
    if (clinicId && "dataAgendamento" in updates && updates.dataAgendamento) {
      const leadToUpdate = leads.find(l => l.id === leadId);
      const isReschedule = !!leadToUpdate?.dataAgendamento && leadToUpdate.dataAgendamento !== updates.dataAgendamento;
      const timelineData: any = {
        dataAgendamento: updates.dataAgendamento,
      };
      const briefingValue = (updates as any).briefingRecepcao || leadToUpdate?.briefingRecepcao;
      if (briefingValue) {
        timelineData.briefing = briefingValue;
      }
      saveTimelineActivity(
        clinicId,
        leadId,
        isReschedule ? "APPOINTMENT_EDIT" : "APPOINTMENT",
        timelineData,
        userId
      );
    }

    // Registrar não-comparecimento na timeline
    if (clinicId && "comparecimento" in updates && updates.comparecimento === "NÃO COMPARECEU") {
      saveTimelineActivity(clinicId, leadId, "NO_SHOW", {}, userId);
    }
  };

  // Função para criar lead
  const createLead = (lead: Omit<Lead, 'id'>) => {
    const newLead: Lead = { ...lead, id: `lead_${Date.now()}` };
    setLeads(prev => [newLead, ...prev]);
    return newLead;
  };

  // Função para limpar retorno de ligação
  const clearCallReturn = (leadId: string) => {
    setLeads(prev => prev.map(l =>
      l.id === leadId ? { ...l, dataRetornoLigacao: "" } : l
    ));
  };

  // Função para registrar ligação — funciona igual a sendFollowUp + salva resultado
  const registerCall = (leadId: string, outcome: string, obs: string, returnDate?: string, nextStage?: LeadStage) => {
    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l;
      const timestamp = format(new Date(), "dd/MM/yyyy HH:mm");
      const entry = `[${timestamp}] ${outcome}${obs ? ` — ${obs}` : ""}`;
      const newObs = l.observacao ? `${l.observacao} | ${entry}` : entry;
      const newCount = (l.followUpCount || 0) + 1;
      const stageToUse = nextStage || getNextLeadStage(l.etapaLead);
      return {
        ...l,
        observacao: newObs,
        dataRetornoLigacao: returnDate || "",
        lastFollowUpDone: format(new Date(), "dd/MM/yyyy"),
        followUpCount: newCount,
        dataFollowUp: calcNextFollowUpDate(newCount),
        etapaLead: stageToUse,
      };
    }));

    // Registrar na timeline
    const clinicId = currentClinic || selectedClinic;
    if (clinicId) {
      const lead = leads.find(l => l.id === leadId);
      const timelineData: any = {
        resultado: outcome,
      };
      if (obs) timelineData.observacao = obs;
      if (lead?.status) timelineData.statusLead = lead.status;
      if (returnDate) timelineData.retornoAgendado = returnDate;
      saveTimelineActivity(
        clinicId,
        leadId,
        "CALL_LOG",
        timelineData,
        userId
      );
    }
  };

  // ── Auto-promote leads in "Avaliação agendada" whose appointment date has passed ──
  useEffect(() => {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const toPromote = leads.filter(l => {
      if (l.etapaLead !== "Avaliação agendada") return false;
      if (!l.dataAgendamento) return false;
      if (l.comparecimento === "COMPARECEU") return false;
      // Parse "dd/MM/yyyy HH:mm" → get the date part
      const datePart = l.dataAgendamento.split(" ")[0];
      const parts = datePart.split("/");
      if (parts.length < 3) return false;
      const apptDate = new Date(+parts[2], +parts[1] - 1, +parts[0]);
      apptDate.setHours(0, 0, 0, 0);
      return todayDate > apptDate;
    });

    if (toPromote.length === 0) return;

    const todayStr = format(todayDate, "dd/MM/yyyy");

    setLeads(prev => prev.map(l => {
      const lead = toPromote.find(tp => tp.id === l.id);
      if (!lead) return l;
      const nextCount = (l.followUpCount || 0) + 1;
      const nextStage = `Follow-Up ${Math.min(nextCount, 12)}` as LeadStage;
      return {
        ...l,
        etapaLead: nextStage,
        followUpCount: nextCount,
        lastFollowUpDone: todayStr,
        dataFollowUp: calcNextFollowUpDate(nextCount),
      };
    }));

    // Sync each promoted lead to Firestore
    toPromote.forEach(lead => {
      const nextCount = (lead.followUpCount || 0) + 1;
      const nextStage = `Follow-Up ${Math.min(nextCount, 12)}` as LeadStage;
      const updated = {
        ...lead,
        etapaLead: nextStage,
        followUpCount: nextCount,
        lastFollowUpDone: todayStr,
        dataFollowUp: calcNextFollowUpDate(nextCount),
      };
      saveLeadWithSync(db, updated, { previousPhone: lead.telefone })
        .catch(err => console.error("Erro ao auto-promover lead:", err));
    });
  }, [leads]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    leads: filteredLeads,
    allLeads: leads,
    loading,
    filters,
    setFilters,
    stats,
    followUpGoal: 20, // Meta diária
    exportCSV,
    importCSV,
    getAppointmentsFor,
    exportAppointments,
    exportDailyReport,
    exportWeeklyReport,
    exportRangeReport,
    exportWeeklyAppointments,
    exportWeeklyAppointmentsXlsx,
    exportFilteredAppointmentsXlsx,
    deleteLeads,
    deleteLead,
    clearAllLeads,
    clearDuplicates,
    callReturnQueue,
    followUpQueue,
    reminderQueue,
    followUpsDoneToday,
    sendFollowUp,
    getNextLeadStage,
    markReminder,
    updateLead,
    createLead,
    clearCallReturn,
    registerCall,
  };

  }

