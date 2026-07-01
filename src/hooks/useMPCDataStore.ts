import { useState, useEffect, useCallback } from "react";
import type { DentistPerformance } from "@/types/mpc";
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
  const docRef = getMPCDocRef(clinicId);
  const isDemo = !clinicId || clinicId === "demo";

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
    if (isDemo) {
      // Para demo, usa localStorage
      const demoStore = getDemoStore();
      setStoreState(demoStore);
      setLoading(false);
      return;
    }

    if (!docRef) {
      setStoreState(defaultStore());
      setLoading(false);
      return;
    }

    setLoading(true);

    // First: load from Firestore
    const loadInitial = async () => {
      try {
        const snap = await getDoc(docRef!);
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
      }
    };

    loadInitial();

    // Then: subscribe to real-time updates
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setStoreState(snap.data() as MPCStore);
      }
    });

    return () => unsubscribe();
  }, [docRef, isDemo]);

  // Save to Firestore whenever store changes
  useEffect(() => {
    if (!docRef || isDemo) return;

    const saveToFirebase = async () => {
      try {
        await setDoc(docRef, store, { merge: true });
      } catch (e) {
        console.warn("[useMPCDataStore] Erro ao salvar no Firebase:", e);
      }
    };

    const timer = setTimeout(saveToFirebase, 500); // Debounce
    return () => clearTimeout(timer);
  }, [store, docRef, isDemo]);

  const addDentist = useCallback((d: { id?: string; name: string; specialty?: string; dailyTarget?: number; leadId?: string }) => {
    const id = d.id || `d_${Date.now()}`;
    setStore(s => ({ ...s, dentists: [...s.dentists, { id, name: d.name, specialty: d.specialty || "", dailyTarget: d.dailyTarget || 10, leadId: d.leadId }] }));
  }, []);

  const updateDentist = useCallback((id: string, patch: Partial<{ name: string; specialty: string; dailyTarget: number }>) => {
    setStore(s => ({ ...s, dentists: s.dentists.map(d => d.id === id ? { ...d, ...patch } : d) }));
  }, []);

  const removeDentist = useCallback((id: string) => {
    setStore(s => ({ ...s, dentists: s.dentists.filter(d => d.id !== id) }));
  }, []);

  const recordAppointment = useCallback((a: any) => {
    setStore(s => ({ ...s, appointments: [...s.appointments, a] }));
  }, []);

  const addSurvey = useCallback((s: any) => {
    setStore(st => ({ ...st, surveys: [...st.surveys, s] }));
  }, []);

  const reset = useCallback(() => {
    setStore(defaultStore());
  }, []);

  return { store, setStore, addDentist, updateDentist, removeDentist, recordAppointment, addSurvey, reset };
}
