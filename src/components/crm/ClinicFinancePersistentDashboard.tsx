import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ClinicFinanceDashboardV4 } from "@/components/crm/ClinicFinanceDashboardV4";
import type { SaleItem } from "@/components/crm/ClinicSalesImportPanel";
import { FINANCE_SNAPSHOT_EVENT } from "@/components/crm/ClinicFinanceSnapshotBridge";
import {
  clearRemoteFinanceStore,
  hydrateFinanceStore,
  mergeFinanceStores,
  persistRemoteFinanceStore,
  readLocalFinanceStore,
  writeLocalFinanceStore,
  type FinanceStore,
} from "@/lib/clinicFinanceStore";

export function ClinicFinancePersistentDashboard({ salesItems = [] }: { salesItems?: SaleItem[] }) {
  const { currentClinic } = useAuth();
  const [hydrating, setHydrating] = useState(true);
  const [revision, setRevision] = useState(0);
  const canonicalRef = useRef<FinanceStore | null>(null);
  const readyRef = useRef(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!currentClinic) {
      canonicalRef.current = null;
      readyRef.current = false;
      setHydrating(false);
      return;
    }

    let cancelled = false;
    readyRef.current = false;
    setHydrating(true);

    const syncChangedLocalStore = () => {
      if (!readyRef.current || syncingRef.current) return;

      void (async () => {
        syncingRef.current = true;
        try {
          const local = readLocalFinanceStore(currentClinic);

          if (!local) {
            if (canonicalRef.current) {
              canonicalRef.current = null;
              await clearRemoteFinanceStore(currentClinic);
            }
            return;
          }

          const merged = mergeFinanceStores(canonicalRef.current, local) || local;
          const localRaw = JSON.stringify(local);
          const mergedRaw = JSON.stringify(merged);
          const previousRaw = canonicalRef.current ? JSON.stringify(canonicalRef.current) : "";

          canonicalRef.current = merged;

          if (localRaw !== mergedRaw) {
            // Um novo PDF pode conter apenas parte da carteira. Recompõe a base acumulada
            // antes de atualizar a tela, sem criar ciclo de eventos.
            writeLocalFinanceStore(currentClinic, merged);
            setRevision((value) => value + 1);
          }

          if (previousRaw !== mergedRaw) {
            await persistRemoteFinanceStore(currentClinic, merged);
          }
        } catch (error) {
          console.error("[clinic-finance][persist]", error);
        } finally {
          syncingRef.current = false;
        }
      })();
    };

    const hydrate = async () => {
      try {
        const canonical = await hydrateFinanceStore(currentClinic);
        if (cancelled) return;
        canonicalRef.current = canonical;
      } catch (error) {
        console.error("[clinic-finance][hydrate]", error);
        if (cancelled) return;
        canonicalRef.current = readLocalFinanceStore(currentClinic);
      } finally {
        if (!cancelled) {
          readyRef.current = true;
          setHydrating(false);
        }
      }
    };

    window.addEventListener(FINANCE_SNAPSHOT_EVENT, syncChangedLocalStore as EventListener);
    void hydrate();

    return () => {
      cancelled = true;
      readyRef.current = false;
      window.removeEventListener(FINANCE_SNAPSHOT_EVENT, syncChangedLocalStore as EventListener);
    };
  }, [currentClinic]);

  if (!currentClinic) return null;

  if (hydrating) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-2xl border bg-card">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando a base financeira da clínica…
        </div>
      </div>
    );
  }

  return (
    <ClinicFinanceDashboardV4
      key={`${currentClinic}-${revision}`}
      salesItems={salesItems}
    />
  );
}
