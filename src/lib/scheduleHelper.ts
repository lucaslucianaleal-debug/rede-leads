import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, updateDoc, setDoc, arrayUnion } from "firebase/firestore";
import { format } from "date-fns";

export interface SlotInfo {
  date: Date;
  hour: number;
  minute: number;
  dateStr: string;  // "dd/MM/yyyy HH:mm"
  dayLabel: string; // "Quarta, 23/04"
  hourLabel: string; // "9h" ou "9h30"
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const CLAREAMENTO_VOUCHER = "1 Sessão de Clareamento (arcada inferior)";


// Lista de feriados nacionais fixos (dd/MM)
const FERIADOS_FIXOS = [
  "01/01", // Confraternização Universal
  "21/04", // Tiradentes
  "01/05", // Dia do Trabalho
  "07/09", // Independência
  "12/10", // Nossa Senhora Aparecida
  "02/11", // Finados
  "15/11", // Proclamação da República
  "25/12", // Natal
];

function isFeriado(date: Date): boolean {
  const ddmm = format(date, "dd/MM");
  return FERIADOS_FIXOS.includes(ddmm);
}

// Returns half-hour slots for a given day-of-week
function getWorkingSlots(dow: number): { h: number; m: number }[] {
  if (dow === 0) return []; // domingo
  
  if (dow === 6) {
    // Sábado: 8h às 13h (último slot 12h30)
    const hours = [8, 9, 10, 11, 12];
    const slots: { h: number; m: number }[] = [];
    for (const h of hours) {
      slots.push({ h, m: 0 });
      slots.push({ h, m: 30 });
    }
    return slots;
  }
  
  // Seg-Sex: apenas 8:30, 9:30, 10:30, 11:30, 12:30, 13:30, 14:30, 15:30, 16:30, 17:30, 18:30
  return [
    { h: 8, m: 30 },
    { h: 9, m: 30 },
    { h: 10, m: 30 },
    { h: 11, m: 30 },
    { h: 12, m: 30 },
    { h: 13, m: 30 },
    { h: 14, m: 30 },
    { h: 15, m: 30 },
    { h: 16, m: 30 },
    { h: 17, m: 30 },
    { h: 18, m: 30 },
  ];
}

// Returns full-hour slots for VisitaComercial (external visits)
function getWorkingSlotsForVisita(dow: number): { h: number; m: number }[] {
  if (dow === 0) return []; // domingo
  
  if (dow === 6) {
    // Sábado: apenas 10h e 11h
    return [
      { h: 10, m: 0 },
      { h: 11, m: 0 },
    ];
  }
  
  // Seg-Sex: apenas 10, 11, 14, 15, 16, 17, 18 (pula 12-13 almoço)
  return [
    { h: 10, m: 0 },
    { h: 11, m: 0 },
    { h: 14, m: 0 },
    { h: 15, m: 0 },
    { h: 16, m: 0 },
    { h: 17, m: 0 },
    { h: 18, m: 0 },
  ];
}

function slotKey(dateStr: string, h: number, m: number): string {
  // Zero-pad hours to match CRM format ("09:00" not "9:00")
  return `${dateStr} ${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`;
}

export async function getAvailableSlots(clinicId: string): Promise<SlotInfo[]> {
  // 1. Lê cupons agendados pelas captadoras (coleção cupons)
  const cuponRef = collection(db, "clinics", clinicId, "cupons");
  const cuponSnap = await getDocs(query(cuponRef, where("status", "==", "agendado")));

  // 2. Lê leads já agendados no CRM (shared/shared)
  const sharedRef = doc(db, "clinics", clinicId, "shared", "shared");
  const sharedSnap = await getDoc(sharedRef);
  const rawLeads = sharedSnap.exists() ? (sharedSnap.data()?.leads ?? null) : null;
  // Defensive: Firestore might return an object keyed by index instead of a real array
  const crmLeads: any[] = Array.isArray(rawLeads)
    ? rawLeads
    : rawLeads && typeof rawLeads === "object"
    ? Object.values(rawLeads)
    : [];
  // --- DEBUG (check browser console when opening booking modal) ---
  console.group(`[scheduleHelper] getAvailableSlots clinic=${clinicId}`);
  console.log("shared/shared exists:", sharedSnap.exists());
  console.log("raw leads type:", Array.isArray(rawLeads) ? "array" : typeof rawLeads, "| count:", crmLeads.length);
  const leadsComAgendamento = crmLeads.filter((l) => l?.dataAgendamento && l.dataAgendamento.includes("/"));
  console.log("leads com dataAgendamento:", leadsComAgendamento.map((l) => `${l.nome ?? "?"}: ${l.dataAgendamento}`));
  console.groupEnd();

  // Build set of occupied slots
  const occupied = new Set<string>();

  const addOccupied = (dataAgendamento: string, vouchers?: string[]) => {
    const parts = dataAgendamento.split(" ");
    if (parts.length < 2) return;
    const dateStr = parts[0];
    const [hStr, mStr] = parts[1].split(":");
    const h = parseInt(hStr);
    const m = parseInt(mStr) || 0;
    occupied.add(slotKey(dateStr, h, m));
    // Clareamento = 1h → bloqueia slot seguinte também
    const isClareamento = vouchers?.some((v) => v.toLowerCase().includes("clareamento"))
      || false;
    if (isClareamento) {
      const nextM = m === 0 ? 30 : 0;
      const nextH = m === 0 ? h : h + 1;
      occupied.add(slotKey(dateStr, nextH, nextM));
    }
  };

  // Dos cupons (captadoras na rua)
  cuponSnap.forEach((d) => {
    const data = d.data();
    if (data.dataAgendamento) addOccupied(data.dataAgendamento, data.vouchers);
  });

  // Dos leads do CRM
  for (const lead of crmLeads) {
    if (!lead || lead._deleted) continue;
    if (lead.dataAgendamento) {
      // CRM usa servicoProcurado em vez de vouchers
      const vouchers = lead.servicoProcurado
        ? [lead.servicoProcurado]
        : [];
      addOccupied(lead.dataAgendamento, vouchers);
    }
  }

  const slots: SlotInfo[] = [];
  // Começa de hoje, filtrando slots que já passaram (+ 1h de buffer)
  const now = new Date();
  const minTime = now.getTime() + 60 * 60 * 1000; // pelo menos 1h a partir de agora
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0); // início do dia de hoje


