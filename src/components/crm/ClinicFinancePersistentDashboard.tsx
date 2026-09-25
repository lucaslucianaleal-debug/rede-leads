import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { useAuth } from "@/hooks/useAuth";
import { ClinicFinanceDashboardV4 } from "@/components/crm/ClinicFinanceDashboardV4";
import type { SaleItem } from "@/components/crm/ClinicSalesImportPanel";
import { FINANCE_SNAPSHOT_EVENT } from "@/components/crm/ClinicFinanceSnapshotBridge";
import { db, storage } from "@/lib/firebase";
import { toast } from "sonner";

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
  receiptsStoragePath?: string | null;
  receiptsImportedAt?: string | null;
  receiptsSize?: number | null;
  patients: PatientDebt[];
};

type ReceiptsMeta = {
  fileName: string;
  storagePath: string;
  importedAt: string;
  size: number;
  contentType: string;
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
      installments: Array.from(installments.values()).sort((a, b) => {
        const [ad = 0, am = 0, ay = 0] = String(a.dueDate || "").split("/").map(Number);
        const [bd = 0, bm = 0, by = 0] = String(b.dueDate || "").split("/").map(Number);
        return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
      }),
    });
  };

  base.forEach(absorb);
  incoming.forEach(absorb);
  return Array.from(merged.values());
}

function mergeStores(base: FinanceStore | null, incoming: FinanceStore): FinanceStore {
  if (!base?.patients?.length) return incoming;
  return {
    ...base,
    ...incoming,
    version: 1,
    receiptsFile: incoming.receiptsFile || base.receiptsFile || null,
    receiptsStoragePath: incoming.receiptsStoragePath || base.receiptsStoragePath || null,
    receiptsImportedAt: incoming.receiptsImportedAt || base.receiptsImportedAt || null,
    receiptsSize: incoming.receiptsSize ?? base.receiptsSize ?? null,
    patients: mergePatients(base.patients || [], incoming.patients || []),
  };
}

function readStore(clinicId: string): FinanceStore | null {
  try {
    const raw = localStorage.getItem(storeKey(clinicId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FinanceStore;
    return parsed?.version === 1 && Array.isArray(parsed.patients) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStore(clinicId: string, store: FinanceStore) {
  localStorage.setItem(storeKey(clinicId), JSON.stringify(store));
}

export function ClinicFinancePersistentDashboard({ salesItems = [] }: { salesItems?: SaleItem[] }) {
  const { currentClinic } = useAuth();
  const [revision, setRevision] = useState(0);
  const baselineRef = useRef<FinanceStore | null>(null);
  const reconcilingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const uploadingReceiptRef = useRef(false);

  useEffect(() => {
    if (!currentClinic) return;
    baselineRef.current = readStore(currentClinic);

    const reconcile = () => {
      if (reconcilingRef.current) return;
      const latest = readStore(currentClinic);

      // "Limpar base" é a única ação que zera explicitamente o acumulado.
      if (!latest) {
        baselineRef.current = null;
        return;
      }

      const merged = mergeStores(baselineRef.current, latest);
      const latestRaw = JSON.stringify(latest);
      const mergedRaw = JSON.stringify(merged);
      baselineRef.current = merged;

      if (latestRaw === mergedRaw) return;

      reconcilingRef.current = true;
      try {
        writeStore(currentClinic, merged);
        setRevision((value) => value + 1);
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent(FINANCE_SNAPSHOT_EVENT));
          reconcilingRef.current = false;
        }, 0);
      } catch {
        reconcilingRef.current = false;
      }
    };

    window.addEventListener(FINANCE_SNAPSHOT_EVENT, reconcile as EventListener);
    return () => window.removeEventListener(FINANCE_SNAPSHOT_EVENT, reconcile as EventListener);
  }, [currentClinic]);

  // Recupera o último relatório de recebimentos salvo na nuvem, mesmo em outro acesso/origem.
  useEffect(() => {
    if (!currentClinic) return;
    const metaRef = doc(db, "clinics", currentClinic, "financeImports", "receipts_current");
    return onSnapshot(metaRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const meta = snapshot.data() as ReceiptsMeta;
      const current = readStore(currentClinic);
      if (!current?.patients?.length) return;

      const alreadySynced = current.receiptsFile === meta.fileName
        && current.receiptsStoragePath === meta.storagePath
        && current.receiptsImportedAt === meta.importedAt;
      if (alreadySynced) return;

      const next: FinanceStore = {
        ...current,
        receiptsFile: meta.fileName,
        receiptsStoragePath: meta.storagePath,
        receiptsImportedAt: meta.importedAt,
        receiptsSize: meta.size,
      };
      writeStore(currentClinic, next);
      baselineRef.current = mergeStores(baselineRef.current, next);
      setRevision((value) => value + 1);
      window.dispatchEvent(new CustomEvent(FINANCE_SNAPSHOT_EVENT));
    });
  }, [currentClinic]);

  async function persistReceiptsFile(file: File) {
    if (!currentClinic || uploadingReceiptRef.current) return;
    uploadingReceiptRef.current = true;
    const importedAt = new Date().toISOString();
    const path = `clinics/${currentClinic}/finance/receipts/current.pdf`;

    try {
      await uploadBytes(storageRef(storage, path), file, {
        contentType: file.type || "application/pdf",
        customMetadata: {
          originalName: file.name,
          clinicId: currentClinic,
          importedAt,
        },
      });

      const meta: ReceiptsMeta = {
        fileName: file.name,
        storagePath: path,
        importedAt,
        size: file.size,
        contentType: file.type || "application/pdf",
      };
      await setDoc(doc(db, "clinics", currentClinic, "financeImports", "receipts_current"), meta, { merge: true });

      const current = readStore(currentClinic);
      if (current?.patients?.length) {
        const next: FinanceStore = {
          ...current,
          receiptsFile: file.name,
          receiptsStoragePath: path,
          receiptsImportedAt: importedAt,
          receiptsSize: file.size,
        };
        writeStore(currentClinic, next);
        baselineRef.current = mergeStores(baselineRef.current, next);
        setRevision((value) => value + 1);
      }

      toast.success("Relatório de recebimentos salvo no Firebase e vinculado à clínica.");
    } catch (error) {
      console.error("[finance-receipts-persist]", error);
      toast.error("O relatório foi lido nesta sessão, mas não consegui salvá-lo no Firebase. Verifique a permissão do Storage.");
    } finally {
      uploadingReceiptRef.current = false;
    }
  }

  // O Dashboard possui dois inputs PDF ocultos: Cobrança e Recebimentos.
  // Capturamos somente o segundo para persistir o arquivo bruto na nuvem.
  function handleFileChangeCapture(event: React.ChangeEvent<HTMLDivElement>) {
    const input = event.target as HTMLInputElement;
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
    const inputs = Array.from(rootRef.current?.querySelectorAll<HTMLInputElement>('input[type="file"]') || []);
    const receiptsInput = inputs[inputs.length - 1];
    if (input !== receiptsInput) return;
    const file = input.files?.[0];
    if (file) void persistReceiptsFile(file);
  }

  return (
    <div ref={rootRef} onChangeCapture={handleFileChangeCapture}>
      <ClinicFinanceDashboardV4 key={`${currentClinic || "none"}-${revision}`} salesItems={salesItems} />
    </div>
  );
}
