import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  FINANCE_SNAPSHOT_EVENT,
  financeSnapshotKey,
  type ClinicFinanceDueItem,
  type ClinicFinanceSnapshot,
} from "@/components/crm/ClinicFinanceSnapshotBridge";
import { hydrateFinanceStore, type FinanceStore } from "@/lib/clinicFinanceStore";

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

export function ClinicFinanceStateGuard() {
  const { currentClinic } = useAuth();

  useEffect(() => {
    if (!currentClinic) return;
    let cancelled = false;

    void (async () => {
      try {
        const store = await hydrateFinanceStore(currentClinic);
        if (cancelled) return;

        if (!store) {
          localStorage.removeItem(financeSnapshotKey(currentClinic));
          window.dispatchEvent(new CustomEvent(FINANCE_SNAPSHOT_EVENT));
          return;
        }

        const snapshot = makeSnapshot(store);
        localStorage.setItem(financeSnapshotKey(currentClinic), JSON.stringify(snapshot));
        window.dispatchEvent(new CustomEvent(FINANCE_SNAPSHOT_EVENT, { detail: snapshot }));
      } catch (error) {
        console.error("[clinic-finance][initial-hydration]", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentClinic]);

  return null;
}