  // Itera 10 dias corridos a partir de hoje, pulando feriados e o dia atual
  for (let day = 0; day < 10; day++) {
    const dow = cursor.getDay();
    const isHoje = day === 0;
    const isFds = dow === 0;
    if (isHoje || isFeriado(cursor)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    const workSlots = getWorkingSlots(dow);
    const dateStr = format(cursor, "dd/MM/yyyy");
    const dayLabel = `${DAY_NAMES[dow]}, ${dateStr.slice(0, 5)}`;

    for (const { h, m } of workSlots) {
      const slotDate = new Date(cursor);
      slotDate.setHours(h, m, 0, 0);
      // Pula slots que já passaram (com 1h de antecedência mínima)
      if (slotDate.getTime() < minTime) continue;
      if (!occupied.has(slotKey(dateStr, h, m))) {
        const hh = String(h).padStart(2, "0");
        const mm = m === 0 ? "00" : "30";
        slots.push({
          date: slotDate,
          hour: h,
          minute: m,
          dateStr: `${dateStr} ${hh}:${mm}`,
          dayLabel,
          hourLabel: m === 0 ? `${h}h` : `${h}h30`,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // ── SEGURANÇA: Filtrar qualquer slot que seja de hoje ou passado
  // Garante que nunca oferecemos datas retroativas, mesmo com bugs na lógica acima
  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayAtMidnight);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const safeSlots = slots.filter(slot => slot.date >= tomorrow);
  
  if (safeSlots.length < slots.length) {
    console.warn(
      `[scheduleHelper] Filtrou ${slots.length - safeSlots.length} slots retroativos em getAvailableSlots!`,
      `Slots removidos:`,
      slots.filter(slot => slot.date < tomorrow).map(s => `${s.dayLabel} ${s.hourLabel}`)
    );
  }

  return safeSlots;
}
export async function getAvailableSlotsForVisita(clinicId: string): Promise<SlotInfo[]> {
  // 1. Lê cupons agendados pelas captadoras (coleção cupons)
  const cuponRef = collection(db, "clinics", clinicId, "cupons");
  const cuponSnap = await getDocs(query(cuponRef, where("status", "==", "agendado")));

  // 2. Lê leads já agendados no CRM (shared/shared)
  const sharedRef = doc(db, "clinics", clinicId, "shared", "shared");
  const sharedSnap = await getDoc(sharedRef);
  const rawLeads = sharedSnap.exists() ? (sharedSnap.data()?.leads ?? null) : null;
  // Defensive: Firestore might return an object keyed by index instead of a real array
  const crmLeads: any[] = Array.isArray(rawLeads)
    ? rawLeads
    : rawLeads && typeof rawLeads === "object"
    ? Object.values(rawLeads)
    : [];
  // --- DEBUG (check browser console when opening booking modal) ---
  console.group(`[scheduleHelper] getAvailableSlotsForVisita clinic=${clinicId}`);
  console.log("shared/shared exists:", sharedSnap.exists());
  console.log("raw leads type:", Array.isArray(rawLeads) ? "array" : typeof rawLeads, "| count:", crmLeads.length);
  const leadsComAgendamento = crmLeads.filter((l) => l?.dataAgendamento && l.dataAgendamento.includes("/"));
  console.log("leads com dataAgendamento:", leadsComAgendamento.map((l) => `${l.nome ?? "?"}: ${l.dataAgendamento}`));
  console.groupEnd();

  // Build set of occupied slots
  const occupied = new Set<string>();

  const addOccupied = (dataAgendamento: string, vouchers?: string[]) => {
    const parts = dataAgendamento.split(" ");
    if (parts.length < 2) return;
    const dateStr = parts[0];
    const [hStr, mStr] = parts[1].split(":");
    const h = parseInt(hStr);
    const m = parseInt(mStr) || 0;
    occupied.add(slotKey(dateStr, h, m));
    // Clareamento = 1h → bloqueia slot seguinte também
    const isClareamento = vouchers?.some((v) => v.toLowerCase().includes("clareamento"))
      || false;
    if (isClareamento) {
      const nextM = m === 0 ? 30 : 0;
      const nextH = m === 0 ? h : h + 1;
      occupied.add(slotKey(dateStr, nextH, nextM));
    }
  };

  // Dos cupons (captadoras na rua)
  cuponSnap.forEach((d) => {
    const data = d.data();
    if (data.dataAgendamento) addOccupied(data.dataAgendamento, data.vouchers);
  });

  // Dos leads do CRM
  for (const lead of crmLeads) {
    if (!lead || lead._deleted) continue;
    if (lead.dataAgendamento) {
      // CRM usa servicoProcurado em vez de vouchers
      const vouchers = lead.servicoProcurado
        ? [lead.servicoProcurado]
        : [];
      addOccupied(lead.dataAgendamento, vouchers);
    }
  }

  const slots: SlotInfo[] = [];
  // Começa de hoje, filtrando slots que já passaram (+ 1h de buffer)
  const now = new Date();
  const minTime = now.getTime() + 60 * 60 * 1000; // pelo menos 1h a partir de agora
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0); // início do dia de hoje


  // Itera 10 dias corridos a partir de hoje, pulando feriados e o dia atual
  for (let day = 0; day < 10; day++) {
    const dow = cursor.getDay();
    const isHoje = day === 0;
    const isFds = dow === 0;
    if (isHoje || isFeriado(cursor)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    const workSlots = getWorkingSlotsForVisita(dow);
    const dateStr = format(cursor, "dd/MM/yyyy");
    const dayLabel = `${DAY_NAMES[dow]}, ${dateStr.slice(0, 5)}`;

    for (const { h, m } of workSlots) {
      const slotDate = new Date(cursor);
      slotDate.setHours(h, m, 0, 0);
      // Pula slots que já passaram (com 1h de antecedência mínima)
      if (slotDate.getTime() < minTime) continue;
      if (!occupied.has(slotKey(dateStr, h, m))) {
        const hh = String(h).padStart(2, "0");
        const mm = m === 0 ? "00" : "30";
        slots.push({
          date: slotDate,
          hour: h,
          minute: m,
          dateStr: `${dateStr} ${hh}:${mm}`,
          dayLabel,
          hourLabel: m === 0 ? `${h}h` : `${h}h30`,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // ── SEGURANÇA: Filtrar qualquer slot que seja de hoje ou passado
  // Garante que nunca oferecemos datas retroativas, mesmo com bugs na lógica acima
  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayAtMidnight);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const safeSlots = slots.filter(slot => slot.date >= tomorrow);
  
  if (safeSlots.length < slots.length) {
    console.warn(
      `[scheduleHelper] Filtrou ${slots.length - safeSlots.length} slots retroativos em getAvailableSlotsForVisita!`,
      `Slots removidos:`,
      slots.filter(slot => slot.date < tomorrow).map(s => `${s.dayLabel} ${s.hourLabel}`)
    );
  }

  return safeSlots;
}

export async function saveScheduledLead(
  clinicId: string,
  data: {
    nome: string;
    telefone: string;
    servicos: string[];
    observacao: string;
    abordadora: string;
    local: string;
    dataAgendamento: string;
    fonteLead?: string;
  }
): Promise<void> {
  const docRef = doc(db, "clinics", clinicId, "shared", "shared");

  const now = format(new Date(), "dd/MM/yyyy");
  const newLead = {
    id: `lead_${Date.now()}`,
    dataCriacao: now,
    dataContato: now,
    nome: data.nome.trim(),
    telefone: data.telefone.replace(/\D/g, ""),
    servicoProcurado: data.servicos.length > 0 ? data.servicos.join(", ") : "Consulta",
    captador: data.abordadora,
    fonteLead: data.fonteLead ?? "Promotora",
    etapaLead: "Avaliação agendada",
    status: "QUENTE",
    respostaLead: "RESPONDEU",
    comparecimento: "AGUARDANDO DATA",
    dataFollowUp: now,
    dataAgendamento: data.dataAgendamento,
    dataAgendamentoCriado: now,
    dataRetornoLigacao: "",
    observacao: `Origem: ${data.fonteLead ?? "Promotora"} (${data.local}).${data.observacao ? ` Obs: ${data.observacao}` : ""}`,

    followUpCount: 0,
    lembretes: { h24: false, today: false },
  };

  const snap = await getDoc(docRef);
  if (snap.exists()) {
    // Documento existe: adiciona atomicamente sem reescrever tudo
    await updateDoc(docRef, { leads: arrayUnion(newLead) });
  } else {
    // Documento não existe: cria com o lead
    await setDoc(docRef, { leads: [newLead] });
  }
}
