import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { FINANCE_SNAPSHOT_EVENT, financeSnapshotKey } from "@/components/crm/ClinicFinanceSnapshotBridge";

export function ClinicFinanceStateGuard() {
  const { currentClinic } = useAuth();

  useEffect(() => {
    if (!currentClinic) return;
    const storeKey = `clinic_finance_store_v4_${currentClinic}`;
    try {
      const hasCurrentStore = Boolean(localStorage.getItem(storeKey));
      if (!hasCurrentStore) {
        localStorage.removeItem(financeSnapshotKey(currentClinic));
        window.dispatchEvent(new CustomEvent(FINANCE_SNAPSHOT_EVENT));
      }
    } catch {
      // Sem efeito: a ausência de storage não deve quebrar a Clínica.
    }
  }, [currentClinic]);

  return null;
}
