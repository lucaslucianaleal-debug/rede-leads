import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";

export type MPCStore = {
  dentists: Array<{ id: string; name: string; specialty?: string; dailyTarget: number; workDays?: number[]; isOrcamentista?: boolean; startDate?: string; leadId?: string }>;
  appointments: Array<{ id: string; dentistId: string; patientName: string; patientId?: string; patientPhone?: string; status: "scheduled" | "confirmed" | "attended"; attendedAt: string; attendedBy?: string; saleValue?: number; saleProcedure?: string }>;
  budgets: Array<{ id: string; dentistId: string; patientName: string; patientId?: string; patientPhone?: string; budgetAt: string; procedure?: string; source?: string; saleValue?: number; saleProcedure?: string }>;
  surveys: Array<{ id: string; leadId?: string; patientName?: string; sector: "reception" | "clinic" | "ortho" | "sales" | "dentist"; dentistId?: string; score: number; comment?: string; createdAt: string }>;
  averageTicket: number;
};

function defaultStore(): MPCStore {
  return { dentists: [], appointments: [], budgets: [], surveys: [], averageTicket: 500 };
}

function normalizeStoreShape(store: any): MPCStore {
  const normalizeWorkDays = (days: any) => {
    const arr = Array.isArray(days) ? days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    const unique = Array.from(new Set(arr)).sort((a, b) => a - b);
    return unique.length > 0 ? unique : [1, 2, 3, 4, 5, 6];
  };

  const normalizeStartDate = (value: any) => {
    if (!value) return undefined;
    const s = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
  };

  return {
    dentists: Array.isArray(store?.dentists)
      ? store.dentists.map((d: any) => {
          const normalizedStartDate = normalizeStartDate(d?.startDate);
          const normalized: any = {
            ...d,
            workDays: normalizeWorkDays(d?.workDays),
            isOrcamentista: d?.isOrcamentista !== false,
          };
          if (normalizedStartDate) normalized.startDate = normalizedStartDate;
          else delete normalized.startDate;
          return normalized;
        })
      : [],
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
  const removeUndefinedDeep = (value: any): any => {
    if (Array.isArray(value)) return value.map(removeUndefinedDeep);
    if (value && typeof value === "object") {
      const out: any = {};
      Object.entries(value).forEach(([k, v]) => {
        if (v === undefined) return;
        out[k] = removeUndefinedDeep(v);
      });
      return out;
    }
    return value;
  };

  return normalizeStoreShape(removeUndefinedDeep(store) as MPCStore);
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
        // Mesmo com falha no getDoc inicial, permite escrita para não perder dados digitados/importados.
        canWrite.current = true;
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

    if (isStoreEmpty(store)) return;

    const storeSnapshot = store;
    const docSnapshot = docRef;

    const timer = setTimeout(async () => {
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
    }, 300);

    return () => clearTimeout(timer);
  }, [store, docRef, isDemo, readOnly, clinicId]);

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const normalizeWorkDays = (days: any) => {
    const arr = Array.isArray(days) ? days.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : [];
    const unique = Array.from(new Set(arr)).sort((a, b) => a - b);
    return unique.length > 0 ? unique : [1, 2, 3, 4, 5, 6];
  };

  const addDentist = useCallback((d: { id?: string; name: string; specialty?: string; dailyTarget?: number; workDays?: number[]; isOrcamentista?: boolean; startDate?: string; leadId?: string }) => {
    const id = d.id || `d_${Date.now()}`;
    const workDays = normalizeWorkDays(d.workDays);
    const startDate = d.startDate && /^\d{4}-\d{2}-\d{2}$/.test(d.startDate) ? d.startDate : new Date().toISOString().slice(0, 10);
    setStore(s => ({ ...s, dentists: [...s.dentists, { id, name: d.name, specialty: d.specialty || "", dailyTarget: d.dailyTarget || 10, workDays, isOrcamentista: d.isOrcamentista !== false, startDate, leadId: d.leadId }] }));
  }, [setStore]);

  const updateDentist = useCallback((id: string, patch: Partial<{ name: string; specialty: string; dailyTarget: number; workDays: number[]; isOrcamentista: boolean; startDate: string }>) => {
    setStore(s => ({
      ...s,
      dentists: s.dentists.map(d => {
        if (d.id !== id) return d;
        const next = { ...d, ...patch } as any;
        if (patch.workDays !== undefined) next.workDays = normalizeWorkDays(patch.workDays);
        if (patch.isOrcamentista !== undefined) next.isOrcamentista = patch.isOrcamentista;
        if (patch.startDate !== undefined) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(String(patch.startDate || ""))) next.startDate = patch.startDate;
          else delete next.startDate;
        }
        return next;
      })
    }));
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

  const saveNow = useCallback(async (nextStore?: MPCStore) => {
    const targetStore = sanitizeStore(nextStore || store);
    if (isDemo || !docRef) {
      if (isDemo) setDemoStore(targetStore);
      else setClinicCacheStore(clinicId, targetStore);
      return;
    }
    await setDoc(docRef, targetStore, { merge: true });
    setClinicCacheStore(clinicId, targetStore);
  }, [store, isDemo, docRef, clinicId]);

  const reset = useCallback(() => {
    setStore(defaultStore());
  }, [setStore]);

  return { store, setStore, addDentist, updateDentist, removeDentist, recordAppointment, addSurvey, reset, saveNow, loading };
}

