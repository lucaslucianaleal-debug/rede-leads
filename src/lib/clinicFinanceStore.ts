import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type FinanceInstallment = {
  document: string;
  emission: string;
  dueDate: string;
  original: number;
  current: number;
  observation?: string;
};

export type FinanceReceipt = {
  document: string;
  patient?: string;
  amount: number;
  method?: string;
  paidAt?: string;
  importedAt?: string;
};

export type FinancePatient = {
  id: string;
  name: string;
  cpf: string;
  phones: string[];
  installments: FinanceInstallment[];
};

export type FinanceStore = {
  version: 1;
  fileName: string;
  importedAt: string;
  period: string;
  receiptsFile?: string | null;
  receiptsImportedAt?: string | null;
  receiptsCount?: number;
  receiptsMatched?: number;
  receiptsAmount?: number;
  receipts?: FinanceReceipt[];
  patients: FinancePatient[];
};

export const financeStoreKey = (clinicId: string) => `clinic_finance_store_v4_${clinicId}`;

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function patientKey(patient: FinancePatient) {
  const cpf = String(patient.cpf || "").replace(/\D/g, "");
  if (cpf) return `cpf:${cpf}`;
  return `name:${normalize(patient.name)}`;
}

function installmentKey(item: FinanceInstallment) {
  return `${normalize(item.document)}|${String(item.dueDate || "").trim()}`;
}

