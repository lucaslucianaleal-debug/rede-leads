import { useEffect, useMemo, useRef, useState } from "react";
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
type ContractFilter = "all" | "particular" | "odc" | "unknown";

function dateKey(value: string) {
  const match = String(value || "").match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function contractKind(item: { observation?: string }) {
  const text = String(item.observation || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/CONTRATO\s*ODC|\bODC\b/.test(text)) return "odc" as const;
  if (/CREDIARIO|PARTICULAR/.test(text)) return "particular" as const;
  return "unknown" as const;
}

/** Mantém histórico completo fora da tela e aplica o corte da gestão por contrato. */
function operationalStore(store: FinanceStore | null, filter: ContractFilter = "all"): FinanceStore | null {
  if (!store) return null;
  const patients = (store.patients || [])
    .map((patient) => ({
      ...patient,
      installments: (patient.installments || []).filter((item) => {
        const emission = dateKey(item.emission);
        if (!emission || emission < MANAGEMENT_CUTOFF) return false;
        return filter === "all" || contractKind(item) === filter;
      }),
    }))
    .filter((patient) => patient.installments.length > 0);
  return { ...store, patients };
}

function stats(store: FinanceStore | null) {
  const installments = store?.patients.flatMap((patient) => patient.installments) || [];
  return {
    patients: store?.patients.length || 0,
    amount: installments.reduce((sum, item) => sum + Number(item.current || 0), 0),
  };
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ClinicFinancePersistentDashboard({ salesItems = [] }: { salesItems?: SaleItem[] }) {
  const { currentClinic } = useAuth();
  const [hydrating, setHydrating] = useState(true);
  const [revision, setRevision] = useState(0);
  const [contractFilter, setContractFilter] = useState<ContractFilter>("all");
  const [canonical, setCanonical] = useState<FinanceStore | null>(null);
  const canonicalRef = useRef<FinanceStore | null>(null);
  const readyRef = useRef(false);
  const syncingRef = useRef(false);
  const filterRef = useRef<ContractFilter>("all");

  useEffect(() => { filterRef.current = contractFilter; }, [contractFilter]);

  useEffect(() => {
    if (!currentClinic) return;
    const operational = operationalStore(canonicalRef.current, contractFilter);
    if (operational) {
      writeLocalFinanceStore(currentClinic, operational);
      setRevision((value) => value + 1);
    }
  }, [contractFilter, currentClinic]);

  useEffect(() => {
    if (!currentClinic) {
      canonicalRef.current = null;
      setCanonical(null);
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
              setCanonical(null);
              await clearRemoteFinanceStore(currentClinic);
            }
            return;
          }
          const mergedFull = mergeFinanceStores(canonicalRef.current, local) || local;
          const operational = operationalStore(mergedFull, filterRef.current) || mergedFull;
          const previousRaw = canonicalRef.current ? JSON.stringify(canonicalRef.current) : "";
          canonicalRef.current = mergedFull;
          setCanonical(mergedFull);
          if (JSON.stringify(local) !== JSON.stringify(operational)) {
            writeLocalFinanceStore(currentClinic, operational);
            setRevision((value) => value + 1);
          }
          if (previousRaw !== JSON.stringify(mergedFull)) await persistRemoteFinanceStore(currentClinic, mergedFull);
        } catch (error) {
          console.error("[clinic-finance][persist]", error);
        } finally {
          syncingRef.current = false;
        }
      })();
    };

    const hydrate = async () => {
      try {
        const full = await hydrateFinanceStore(currentClinic);
        if (cancelled) return;
        canonicalRef.current = full;
        setCanonical(full);
        const operational = operationalStore(full, filterRef.current);
        if (operational) writeLocalFinanceStore(currentClinic, operational);
      } catch (error) {
        console.error("[clinic-finance][hydrate]", error);
        if (cancelled) return;
        const local = readLocalFinanceStore(currentClinic);
        canonicalRef.current = local;
        setCanonical(local);
        const operational = operationalStore(local, filterRef.current);
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

  const filterStats = useMemo(() => ({
    all: stats(operationalStore(canonical, "all")),
    particular: stats(operationalStore(canonical, "particular")),
    odc: stats(operationalStore(canonical, "odc")),
    unknown: stats(operationalStore(canonical, "unknown")),
  }), [canonical]);

  if (!currentClinic) return null;
  if (hydrating) return <div className="flex min-h-[260px] items-center justify-center rounded-2xl border bg-card"><div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando a base financeira da clínica…</div></div>;

  const filters: Array<{ key: ContractFilter; label: string }> = [
    { key: "all", label: "Todos" },
    { key: "particular", label: "Particular" },
    { key: "odc", label: "Planinho ODC" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Carteira</span>
        {filters.map(({ key, label }) => {
          const info = filterStats[key];
          return <button key={key} onClick={() => setContractFilter(key)} className={`rounded-lg border px-3 py-2 text-left text-xs transition ${contractFilter === key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/40"}`}><span className="font-semibold">{label}</span><span className="ml-2 opacity-80">{info.patients} pac. · {money.format(info.amount)}</span></button>;
        })}
        {filterStats.unknown.patients > 0 && <button onClick={() => setContractFilter("unknown")} className={`rounded-lg border px-3 py-2 text-xs ${contractFilter === "unknown" ? "border-amber-500 bg-amber-500 text-white" : "border-amber-300 bg-amber-50 text-amber-800"}`}><span className="font-semibold">Não identificado</span><span className="ml-2">{filterStats.unknown.patients} pac.</span></button>}
        <span className="ml-auto px-2 text-xs text-muted-foreground">Corte da gestão: 01/11/2025</span>
      </div>
      <ClinicFinanceDashboardV4 key={`${currentClinic}-${revision}-${contractFilter}`} salesItems={salesItems} />
    </div>
  );
}
