import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
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

// Returns half-hour slots for a given day-of-week
function getWorkingSlots(dow: number): { h: number; m: number }[] {
  if (dow === 0) return []; // domingo
  const hours = dow === 6 ? [8, 9, 10, 11] : [8, 9, 10, 11, 14, 15, 16, 17];
  const slots: { h: number; m: number }[] = [];
  for (const h of hours) {
    slots.push({ h, m: 0 });
    slots.push({ h, m: 30 });
  }
  return slots;
}

function slotKey(dateStr: string, h: number, m: number): string {
  return `${dateStr} ${h}:${m === 0 ? "00" : "30"}`;
}

export async function getAvailableSlots(clinicId: string): Promise<SlotInfo[]> {
  // Read from cupons collection — agendamentos feitos pelas captadoras
  const cuponRef = collection(db, "clinics", clinicId, "cupons");
  const snap = await getDocs(query(cuponRef, where("status", "==", "agendado")));

  // Build set of occupied slots — clareamento blocks 2 consecutive 30min slots
  const occupied = new Set<string>();
  snap.forEach((d) => {
    const data = d.data();
    if (!data.dataAgendamento) return;
    const parts = (data.dataAgendamento as string).split(" ");
    if (parts.length < 2) return;
    const dateStr = parts[0];
    const [hStr, mStr] = parts[1].split(":");
    const h = parseInt(hStr);
    const m = parseInt(mStr) || 0;
    occupied.add(slotKey(dateStr, h, m));
    // Clareamento = 1h → bloqueia slot seguinte também
    const isClareamento = (data.vouchers as string[] | undefined)?.some(
      (v) => v.toLowerCase().includes("clareamento")
    );
    if (isClareamento) {
      const nextM = m === 0 ? 30 : 0;
      const nextH = m === 0 ? h : h + 1;
      occupied.add(slotKey(dateStr, nextH, nextM));
    }
  });

  const slots: SlotInfo[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);

  let safety = 0;
  while (slots.length < 32 && safety < 14) {
    safety++;
    const dow = cursor.getDay();
    const workSlots = getWorkingSlots(dow);
    const dateStr = format(cursor, "dd/MM/yyyy");
    const dayLabel = `${DAY_NAMES[dow]}, ${dateStr.slice(0, 5)}`;

    for (const { h, m } of workSlots) {
      if (!occupied.has(slotKey(dateStr, h, m)) && slots.length < 32) {
        const slotDate = new Date(cursor);
        slotDate.setHours(h, m, 0, 0);
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

  return slots;
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
    servicoProcurado: data.servicos.length > 0 ? data.servicos.join(", ") : "Avaliação",
    captador: data.abordadora,
    fonteLead: "Promotora",
    etapaLead: "Avaliação agendada",
    status: "",
    respostaLead: "",
    comparecimento: "AGUARDANDO DATA",
    dataFollowUp: now,
    dataAgendamento: data.dataAgendamento,
    dataAgendamentoCriado: now,
    dataRetornoLigacao: "",
    observacao: `Origem: Promotora (${data.local}).${data.observacao ? ` Obs: ${data.observacao}` : ""}`,
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
