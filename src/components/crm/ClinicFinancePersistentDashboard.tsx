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

const MANAGEMENT_CUTOFF = "2025-11-01";

function dateKey(value: string) {
  const match = String(value || "").match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

/**
 * A base histórica continua persistida no Firestore. Para a operação de cobrança,
 * porém, só entram contratos/documentos cuja emissão seja a partir de 01/11/2025.
 * O corte é por parcela/contrato, nunca por paciente: um paciente pode ter dívida
 * antiga fora da régua e, ao mesmo tempo, contratos atuais elegíveis.
 */
function operationalStore(store: FinanceStore | null): FinanceStore | null {
  if (!store) return null;
  const patients = (store.patients || [])
    .map((patient) => ({
      ...patient,
      installments: (patient.installments || []).filter((item) => {
        const emission = dateKey(item.emission);
        return Boolean(emission && emission >= MANAGEMENT_CUTOFF);
      }),
    }))
    .filter((patient) => patient.installments.length > 0);
  return { ...store, patients };
}

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

          // canonicalRef mantém o histórico completo; a tela recebe apenas a carteira
          // elegível da gestão atual. Assim não perdemos lastro antigo no Firestore.
          const mergedFull = mergeFinanceStores(canonicalRef.current, local) || local;
          const operational = operationalStore(mergedFull) || mergedFull;
          const localRaw = JSON.stringify(local);
          const operationalRaw = JSON.stringify(operational);
          const previousRaw = canonicalRef.current ? JSON.stringify(canonicalRef.current) : "";

          canonicalRef.current = mergedFull;

          if (localRaw !== operationalRaw) {
            writeLocalFinanceStore(currentClinic, operational);
            setRevision((value) => value + 1);
          }

          if (previousRaw !== JSON.stringify(mergedFull)) {
            await persistRemoteFinanceStore(currentClinic, mergedFull);
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
        const operational = operationalStore(canonical);
        if (operational) writeLocalFinanceStore(currentClinic, operational);
      } catch (error) {
        console.error("[clinic-finance][hydrate]", error);
        if (cancelled) return;
        const local = readLocalFinanceStore(currentClinic);
        canonicalRef.current = local;
        const operational = operationalStore(local);
        if (operational) writeLocalFinanceStore(currentClinic, operational);
      } finally {
        if (!cancelled) {
          readyRef.current = true;
          setRevision((value) => value + 1);
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
