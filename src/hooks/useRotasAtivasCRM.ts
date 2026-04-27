import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { format } from "date-fns";
import type { RotaAtivaData } from "./useRotaAtiva";

export interface RotaAtivaDoc extends RotaAtivaData {
  id: string;
}

export function useRotasAtivasCRM(clinicId: string | null) {
  const [rotas, setRotas] = useState<RotaAtivaDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clinicId) { setRotas([]); setLoading(false); return; }

    const today = format(new Date(), "dd/MM/yyyy");
    const q = query(
      collection(db, "clinics", clinicId, "rotasAtivas"),
      where("data", "==", today)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RotaAtivaDoc));
      list.sort((a, b) => (b.criadoEm ?? 0) - (a.criadoEm ?? 0));
      setRotas(list);
      setLoading(false);
    });
    return () => unsub();
  }, [clinicId]);

  return { rotas, loading };
}
