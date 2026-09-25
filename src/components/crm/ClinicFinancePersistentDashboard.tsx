import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ClinicFinanceDashboardV4 } from "@/components/crm/ClinicFinanceDashboardV4";
import type { SaleItem } from "@/components/crm/ClinicSalesImportPanel";
import { FINANCE_SNAPSHOT_EVENT } from "@/components/crm/ClinicFinanceSnapshotBridge";

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

export function ClinicFinancePersistentDashboard({ salesItems = [] }: { salesItems?: SaleItem[] }) {
  const { currentClinic } = useAuth();
  const [revision, setRevision] = useState(0);
  const baselineRef = useRef<FinanceStore | null>(null);
  const reconcilingRef = useRef(false);

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
        localStorage.setItem(storeKey(currentClinic), mergedRaw);
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

  return <ClinicFinanceDashboardV4 key={`${currentClinic || "none"}-${revision}`} salesItems={salesItems} />;
}
