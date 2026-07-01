import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";

export type MPCStore = {
  dentists: Array<{ id: string; name: string; specialty?: string; dailyTarget: number; leadId?: string }>;
  appointments: Array<{ id: string; dentistId: string; patientName: string; patientId?: string; status: "scheduled" | "confirmed" | "attended"; attendedAt: string }>;
  surveys: Array<{ id: string; leadId?: string; sector: "reception" | "clinic" | "ortho" | "sales"; score: number; comment?: string; createdAt: string }>;
  averageTicket: number;
};

function defaultStore(): MPCStore {
  return {
    dentists: [],
    appointments: [],
    surveys: [],
    averageTicket: 500,
  };
}

function getMPCDocRef(clinicId: string | null) {
  if (!clinicId || clinicId === "demo") return null;
  return doc(db, "clinics", clinicId, "mpc", "store");
}

const DEMO_STORAGE_KEY = "mpc_demo_store";

function getDemoStore(): MPCStore {
  try {
    const stored = localStorage.getItem(DEMO_STORAGE_KEY);
    return stored ? JSON.parse(stored) : defaultStore();
  } catch {
    return defaultStore();
  }
}

function setDemoStore(store: MPCStore) {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn("[useMPCDataStore] Erro ao salvar no localStorage:", e);
  }
}

export function useMPCDataStore(clinicId: string | null, options?: { readOnly?: boolean }) {
  const readOnly = options?.readOnly ?? false;
  const [store, setStoreState] = useState<MPCStore>(defaultStore());
  const [loading, setLoading] = useState(true);
  const isDemo = !clinicId || clinicId === "demo";
  // Guarda se o carregamento inicial já foi concluído — impede salvar estado vazio no Firebase
  const hasLoaded = useRef(false);

  // Memoize docRef para evitar re-render infinito (doc() cria novo objeto a cada render)
  const docRef = useMemo(() => {
    if (isDemo) return null;
    return doc(db, "clinics", clinicId!, "mpc", "store");
  }, [clinicId, isDemo]);

  // Wrapper para setStore que também salva em localStorage quando é demo
  const setStore = useCallback((newStore: MPCStore | ((prev: MPCStore) => MPCStore)) => {
    setStoreState((prev) => {
      const updated = typeof newStore === "function" ? newStore(prev) : newStore;
      if (isDemo) {
        setDemoStore(updated);
      }
      return updated;
    });
  }, [isDemo]);

  // Sync with Firestore on mount and clinicId change
  useEffect(() => {
    hasLoaded.current = false;

    if (isDemo) {
      setStoreState(getDemoStore());
      setLoading(false);
      hasLoaded.current = true;
      return;
    }

    if (!docRef) {
      setStoreState(defaultStore());
      setLoading(false);
      hasLoaded.current = true;
      return;
    }

    setLoading(true);

    const loadInitial = async () => {
      try {
        console.log(`[MPC] 🔄 Carregando do Firebase | path: clinics/${clinicId}/mpc/store`);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as MPCStore;
          console.log(`[MPC] ✅ Dados carregados | dentistas: ${data.dentists?.length ?? 0} | atendimentos: ${data.appointments?.length ?? 0}`);
          setStoreState(data);
        } else {
          console.log(`[MPC] ℹ️ Documento ainda não existe no Firebase — iniciando vazio`);
          setStoreState(defaultStore());
        }
      } catch (e) {
        console.warn("[useMPCDataStore] Erro ao carregar do Firebase:", e);
        setStoreState(defaultStore());
      } finally {
        setLoading(false);
        hasLoaded.current = true;
      }
    };

    loadInitial();

    // Assinar atualizações em tempo real
    // Usa forma funcional do setState: se dados são iguais, retorna prev → React não re-renderiza → save effect não dispara → sem loop
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.metadata.hasPendingWrites) return; // ignora eco do nosso próprio setDoc
      if (snap.exists()) {
        setStoreState(prev => {
          const incoming = snap.data() as MPCStore;
          // Só troca referência se dados realmente mudaram (evita loop)
          return JSON.stringify(prev) === JSON.stringify(incoming) ? prev : incoming;
        });
      }
    });

    return () => {
      unsubscribe();
      hasLoaded.current = false;
    };
  }, [docRef, isDemo]);

  // Salva no Firestore — hasLoaded é verificado DENTRO do timer (800ms depois), 
  // garantindo que loadInitial() já terminou antes de salvar
  useEffect(() => {
    if (!docRef || isDemo || readOnly) return;

    const savedStore = store; // captura snapshot do store atual para evitar closure stale
    const savedDocRef = docRef;

    const timer = setTimeout(async () => {
      if (!hasLoaded.current) {
        console.warn("[MPC] Save ignorado: dados ainda não carregados do Firebase");
        return;
      }
      try {
        await setDoc(savedDocRef, savedStore);
        const clinicName = savedDocRef.parent.parent?.id ?? "?";
        console.log(
          `[MPC] ✅ Salvo no Firebase | clinicId: ${clinicName} | dentistas: ${savedStore.dentists.length} | atendimentos: ${savedStore.appointments.length} | pesquisas: ${savedStore.surveys.length}`
        );
        toast.success(`Dados salvos na nuvem`, {
          description: `${savedStore.dentists.length} dentistas · ${savedStore.appointments.length} atendimentos`,
          duration: 2500,
        });
      } catch (e) {
        console.error("[MPC] ❌ Erro ao salvar no Firebase:", e);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [store, docRef, isDemo]);

  const addDentist = useCallback((d: { id?: string; name: string; specialty?: string; dailyTarget?: number; leadId?: string }) => {
    const id = d.id || `d_${Date.now()}`;
    setStore(s => ({ ...s, dentists: [...s.dentists, { id, name: d.name, specialty: d.specialty || "", dailyTarget: d.dailyTarget || 10, leadId: d.leadId }] }));
  }, [setStore]);

  const updateDentist = useCallback((id: string, patch: Partial<{ name: string; specialty: string; dailyTarget: number }>) => {
    setStore(s => ({ ...s, dentists: s.dentists.map(d => d.id === id ? { ...d, ...patch } : d) }));
  }, [setStore]);

  const removeDentist = useCallback((id: string) => {
    setStore(s => ({ ...s, dentists: s.dentists.filter(d => d.id !== id) }));
  }, [setStore]);

  const recordAppointment = useCallback((a: any) => {
    setStore(s => ({ ...s, appointments: [...s.appointments, a] }));
  }, [setStore]);

  const addSurvey = useCallback((s: any) => {
    setStore(st => ({ ...st, surveys: [...st.surveys, s] }));
  }, [setStore]);

  const reset = useCallback(() => {
    setStore(defaultStore());
  }, [setStore]);

  return { store, setStore, addDentist, updateDentist, removeDentist, recordAppointment, addSurvey, reset };
}
