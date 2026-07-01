import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";

export type MPCStore = {
  dentists: Array<{ id: string; name: string; specialty?: string; dailyTarget: number; leadId?: string }>;
  appointments: Array<{ id: string; dentistId: string; patientName: string; patientId?: string; status: "scheduled" | "confirmed" | "attended"; attendedAt: string }>;
  budgets: Array<{ id: string; dentistId: string; patientName: string; patientId?: string; budgetAt: string; procedure?: string; source?: string }>;
  surveys: Array<{ id: string; leadId?: string; sector: "reception" | "clinic" | "ortho" | "sales"; score: number; comment?: string; createdAt: string }>;
  averageTicket: number;
};

function defaultStore(): MPCStore {
  return { dentists: [], appointments: [], budgets: [], surveys: [], averageTicket: 500 };
}

function normalizeStoreShape(store: any): MPCStore {
  return {
    dentists: Array.isArray(store?.dentists) ? store.dentists : [],
    appointments: Array.isArray(store?.appointments) ? store.appointments : [],
    budgets: Array.isArray(store?.budgets) ? store.budgets : [],
    surveys: Array.isArray(store?.surveys) ? store.surveys : [],
    averageTicket: Number(store?.averageTicket ?? 500),
  };
}

const DEMO_STORAGE_KEY = "mpc_demo_store";

const getMPCStorageKey = (clinicId?: string | null) =>
  clinicId ? `mpc_store_${clinicId}` : DEMO_STORAGE_KEY;

function getDemoStore(): MPCStore {
  try {
    const stored = localStorage.getItem(DEMO_STORAGE_KEY);
    return stored ? normalizeStoreShape(JSON.parse(stored)) : defaultStore();
  } catch { return defaultStore(); }
}

function setDemoStore(store: MPCStore) {
  try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store)); } catch {}
}

