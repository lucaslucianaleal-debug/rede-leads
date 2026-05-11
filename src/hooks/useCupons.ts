import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";
import { format } from "date-fns";

export const CLINICAS = [
  { id: "odontocompany-olimpia", label: "Odontocompany Olímpia" },
  { id: "odontocompany-badybassit", label: "Odontocompany Bady Bassit" },
  { id: "odontocompany-novohorizonte", label: "Odontocompany Novo Horizonte" },
];

export const VOUCHERS = [
  "Avaliação",
  "Limpeza Profilaxia",
  "Clareamento",
  "Ortodontia",
  "Implante",
  "Outro",
];

export interface Cupom {
  id: string;
  tipo: "cupom" | "visita" | "promotora";
  clinicaId: string;
  nome: string;
  telefone1: string;
  telefone2?: string;
  vouchers: string[];
  local: string;       // local de abordagem (cupom) ou estabelecimento (visita)
  abordadora: string;  // nome da abordadora (cupom) ou vendedor (visita)
  briefing?: string;   // observação do vendedor (visita)
  sessaoId?: string;   // ID da sessão em que foi capturado
  dataAgendamento?: string; // dd/MM/yyyy HH:mm — preenchido quando agendado
  dataCupom: string; // dd/MM/yyyy HH:mm
  timestamp: number;
  status: "pendente" | "ligado" | "whatsapp_enviado" | "convertido" | "agendado";
}

const getRef = (clinicaId: string) =>
  collection(db, "clinics", clinicaId, "cupons");

const getSessoesRef = (clinicaId: string) =>
  collection(db, "clinics", clinicaId, "sessoes");

export interface Sessao {
  id: string;
  tipo: "cupom" | "visita" | "promotora";
  clinicaId: string;
  abordadora: string;
  local: string;
  horaInicio: string;  // "dd/MM/yyyy HH:mm"
  horaFim: string | null;
  data: string;        // "dd/MM/yyyy" para filtrar por dia
  timestamp: number;
  rota?: { lat: number; lng: number; ts: number }[];
  rotaDefinida?: { lat: number; lng: number; ts: number }[];
}

export function useSessoes(clinicaId: string | null, filterDate?: string) {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clinicaId) { setSessoes([]); setLoading(false); return; }
    const dateToUse = filterDate ?? format(new Date(), "dd/MM/yyyy");
    const q = query(getSessoesRef(clinicaId), where("data", "==", dateToUse));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sessao));
      list.sort((a, b) => b.timestamp - a.timestamp);
      setSessoes(list);
      setLoading(false);
    });
    return () => unsub();
  }, [clinicaId, filterDate]);

  return { sessoes, loading };
}

export async function startSessao(
  clinicaId: string,
  abordadora: string,
  local: string,
  tipo: "cupom" | "visita" | "promotora"
): Promise<string> {
  const now = new Date();
  const ref = await addDoc(getSessoesRef(clinicaId), {
    tipo,
    clinicaId,
    abordadora,
    local,
    horaInicio: format(now, "dd/MM/yyyy HH:mm"),
    horaFim: null,
    data: format(now, "dd/MM/yyyy"),
    timestamp: now.getTime(),
  });
  return ref.id;
}

export async function endSessao(clinicaId: string, sessaoId: string): Promise<void> {
  await updateDoc(doc(db, "clinics", clinicaId, "sessoes", sessaoId), {
    horaFim: format(new Date(), "dd/MM/yyyy HH:mm"),
  });
}

export function useCupons(clinicaId: string | null) {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clinicaId) {
      setCupons([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(getRef(clinicaId), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cupom));
      setCupons(data);
      setLoading(false);
    });
    return () => unsub();
  }, [clinicaId]);

  const addCupom = async (
    clinicaId: string,
    data: Omit<Cupom, "id" | "timestamp" | "dataCupom" | "status">,
    status: Cupom["status"] = "pendente"
  ): Promise<string> => {
    const now = new Date();
    const ref = await addDoc(getRef(clinicaId), {
      ...data,
      dataCupom: format(now, "dd/MM/yyyy HH:mm"),
      timestamp: now.getTime(),
      status,
    });
    return ref.id;
  };

  const updateStatus = async (
    clinicaId: string,
    cupomId: string,
    status: Cupom["status"]
  ) => {
    await updateDoc(doc(db, "clinics", clinicaId, "cupons", cupomId), { status });
  };

  return { cupons, loading, addCupom, updateStatus };
}
