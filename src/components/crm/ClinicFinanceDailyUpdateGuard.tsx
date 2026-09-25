import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, Database, ShoppingCart, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { FINANCE_SNAPSHOT_EVENT } from "@/components/crm/ClinicFinanceSnapshotBridge";

type FinanceStore = {
  version: 1;
  fileName: string;
  importedAt: string;
  period: string;
  receiptsFile?: string | null;
  receiptsImportedAt?: string | null;
  patients: unknown[];
};

type StepState = "ok" | "pending";

const storeKey = (clinicId: string) => `clinic_finance_store_v4_${clinicId}`;

function localDayKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function yesterdayLabel() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
}

function readStore(clinicId: string | null): FinanceStore | null {
  if (!clinicId || typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storeKey(clinicId)) || "null") as FinanceStore | null;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function Step({ label, state, icon }: { label: string; state: StepState; icon: React.ReactNode }) {
  const ok = state === "ok";
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      {icon}<span>{label}</span>{ok ? <CheckCircle2 className="ml-auto h-4 w-4" /> : <AlertTriangle className="ml-auto h-4 w-4" />}
    </div>
  );
}

export function ClinicFinanceDailyUpdateGuard({ onOpenData }: { onOpenData: () => void }) {
  const { currentClinic } = useAuth();
  const [store, setStore] = useState<FinanceStore | null>(() => readStore(currentClinic));
  const [salesUpdatedAt, setSalesUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const reload = () => setStore(readStore(currentClinic));
    reload();
    window.addEventListener("storage", reload);
    window.addEventListener(FINANCE_SNAPSHOT_EVENT, reload as EventListener);
    window.addEventListener("clinic-finance-snapshot-updated", reload as EventListener);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener(FINANCE_SNAPSHOT_EVENT, reload as EventListener);
      window.removeEventListener("clinic-finance-snapshot-updated", reload as EventListener);
    };
  }, [currentClinic]);

  useEffect(() => {
    if (!currentClinic) { setSalesUpdatedAt(null); return; }
    return onSnapshot(doc(db, "clinics", currentClinic, "financeState", "sales"), (snap) => {
      setSalesUpdatedAt(snap.exists() ? String(snap.data()?.updatedAt || "") || null : null);
    });
  }, [currentClinic]);

  const status = useMemo(() => {
    const today = localDayKey(new Date());
    return {
      collection: Boolean(store?.importedAt && localDayKey(store.importedAt) === today),
      sales: Boolean(salesUpdatedAt && localDayKey(salesUpdatedAt) === today),
      receipts: Boolean(store?.receiptsImportedAt && localDayKey(store.receiptsImportedAt) === today),
    };
  }, [store?.importedAt, store?.receiptsImportedAt, salesUpdatedAt]);

  const complete = status.collection && status.sales && status.receipts;

  return (
    <section className={`rounded-xl border px-4 py-3 shadow-sm ${complete ? "border-emerald-200 bg-emerald-50/60" : "border-amber-300 bg-amber-50/70"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`mt-0.5 rounded-full p-2 ${complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
            {complete ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div>
            <div className="font-semibold">{complete ? `Base financeira atualizada para a operação de hoje` : "Atualização diária pendente antes das cobranças"}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {complete ? `Movimentos de ${yesterdayLabel()} conferidos. Cobranças liberadas.` : `Confira os movimentos de ${yesterdayLabel()}. Isso evita cobrar quem pagou ontem diretamente na clínica.`}
            </div>
          </div>
        </div>
        <Button size="sm" variant={complete ? "outline" : "default"} className="shrink-0 gap-2" onClick={onOpenData}>
          <Database className="h-4 w-4" />{complete ? "Ver atualização" : "Atualizar base agora"}
        </Button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Step label="Contas a receber" state={status.collection ? "ok" : "pending"} icon={<WalletCards className="h-4 w-4" />} />
        <Step label="Vendas" state={status.sales ? "ok" : "pending"} icon={<ShoppingCart className="h-4 w-4" />} />
        <Step label="Recebimentos" state={status.receipts ? "ok" : "pending"} icon={<WalletCards className="h-4 w-4" />} />
      </div>
      {!complete && <div className="mt-2 text-xs text-amber-900">Travinha leve: o painel continua disponível para consulta, mas a pendência fica visível antes de iniciar a rotina de cobrança.</div>}
    </section>
  );
}
