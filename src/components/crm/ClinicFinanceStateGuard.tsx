import { useEffect, useRef } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import {
  FINANCE_SNAPSHOT_EVENT,
  financeSnapshotKey,
  type ClinicFinanceDueItem,
  type ClinicFinanceSnapshot,
} from "@/components/crm/ClinicFinanceSnapshotBridge";

type Installment = {
  document: string;
  emission: string;
  dueDate: string;
  original: number;
  current: number;
  observation?: string;
};

type PatientDebt = {
  id: string;
  name: string;
  cpf: string;
  phones: string[];
  installments: Installment[];
};

type FinanceStore = {
  version: 1;
  fileName: string;
  importedAt: string;
  period: string;
  receiptsFile?: string | null;
  patients: PatientDebt[];
};

const storeKey = (clinicId: string) => `clinic_finance_store_v4_${clinicId}`;

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function patientKey(patient: PatientDebt) {
  const cpf = String(patient.cpf || "").replace(/\D/g, "");
  if (cpf) return `cpf:${cpf}`;
  return `name:${normalize(patient.name)}`;
}

function installmentKey(item: Installment) {
  return `${normalize(item.document)}|${String(item.dueDate || "").trim()}`;
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fin_${(hash >>> 0).toString(16)}`;
}

function patientDocId(patient: PatientDebt) {
  const cpf = String(patient.cpf || "").replace(/\D/g, "");
  if (cpf) return `cpf_${cpf}`;
  return stableId(`${normalize(patient.name)}|${patient.id || ""}`);
}

function mergePatients(base: PatientDebt[], incoming: PatientDebt[]) {
  const merged = new Map<string, PatientDebt>();

  const absorb = (patient: PatientDebt) => {
    const key = patientKey(patient);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, {
        ...patient,
        phones: Array.from(new Set((patient.phones || []).filter(Boolean))),
        installments: [...(patient.installments || [])],
      });
      return;
    }

    const installments = new Map<string, Installment>();
    for (const item of previous.installments || []) installments.set(installmentKey(item), item);
    for (const item of patient.installments || []) {
      const itemKey = installmentKey(item);
      const old = installments.get(itemKey);
      installments.set(itemKey, old ? { ...old, ...item } : item);
    }

    merged.set(key, {
      ...previous,
      ...patient,
      id: previous.id || patient.id,
      cpf: previous.cpf || patient.cpf,
      name: patient.name || previous.name,
      phones: Array.from(new Set([...(previous.phones || []), ...(patient.phones || [])].filter(Boolean))),
      installments: Array.from(installments.values()),
    });
  };

  base.forEach(absorb);
  incoming.forEach(absorb);
  return Array.from(merged.values());
}

function mergeStores(base: FinanceStore | null, incoming: FinanceStore | null): FinanceStore | null {
  if (!base) return incoming;
  if (!incoming) return base;
  return {
    ...base,
    ...incoming,
    version: 1,
    receiptsFile: incoming.receiptsFile || base.receiptsFile || null,
    patients: mergePatients(base.patients || [], incoming.patients || []),
  };
}

function readLocalStore(clinicId: string): FinanceStore | null {
  try {
    const raw = localStorage.getItem(storeKey(clinicId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FinanceStore;
    return parsed?.version === 1 && Array.isArray(parsed.patients) ? parsed : null;
  } catch {
    return null;
  }
}

function brDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function dateKey(value: string) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function makeSnapshot(store: FinanceStore): ClinicFinanceSnapshot {
  const now = new Date();
  const today = brDate(now);
  const tomorrow = brDate(new Date(now.getTime() + 86400000));
  const todaySortable = dateKey(today);
  const dueToday: ClinicFinanceDueItem[] = [];
  const dueTomorrow: ClinicFinanceDueItem[] = [];
  let overdueCount = 0;
  let overdueAmount = 0;

  for (const patient of store.patients || []) {
    const phone = patient.phones?.[0] || "";
    const byToday = (patient.installments || []).filter((item) => item.dueDate === today);
    const byTomorrow = (patient.installments || []).filter((item) => item.dueDate === tomorrow);
    if (byToday.length) {
      dueToday.push({
        name: patient.name,
        phone,
        document: byToday.map((item) => item.document).join(", "),
        dueDate: today,
        current: byToday.reduce((sum, item) => sum + Number(item.current || 0), 0),
      });
    }
    if (byTomorrow.length) {
      dueTomorrow.push({
        name: patient.name,
        phone,
        document: byTomorrow.map((item) => item.document).join(", "),
        dueDate: tomorrow,
        current: byTomorrow.reduce((sum, item) => sum + Number(item.current || 0), 0),
      });
    }
    for (const item of patient.installments || []) {
      const key = dateKey(item.dueDate);
      if (key && key < todaySortable) {
        overdueCount += 1;
        overdueAmount += Number(item.current || 0);
      }
    }
  }

  return {
    fileName: store.fileName || "Base financeira",
    updatedAt: store.importedAt || new Date().toISOString(),
    dueToday,
    dueTomorrow,
    overdueCount,
    overdueAmount,
  };
}

async function readRemoteStore(clinicId: string): Promise<FinanceStore | null> {
  const [metaSnap, patientsSnap] = await Promise.all([
    getDoc(doc(db, "clinics", clinicId, "financeState", "current")),
    getDocs(collection(db, "clinics", clinicId, "financePatients")),
  ]);
  if (patientsSnap.empty) return null;
  const meta = metaSnap.exists() ? metaSnap.data() : {};
  const patients = patientsSnap.docs
    .map((snapshotDoc) => snapshotDoc.data() as PatientDebt)
    .filter((patient) => patient && Array.isArray(patient.installments));
  if (!patients.length) return null;
  return {
    version: 1,
    fileName: String(meta.fileName || "Base financeira"),
    importedAt: String(meta.importedAt || meta.updatedAt || new Date().toISOString()),
    period: String(meta.period || ""),
    receiptsFile: meta.receiptsFile ? String(meta.receiptsFile) : null,
    patients,
  };
}

async function persistRemoteStore(clinicId: string, store: FinanceStore) {
  const nowIso = new Date().toISOString();
  await setDoc(doc(db, "clinics", clinicId, "financeState", "current"), {
    version: 1,
    fileName: store.fileName || "Base financeira",
    importedAt: store.importedAt || nowIso,
    period: store.period || "",
    receiptsFile: store.receiptsFile || null,
    patientCount: store.patients.length,
    updatedAt: nowIso,
  }, { merge: true });

  const chunkSize = 350;
  for (let start = 0; start < store.patients.length; start += chunkSize) {
    const batch = writeBatch(db);
    store.patients.slice(start, start + chunkSize).forEach((patient) => {
      batch.set(doc(db, "clinics", clinicId, "financePatients", patientDocId(patient)), {
        ...patient,
        syncedAt: nowIso,
      }, { merge: true });
    });
    await batch.commit();
  }
}

async function clearRemoteStore(clinicId: string) {
  const snapshot = await getDocs(collection(db, "clinics", clinicId, "financePatients"));
  const chunkSize = 350;
  for (let start = 0; start < snapshot.docs.length; start += chunkSize) {
    const batch = writeBatch(db);
    snapshot.docs.slice(start, start + chunkSize).forEach((patientDoc) => batch.delete(patientDoc.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, "clinics", clinicId, "financeState", "current"));
}

export function ClinicFinanceStateGuard() {
  const { currentClinic } = useAuth();
  const hydratedRef = useRef(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!currentClinic) return;
    let cancelled = false;
    hydratedRef.current = false;

    const publish = (store: FinanceStore | null) => {
      if (!store) {
        localStorage.removeItem(financeSnapshotKey(currentClinic));
      } else {
        const snapshot = makeSnapshot(store);
        localStorage.setItem(financeSnapshotKey(currentClinic), JSON.stringify(snapshot));
      }
      syncingRef.current = true;
      window.dispatchEvent(new CustomEvent(FINANCE_SNAPSHOT_EVENT));
      syncingRef.current = false;
    };

    const hydrate = async () => {
      try {
        const local = readLocalStore(currentClinic);
        const remote = await readRemoteStore(currentClinic);
        if (cancelled) return;
        const merged = mergeStores(remote, local);
        if (merged) {
          localStorage.setItem(storeKey(currentClinic), JSON.stringify(merged));
          await persistRemoteStore(currentClinic, merged);
          publish(merged);
        } else {
          publish(null);
        }
      } catch (error) {
        console.error("[clinic-finance][hydrate]", error);
        const local = readLocalStore(currentClinic);
        if (local) publish(local);
      } finally {
        hydratedRef.current = true;
      }
    };

    const syncFromLocal = () => {
      if (!hydratedRef.current || syncingRef.current) return;
      void (async () => {
        syncingRef.current = true;
        try {
          const local = readLocalStore(currentClinic);
          if (!local) {
            await clearRemoteStore(currentClinic);
            publish(null);
            return;
          }
          const remote = await readRemoteStore(currentClinic);
          const merged = mergeStores(remote, local) || local;
          localStorage.setItem(storeKey(currentClinic), JSON.stringify(merged));
          await persistRemoteStore(currentClinic, merged);
          publish(merged);
        } catch (error) {
          console.error("[clinic-finance][sync]", error);
        } finally {
          syncingRef.current = false;
        }
      })();
    };

    window.addEventListener(FINANCE_SNAPSHOT_EVENT, syncFromLocal as EventListener);
    void hydrate();

    return () => {
      cancelled = true;
      window.removeEventListener(FINANCE_SNAPSHOT_EVENT, syncFromLocal as EventListener);
    };
  }, [currentClinic]);

  return null;
}
