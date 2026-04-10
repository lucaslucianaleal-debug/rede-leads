import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
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
  "Limpeza (jato de bicarbonato e aplicação de flúor)",
  "Aparelho Fixo",
  "Isenção da taxa ODC",
  "Raio-X Panorâmico",
  "1 Sessão de Clareamento (arcada inferior)",
];

export interface Cupom {
  id: string;
  clinicaId: string;
  nome: string;
  telefone1: string;
  telefone2?: string;
  vouchers: string[];
  local: string;
  abordadora: string;
  dataCupom: string; // dd/MM/yyyy HH:mm
  timestamp: number;
  status: "pendente" | "ligado" | "convertido";
}

const getRef = (clinicaId: string) =>
  collection(db, "clinics", clinicaId, "cupons");

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
    data: Omit<Cupom, "id" | "timestamp" | "dataCupom" | "status">
  ) => {
    const now = new Date();
    await addDoc(getRef(clinicaId), {
      ...data,
      dataCupom: format(now, "dd/MM/yyyy HH:mm"),
      timestamp: now.getTime(),
      status: "pendente",
    });
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
