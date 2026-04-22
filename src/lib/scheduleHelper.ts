import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { format } from "date-fns";

export interface SlotInfo {
  date: Date;
  hour: number;
  dateStr: string;  // "dd/MM/yyyy HH:mm"
  dayLabel: string; // "Quarta, 23/04"
  hourLabel: string; // "9h"
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function getWorkingHours(dow: number): number[] {
  if (dow === 0) return [];                            // domingo
  if (dow === 6) return [8, 9, 10, 11];               // sábado
  return [8, 9, 10, 11, 14, 15, 16, 17];             // seg-sex
}

export async function getAvailableSlots(clinicId: string): Promise<SlotInfo[]> {
  const docRef = doc(db, "clinics", clinicId, "shared", "shared");
  const snap = await getDoc(docRef);
  const leads: any[] = snap.exists() ? ((snap.data() as any).leads ?? []) : [];

  // Build set of occupied slots: "dd/MM/yyyy H"
  const occupied = new Set<string>();
  for (const l of leads) {
    if (!l.dataAgendamento) continue;
    const parts = l.dataAgendamento.split(" ");
    if (parts.length >= 2) {
      const hour = parseInt(parts[1].split(":")[0]);
      occupied.add(`${parts[0]} ${hour}`);
    }
  }

  const slots: SlotInfo[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);

  let safety = 0;
  while (slots.length < 24 && safety < 14) {
    safety++;
    const dow = cursor.getDay();
    const hours = getWorkingHours(dow);
    const dateStr = format(cursor, "dd/MM/yyyy");
    const dayLabel = `${DAY_NAMES[dow]}, ${dateStr.slice(0, 5)}`;

    for (const h of hours) {
      if (!occupied.has(`${dateStr} ${h}`) && slots.length < 24) {
        const slotDate = new Date(cursor);
        slotDate.setHours(h, 0, 0, 0);
        slots.push({
          date: slotDate,
          hour: h,
          dateStr: `${dateStr} ${String(h).padStart(2, "0")}:00`,
          dayLabel,
          hourLabel: `${h}h`,
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