function getClinicCacheStore(clinicId: string | null): MPCStore | null {
  if (!clinicId) return null;
  try {
    const stored = localStorage.getItem(getMPCStorageKey(clinicId));
    return stored ? normalizeStoreShape(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function setClinicCacheStore(clinicId: string | null, store: MPCStore) {
  if (!clinicId) return;
  try {
    localStorage.setItem(getMPCStorageKey(clinicId), JSON.stringify(store));
  } catch {}
}

function sanitizeStore(store: MPCStore): MPCStore {
  return normalizeStoreShape(JSON.parse(JSON.stringify(store)) as MPCStore);
}

function isStoreEmpty(s: MPCStore) {
  return s.dentists.length === 0 && s.appointments.length === 0 && s.budgets.length === 0 && s.surveys.length === 0;
}

export function useMPCDataStore(clinicId: string | null, options?: { readOnly?: boolean }) {
  const readOnly = options?.readOnly ?? false;
  const isDemo = !clinicId || clinicId === "demo";

  const [store, setStoreState] = useState<MPCStore>(defaultStore());
  const [loading, setLoading] = useState(true);

  // isFromFirebase: quando true, a mudança de store veio do Firebase (load ou snapshot)
  // → o save effect NÃO deve salvar de volta (evita loop e sobrescrita com dado vazio)
  const isFromFirebase = useRef(false);

  // canWrite: só permite salvar depois do getDoc inicial confirmar o estado remoto
  const canWrite = useRef(false);

  const docRef = useMemo(() => {
    if (isDemo) return null;
    return doc(db, "clinics", clinicId!, "mpc", "store");
  }, [clinicId, isDemo]);

  // setStore: chamado por AÇÕES DO USUÁRIO — isFromFirebase permanece false → save é permitido
  const setStore = useCallback((newStore: MPCStore | ((prev: MPCStore) => MPCStore)) => {
    setStoreState((prev) => {
      const updated = typeof newStore === "function" ? newStore(prev) : newStore;
      if (isDemo) setDemoStore(updated);
      else setClinicCacheStore(clinicId, updated);
      return updated;
    });
  }, [isDemo, clinicId]);

  // Sync com Firestore
  useEffect(() => {
    canWrite.current = false;
    isFromFirebase.current = false;

    if (isDemo) {
      setStoreState(getDemoStore());
      setLoading(false);
      canWrite.current = true;
      return;
    }

    if (!docRef) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;
    let unsub: () => void = () => {};

    const init = async () => {
      try {
        console.log(`[MPC] 🔄 Carregando | clinics/${clinicId}/mpc/store`);
        const snap = await getDoc(docRef);
        if (!active) return;

        if (snap.exists()) {
          const data = normalizeStoreShape(snap.data());
          console.log(`[MPC] ✅ Carregado | dentistas: ${data.dentists?.length ?? 0} | atendimentos: ${data.appointments?.length ?? 0}`);
          isFromFirebase.current = true;
          setStoreState(data);
          setClinicCacheStore(clinicId, data);
        } else {
          // Mesmo comportamento de "leads": tenta bootstrap via cache local da clínica.
          const cached = getClinicCacheStore(clinicId);
          if (cached && !isStoreEmpty(cached)) {
            console.log(`[MPC] ♻️ Bootstrap do cache local para Firebase | clinic=${clinicId}`);
            isFromFirebase.current = true;
            setStoreState(cached);
            try {
              await setDoc(docRef, sanitizeStore(cached), { merge: true });
            } catch (writeErr) {
              console.warn("[MPC] Falha no bootstrap para Firebase:", writeErr);
            }
          } else {
            console.log(`[MPC] ℹ️ Documento não existe ainda — pronto para receber dados`);
            isFromFirebase.current = true;
            setStoreState(defaultStore());
          }
        }

        canWrite.current = true;
      } catch (e) {
        console.warn("[MPC] Erro ao carregar:", e);
        canWrite.current = false;
      } finally {
        if (active) setLoading(false);
      }

      // Assinar atualizações em tempo real APÓS o getDoc inicial
      try {
        unsub = onSnapshot(docRef, (snap) => {
          if (!active) return;
          if (snap.metadata.hasPendingWrites) return;

          if (snap.exists()) {
            isFromFirebase.current = true;
            setStoreState(prev => {
              const incoming = normalizeStoreShape(snap.data());
              setClinicCacheStore(clinicId, incoming);
              return JSON.stringify(prev) === JSON.stringify(incoming) ? prev : incoming;
            });
            canWrite.current = true;
          }
        }, (err) => {
          console.warn("[MPC] onSnapshot error:", err);
        });
      } catch (e) {
        console.warn("[MPC] Falha ao assinar onSnapshot:", e);
      }
    };

    init();

    return () => {
      active = false;
      try { unsub(); } catch {}
      canWrite.current = false;
    };
  }, [docRef, isDemo, clinicId]);

  // ─── Save Effect ────────────────────────────────────────────────────────────
  // Só salva quando:
  //   1. isFromFirebase.current = false  → mudança veio do USUÁRIO (não do Firebase)
  //   2. canWrite.current = true          → getDoc inicial já foi concluído
  //   3. store não está completamente vazio
  useEffect(() => {
    if (!docRef || isDemo || readOnly) return;

    // Mudança veio do Firebase → reseta flag e não salva de volta
    if (isFromFirebase.current) {
      isFromFirebase.current = false;
      return;
    }

    if (!canWrite.current) return;
    if (isStoreEmpty(store)) return;

    const storeSnapshot = store;
    const docSnapshot = docRef;

    const timer = setTimeout(async () => {
      if (!canWrite.current) return;
      try {
        const sanitized = sanitizeStore(storeSnapshot);
        await setDoc(docSnapshot, sanitized, { merge: true });
        setClinicCacheStore(clinicId, sanitized);
        console.log(
          `[MPC] ✅ SALVO | clinics/${clinicId}/mpc/store | dentistas: ${storeSnapshot.dentists.length} | atendimentos: ${storeSnapshot.appointments.length}`
        );
        toast.success("Dados salvos na nuvem ☁️", {
          description: `${storeSnapshot.dentists.length} dentista(s) · ${storeSnapshot.appointments.length} atendimento(s) · ${storeSnapshot.budgets.length} orçamento(s)`,
          duration: 3000,
        });
      } catch (e) {
        console.error("[MPC] ❌ Erro ao salvar:", e);
        toast.error("Erro ao salvar na nuvem", { description: String(e) });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [store, docRef, isDemo, readOnly, clinicId]);

  // ─── Mutations ──────────────────────────────────────────────────────────────
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

  return { store, setStore, addDentist, updateDentist, removeDentist, recordAppointment, addSurvey, reset, loading };
}