function receiptKey(item: FinanceReceipt) {
  return `${normalize(item.document)}|${Number(item.amount || 0).toFixed(2)}`;
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fin_${(hash >>> 0).toString(16)}`;
}

function patientDocId(patient: FinancePatient) {
  const cpf = String(patient.cpf || "").replace(/\D/g, "");
  if (cpf) return `cpf_${cpf}`;
  return stableId(`${normalize(patient.name)}|${patient.id || ""}`);
}

export function mergeFinancePatients(base: FinancePatient[], incoming: FinancePatient[]) {
  const merged = new Map<string, FinancePatient>();
  const absorb = (patient: FinancePatient) => {
    const key = patientKey(patient);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...patient, phones: Array.from(new Set((patient.phones || []).filter(Boolean))), installments: [...(patient.installments || [])] });
      return;
    }
    const installments = new Map<string, FinanceInstallment>();
    for (const item of previous.installments || []) installments.set(installmentKey(item), item);
    for (const item of patient.installments || []) {
      const keyItem = installmentKey(item);
      const old = installments.get(keyItem);
      installments.set(keyItem, old ? { ...old, ...item } : item);
    }
    merged.set(key, {
      ...previous, ...patient, id: previous.id || patient.id, cpf: previous.cpf || patient.cpf, name: patient.name || previous.name,
      phones: Array.from(new Set([...(previous.phones || []), ...(patient.phones || [])].filter(Boolean))),
      installments: Array.from(installments.values()),
    });
  };
  base.forEach(absorb); incoming.forEach(absorb); return Array.from(merged.values());
}

export function mergeFinanceStores(base: FinanceStore | null, incoming: FinanceStore | null): FinanceStore | null {
  if (!base) return incoming;
  if (!incoming) return base;
  const receipts = new Map<string, FinanceReceipt>();
  [...(base.receipts || []), ...(incoming.receipts || [])].forEach(r => receipts.set(receiptKey(r), r));
  return {
    ...base, ...incoming, version: 1,
    receiptsFile: incoming.receiptsFile || base.receiptsFile || null,
    receiptsImportedAt: incoming.receiptsImportedAt || base.receiptsImportedAt || null,
    receiptsCount: incoming.receiptsCount ?? base.receiptsCount,
    receiptsMatched: incoming.receiptsMatched ?? base.receiptsMatched,
    receiptsAmount: incoming.receiptsAmount ?? base.receiptsAmount,
    receipts: Array.from(receipts.values()),
    patients: mergeFinancePatients(base.patients || [], incoming.patients || []),
  };
}

export function readLocalFinanceStore(clinicId: string): FinanceStore | null {
  try { const raw = localStorage.getItem(financeStoreKey(clinicId)); if (!raw) return null; const parsed = JSON.parse(raw) as FinanceStore; return parsed?.version === 1 && Array.isArray(parsed.patients) ? parsed : null; } catch { return null; }
}
export function writeLocalFinanceStore(clinicId: string, store: FinanceStore) { localStorage.setItem(financeStoreKey(clinicId), JSON.stringify(store)); }

export async function readRemoteFinanceStore(clinicId: string): Promise<FinanceStore | null> {
  const [metaSnap, patientsSnap] = await Promise.all([getDoc(doc(db, "clinics", clinicId, "financeState", "current")), getDocs(collection(db, "clinics", clinicId, "financePatients"))]);
  if (patientsSnap.empty) return null;
  const meta = metaSnap.exists() ? metaSnap.data() : {};
  const patients = patientsSnap.docs.map(snapshotDoc => snapshotDoc.data() as FinancePatient).filter(patient => patient && Array.isArray(patient.installments));
  if (!patients.length) return null;
  return { version: 1, fileName: String(meta.fileName || "Base financeira"), importedAt: String(meta.importedAt || meta.updatedAt || new Date().toISOString()), period: String(meta.period || ""), receiptsFile: meta.receiptsFile ? String(meta.receiptsFile) : null, receiptsImportedAt: meta.receiptsImportedAt ? String(meta.receiptsImportedAt) : null, receiptsCount: Number(meta.receiptsCount || 0), receiptsMatched: Number(meta.receiptsMatched || 0), receiptsAmount: Number(meta.receiptsAmount || 0), receipts: Array.isArray(meta.receipts) ? meta.receipts : [], patients };
}

export async function persistRemoteFinanceStore(clinicId: string, store: FinanceStore) {
  const nowIso = new Date().toISOString();
  await setDoc(doc(db, "clinics", clinicId, "financeState", "current"), { version: 1, fileName: store.fileName || "Base financeira", importedAt: store.importedAt || nowIso, period: store.period || "", receiptsFile: store.receiptsFile || null, receiptsImportedAt: store.receiptsImportedAt || null, receiptsCount: store.receiptsCount || 0, receiptsMatched: store.receiptsMatched || 0, receiptsAmount: store.receiptsAmount || 0, receipts: store.receipts || [], patientCount: store.patients.length, updatedAt: nowIso }, { merge: true });
  const chunkSize = 350;
  for (let start = 0; start < store.patients.length; start += chunkSize) { const batch = writeBatch(db); store.patients.slice(start, start + chunkSize).forEach(patient => { batch.set(doc(db, "clinics", clinicId, "financePatients", patientDocId(patient)), { ...patient, syncedAt: nowIso }, { merge: true }); }); await batch.commit(); }
}

export async function clearRemoteFinanceStore(clinicId: string) {
  const snapshot = await getDocs(collection(db, "clinics", clinicId, "financePatients")); const chunkSize = 350;
  for (let start = 0; start < snapshot.docs.length; start += chunkSize) { const batch = writeBatch(db); snapshot.docs.slice(start, start + chunkSize).forEach(patientDoc => batch.delete(patientDoc.ref)); await batch.commit(); }
  await deleteDoc(doc(db, "clinics", clinicId, "financeState", "current"));
}

export async function hydrateFinanceStore(clinicId: string) {
  const [remote, local] = await Promise.all([readRemoteFinanceStore(clinicId), Promise.resolve(readLocalFinanceStore(clinicId))]);
  const canonical = mergeFinanceStores(remote, local); if (!canonical) return null; writeLocalFinanceStore(clinicId, canonical);
  if (JSON.stringify(remote || null) !== JSON.stringify(canonical)) await persistRemoteFinanceStore(clinicId, canonical);
  return canonical;
}
