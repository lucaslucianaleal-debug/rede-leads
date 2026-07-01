import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

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

export function useMPCDataStore(clinicId: string | null) {
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
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setStoreState(snap.data() as MPCStore);
        } else {
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

    // Assinar atualizações em tempo real (somente leitura — não dispara o save effect)
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setStoreState(snap.data() as MPCStore);
      }
    });

    return () => {
      unsubscribe();
      hasLoaded.current = false;
    };
  }, [docRef, isDemo]);

  // Salva no Firestore — MAS SÓ depois do carregamento inicial, para não apagar dados existentes
  useEffect(() => {
    if (!docRef || isDemo || !hasLoaded.current) return;

    const saveToFirebase = async () => {
      try {
        await setDoc(docRef, store);
      } catch (e) {
        console.warn("[useMPCDataStore] Erro ao salvar no Firebase:", e);
      }
    };

    const timer = setTimeout(saveToFirebase, 800);
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
