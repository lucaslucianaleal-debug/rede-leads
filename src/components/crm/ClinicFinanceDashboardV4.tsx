import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  FileDown,
  FileText,
  Landmark,
  MessageCircle,
  Phone,
  ReceiptText,
  Search,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { SaleItem } from "@/components/crm/ClinicSalesImportPanel";
import {
  FINANCE_SNAPSHOT_EVENT,
  financeSnapshotKey,
  type ClinicFinanceDueItem,
  type ClinicFinanceSnapshot,
} from "@/components/crm/ClinicFinanceSnapshotBridge";

type FinanceView = "overview" | "collections" | "due";
type BucketKey = "1-30" | "31-60" | "61-90" | "91-180" | "181-365" | "365+";
type BucketFilter = "all" | BucketKey;

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

type AgingBucket = {
  key: BucketKey;
  label: string;
  installments: number;
  patients: number;
  original: number;
  current: number;
};

type DueGroup = {
  patient: PatientDebt;
  installments: Installment[];
  amount: number;
};

const BUCKETS: Array<{ key: BucketKey; label: string }> = [
  { key: "1-30", label: "1–30 dias" },
  { key: "31-60", label: "31–60 dias" },
  { key: "61-90", label: "61–90 dias" },
  { key: "91-180", label: "91–180 dias" },
  { key: "181-365", label: "181–365 dias" },
  { key: "365+", label: "+1 ano" },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
const formatCurrency = (value: number) => brl.format(value || 0);
const storeKey = (clinicId: string) => `clinic_finance_store_v4_${clinicId}`;

function parseMoney(value: string) {
  let normalized = String(value || "").trim().replace(/\s/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = normalized.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBrDate(value: string) {
  const [day, month, rawYear] = String(value || "").split("/").map(Number);
  const year = rawYear && rawYear < 100 ? 2000 + rawYear : rawYear;
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysLate(value: string, now = new Date()) {
  const due = parseBrDate(value);
  if (!due) return 0;
  const today = parseBrDate(brDate(now));
  if (!today) return 0;
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
}

function bucketFor(late: number): BucketKey {
  if (late <= 30) return "1-30";
  if (late <= 60) return "31-60";
  if (late <= 90) return "61-90";
  if (late <= 180) return "91-180";
  if (late <= 365) return "181-365";
  return "365+";
}

function phoneDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function baseDocument(value: string) {
  return (String(value || "").split("/")[0] || "").replace(/\D/g, "");
}

function normalizeSearch(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function uniqueTreatments(items: SaleItem[]) {
  return Array.from(new Set(items.map((item) => item.description).filter(Boolean)));
}

function loadStore(clinicId: string | null): FinanceStore | null {
  if (!clinicId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storeKey(clinicId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FinanceStore;
    return parsed?.version === 1 && Array.isArray(parsed.patients) ? parsed : null;
  } catch {
    return null;
  }
}

function saveStore(clinicId: string, value: FinanceStore) {
  localStorage.setItem(storeKey(clinicId), JSON.stringify(value));
}

function makeSnapshot(store: FinanceStore): ClinicFinanceSnapshot {
  const today = brDate(new Date());
  const tomorrow = brDate(addDays(new Date(), 1));
  const todaySortable = dateKey(today);
  const dueToday: ClinicFinanceDueItem[] = [];
  const dueTomorrow: ClinicFinanceDueItem[] = [];
  let overdueCount = 0;
  let overdueAmount = 0;

  for (const patient of store.patients) {
    const phone = patient.phones[0] || "";
    const byToday = patient.installments.filter((item) => item.dueDate === today);
    const byTomorrow = patient.installments.filter((item) => item.dueDate === tomorrow);
    if (byToday.length) dueToday.push({
      name: patient.name,
      phone,
      document: byToday.map((item) => item.document).join(", "),
      dueDate: today,
      current: byToday.reduce((sum, item) => sum + item.current, 0),
    });
    if (byTomorrow.length) dueTomorrow.push({
      name: patient.name,
      phone,
      document: byTomorrow.map((item) => item.document).join(", "),
      dueDate: tomorrow,
      current: byTomorrow.reduce((sum, item) => sum + item.current, 0),
    });
    for (const item of patient.installments) {
      const key = dateKey(item.dueDate);
      if (key && key < todaySortable) {
        overdueCount += 1;
        overdueAmount += item.current;
      }
    }
  }

  return {
    fileName: store.fileName,
    updatedAt: store.importedAt,
    dueToday,
    dueTomorrow,
    overdueCount,
    overdueAmount,
  };
}

function SummaryCard({ title, value, helper, icon, tone = "default" }: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const toneClass = tone === "danger"
    ? "border-red-200 bg-red-50/60"
    : tone === "warning"
      ? "border-amber-200 bg-amber-50/60"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50/60"
        : "border-border bg-card";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
            <div className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
          </div>
          <div className="rounded-xl border bg-background/80 p-2.5 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClinicFinanceDashboardV4({ salesItems = [] }: { salesItems?: SaleItem[] }) {
  const { currentClinic } = useAuth();
  const [view, setView] = useState<FinanceView>("overview");
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>("1-30");
  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientDebt | null>(null);
  const [store, setStore] = useState<FinanceStore | null>(null);
  const [importing, setImporting] = useState(false);
  const collectionInputRef = useRef<HTMLInputElement | null>(null);
  const receiptsInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setStore(loadStore(currentClinic));
  }, [currentClinic]);

  useEffect(() => {
    if (!currentClinic || !store) return;
    const snapshot = makeSnapshot(store);
    try {
      localStorage.setItem(financeSnapshotKey(currentClinic), JSON.stringify(snapshot));
      window.dispatchEvent(new CustomEvent(FINANCE_SNAPSHOT_EVENT, { detail: snapshot }));
    } catch {
      // A tela financeira continua funcional mesmo se o resumo não puder ser persistido.
    }
  }, [currentClinic, store]);

  const imported = Boolean(store?.patients?.length);
  const patients = store?.patients || [];
  const allInstallments = useMemo(() => patients.flatMap((patient) => patient.installments), [patients]);
  const today = brDate(new Date());
  const tomorrow = brDate(addDays(new Date(), 1));
  const inSevenDays = dateKey(brDate(addDays(new Date(), 7)));
  const todaySortable = dateKey(today);

  const salesIndex = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    for (const item of salesItems) {
      const key = baseDocument(item.document);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [salesItems]);

  const overdueInstallments = useMemo(() => allInstallments.filter((item) => {
    const key = dateKey(item.dueDate);
    return key && key < todaySortable;
  }), [allInstallments, todaySortable]);

  const dynamicAging = useMemo<AgingBucket[]>(() => BUCKETS.map(({ key, label }) => {
    const matching: Array<{ patientId: string; item: Installment }> = [];
    for (const patient of patients) {
      for (const item of patient.installments) {
        const late = daysLate(item.dueDate);
        if (late > 0 && bucketFor(late) === key) matching.push({ patientId: patient.id, item });
      }
    }
    return {
      key,
      label,
      installments: matching.length,
      patients: new Set(matching.map((item) => item.patientId)).size,
      original: matching.reduce((sum, item) => sum + item.item.original, 0),
      current: matching.reduce((sum, item) => sum + item.item.current, 0),
    };
  }), [patients]);

  const totals = useMemo(() => ({
    patients: patients.length,
    installments: allInstallments.length,
    original: allInstallments.reduce((sum, item) => sum + item.original, 0),
    current: allInstallments.reduce((sum, item) => sum + item.current, 0),
    overdue: overdueInstallments.reduce((sum, item) => sum + item.current, 0),
  }), [patients.length, allInstallments, overdueInstallments]);

  const dueGroups = useMemo(() => {
    const group = (predicate: (item: Installment) => boolean): DueGroup[] => patients
      .map((patient) => {
        const installments = patient.installments.filter(predicate);
        return { patient, installments, amount: installments.reduce((sum, item) => sum + item.current, 0) };
      })
      .filter((row) => row.installments.length > 0)
      .sort((a, b) => b.amount - a.amount);

    return {
      today: group((item) => item.dueDate === today),
      tomorrow: group((item) => item.dueDate === tomorrow),
      nextSeven: group((item) => {
        const key = dateKey(item.dueDate);
        return Boolean(key && key > dateKey(tomorrow) && key <= inSevenDays);
      }),
    };
  }, [patients, today, tomorrow, inSevenDays]);

  const queue = useMemo(() => {
    const term = normalizeSearch(search);
    return patients
      .map((patient) => {
        const overdue = patient.installments.filter((item) => daysLate(item.dueDate) > 0);
        const matching = bucketFilter === "all"
          ? overdue
          : overdue.filter((item) => bucketFor(daysLate(item.dueDate)) === bucketFilter);
        const saleItems = patient.installments.flatMap((item) => salesIndex.get(baseDocument(item.document)) || []);
        return {
          patient,
          matching,
          saleItems,
          oldest: overdue.length ? Math.max(...overdue.map((item) => daysLate(item.dueDate))) : 0,
          amount: matching.reduce((sum, item) => sum + item.current, 0),
          searchable: normalizeSearch([patient.name, patient.cpf, ...patient.phones, ...uniqueTreatments(saleItems)].join(" ")),
        };
      })
      .filter((row) => row.matching.length > 0 && (!term || row.searchable.includes(term)))
      .sort((a, b) => b.oldest - a.oldest || b.amount - a.amount);
  }, [patients, bucketFilter, search, salesIndex]);

  async function importCollectionReport(file?: File) {
    if (!file || !currentClinic) return;
    setImporting(true);
    try {
      const parsed = await parseCollectionPdf(file);
      const installmentCount = parsed.patients.reduce((sum, patient) => sum + patient.installments.length, 0);
      if (!parsed.patients.length || !installmentCount) throw new Error("Não consegui identificar pacientes e parcelas nesse PDF.");
      const next: FinanceStore = {
        version: 1,
        fileName: file.name,
        importedAt: new Date().toISOString(),
        period: parsed.period,
        receiptsFile: store?.receiptsFile || null,
        patients: parsed.patients,
      };
      try {
        saveStore(currentClinic, next);
      } catch {
        toast.warning("O relatório foi carregado, mas o navegador não conseguiu persistir toda a base. Evite atualizar a página até a próxima importação.");
      }
      setStore(next);
      setView("overview");
      setBucketFilter("1-30");
      setSearch("");
      toast.success(`${number.format(parsed.patients.length)} pacientes e ${number.format(installmentCount)} parcelas carregados.`);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao ler o relatório de cobrança.");
    } finally {
      setImporting(false);
      if (collectionInputRef.current) collectionInputRef.current.value = "";
    }
  }

  function importReceiptsReport(file?: File) {
    if (!file || !currentClinic) return;
    const next = store ? { ...store, receiptsFile: file.name } : null;
    if (next) {
      try { saveStore(currentClinic, next); } catch { /* mantém na sessão */ }
      setStore(next);
      toast.success("Relatório de recebimentos vinculado à base financeira atual.");
    } else {
      toast.error("Importe primeiro o relatório de cobrança.");
    }
    if (receiptsInputRef.current) receiptsInputRef.current.value = "";
  }

  function clearStore() {
    if (!currentClinic || !store) return;
    if (!window.confirm("Limpar a base financeira importada desta clínica neste navegador?")) return;
    localStorage.removeItem(storeKey(currentClinic));
    localStorage.removeItem(financeSnapshotKey(currentClinic));
    setStore(null);
    setSelectedPatient(null);
    window.dispatchEvent(new CustomEvent(FINANCE_SNAPSHOT_EVENT));
    toast.success("Base financeira limpa.");
  }

  return (
    <div className="space-y-5">
      <input ref={collectionInputRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => importCollectionReport(event.target.files?.[0])} />
      <input ref={receiptsInputRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => importReceiptsReport(event.target.files?.[0])} />

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /><h2 className="font-heading text-xl font-bold">Financeiro da Clínica</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Cobrança, vencimentos e preparação dos contatos em uma única base.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-2" disabled={importing} onClick={() => collectionInputRef.current?.click()}><Upload className="h-4 w-4" />{importing ? "Lendo relatório..." : imported ? "Atualizar Cobrança" : "Importar Cobrança"}</Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => receiptsInputRef.current?.click()} disabled={!imported}><FileDown className="h-4 w-4" />Importar Recebimentos</Button>
          {imported && <Button size="sm" variant="ghost" className="gap-2 text-muted-foreground" onClick={clearStore}><Trash2 className="h-4 w-4" />Limpar base</Button>}
        </div>
      </section>

      {!imported ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <CircleDollarSign className="h-10 w-10 text-muted-foreground" />
            <div>
              <div className="text-lg font-semibold">Nenhum dado financeiro carregado</div>
              <div className="mt-1 max-w-xl text-sm text-muted-foreground">O painel não mostra valores de exemplo. Importe o relatório de cobrança para montar a carteira, vencimentos e filas reais da clínica.</div>
            </div>
            <Button className="gap-2" onClick={() => collectionInputRef.current?.click()}><Upload className="h-4 w-4" />Importar Cobrança</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/35 px-4 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{store?.fileName}</span>
            <span>Período: {store?.period || "—"}</span>
            <span>Importado: {store?.importedAt ? new Date(store.importedAt).toLocaleString("pt-BR") : "—"}</span>
            {store?.receiptsFile && <span className="font-medium text-emerald-700">Recebimentos: {store.receiptsFile}</span>}
            <span className="ml-auto rounded-full border bg-background px-2.5 py-1 font-medium">Base persistida neste navegador</span>
          </section>

          <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">
            <Button size="sm" variant={view === "overview" ? "default" : "ghost"} onClick={() => setView("overview")}>Visão geral</Button>
            <Button size="sm" variant={view === "collections" ? "default" : "ghost"} onClick={() => setView("collections")}>Cobrança</Button>
            <Button size="sm" variant={view === "due" ? "default" : "ghost"} onClick={() => setView("due")}>Vencimentos</Button>
          </div>

          {view === "overview" && (
            <div className="space-y-4">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <SummaryCard title="Saldo em aberto" value={formatCurrency(totals.current)} helper={`${number.format(totals.installments)} parcela(s)`} icon={<CircleDollarSign className="h-5 w-5" />} />
                <SummaryCard title="Já vencido" value={formatCurrency(totals.overdue)} helper={`${number.format(overdueInstallments.length)} parcela(s) atrasada(s)`} icon={<AlertTriangle className="h-5 w-5" />} tone="danger" />
                <SummaryCard title="Vence hoje" value={formatCurrency(dueGroups.today.reduce((sum, item) => sum + item.amount, 0))} helper={`${number.format(dueGroups.today.length)} paciente(s)`} icon={<CalendarClock className="h-5 w-5" />} tone="warning" />
                <SummaryCard title="Vence amanhã" value={formatCurrency(dueGroups.tomorrow.reduce((sum, item) => sum + item.amount, 0))} helper={`${number.format(dueGroups.tomorrow.length)} paciente(s)`} icon={<CalendarClock className="h-5 w-5" />} />
                <SummaryCard title="Pacientes" value={number.format(totals.patients)} helper="Na base importada" icon={<UsersRound className="h-5 w-5" />} />
              </section>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Leitura financeira de agora</CardTitle><CardDescription>O que precisa virar ação antes de abrir as filas.</CardDescription></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <Insight title="Cobrar hoje" value={dueGroups.today.length ? `${dueGroups.today.length} paciente(s) • ${formatCurrency(dueGroups.today.reduce((sum, item) => sum + item.amount, 0))}` : "Nenhum vencimento hoje"} />
                  <Insight title="Preparar amanhã" value={dueGroups.tomorrow.length ? `${dueGroups.tomorrow.length} paciente(s) • ${formatCurrency(dueGroups.tomorrow.reduce((sum, item) => sum + item.amount, 0))}` : "Nenhum vencimento amanhã"} />
                  <Insight title="Carteira em atraso" value={`${number.format(overdueInstallments.length)} parcela(s) • ${formatCurrency(totals.overdue)}`} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Carteira vencida por faixa</CardTitle><CardDescription>Somente parcelas realmente vencidas entram aqui. Vencimentos futuros não viram atraso.</CardDescription></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {dynamicAging.map((item) => <BucketCard key={item.key} item={item} onClick={() => { setBucketFilter(item.key); setView("collections"); }} />)}
                </CardContent>
              </Card>
            </div>
          )}

          {view === "collections" && (
            <CollectionQueue
              queue={queue}
              aging={dynamicAging}
              bucketFilter={bucketFilter}
              search={search}
              onBucket={setBucketFilter}
              onSearch={setSearch}
              onPatient={setSelectedPatient}
            />
          )}

          {view === "due" && (
            <div className="space-y-4">
              <DueSection title={`Vence hoje • ${today}`} rows={dueGroups.today} onPatient={setSelectedPatient} />
              <DueSection title={`Vence amanhã • ${tomorrow}`} rows={dueGroups.tomorrow} onPatient={setSelectedPatient} />
              <DueSection title="Próximos 7 dias" rows={dueGroups.nextSeven} onPatient={setSelectedPatient} />
            </div>
          )}
        </>
      )}

      {selectedPatient && <PatientDetail patient={selectedPatient} salesIndex={salesIndex} onClose={() => setSelectedPatient(null)} />}
    </div>
  );
}

function Insight({ title, value }: { title: string; value: string }) {
  return <div className="rounded-xl border bg-muted/20 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div><div className="mt-2 font-semibold">{value}</div></div>;
}

function BucketCard({ item, onClick }: { item: AgingBucket; onClick: () => void }) {
  return (
    <button className="text-left" onClick={onClick} disabled={!item.installments}>
      <Card className={`h-full transition ${item.installments ? "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md" : "opacity-55"}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">{item.label}</div><div className="mt-1 text-2xl font-bold">{formatCurrency(item.current)}</div></div><ChevronRight className="h-5 w-5 text-muted-foreground" /></div>
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span>{number.format(item.installments)} parcelas</span><span>{number.format(item.patients)} pacientes</span></div>
        </CardContent>
      </Card>
    </button>
  );
}

function CollectionQueue({ queue, aging, bucketFilter, search, onBucket, onSearch, onPatient }: {
  queue: Array<{ patient: PatientDebt; matching: Installment[]; saleItems: SaleItem[]; oldest: number; amount: number; searchable: string }>;
  aging: AgingBucket[];
  bucketFilter: BucketFilter;
  search: string;
  onBucket: (value: BucketFilter) => void;
  onSearch: (value: string) => void;
  onPatient: (patient: PatientDebt) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><CardTitle className="text-lg">Fila de cobrança</CardTitle><CardDescription className="mt-1">Atrasos reais, priorizados por idade da dívida.</CardDescription></div>
          <div className="relative w-full lg:w-[360px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Paciente, CPF, telefone ou tratamento" className="pl-9" /></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => onBucket("all")} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${bucketFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>Todos</button>
          {aging.map((item) => <button key={item.key} onClick={() => onBucket(item.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${bucketFilter === item.key ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{item.label} · {item.patients}</button>)}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-sm">
          <thead><tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3">Parcelas</th><th className="px-4 py-3 text-right">Maior atraso</th><th className="px-4 py-3 text-right">Saldo da faixa</th><th className="px-4 py-3">Tratamento</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
          <tbody>
            {queue.map((row) => {
              const phone = row.patient.phones[0] || "—";
              const wa = phoneDigits(phone);
              const treatments = uniqueTreatments(row.saleItems);
              return <tr key={row.patient.id} className="border-b hover:bg-muted/25"><td className="px-4 py-3"><button className="font-semibold hover:underline" onClick={() => onPatient(row.patient)}>{row.patient.name}</button><div className="text-xs text-muted-foreground">{row.patient.cpf}</div></td><td className="px-4 py-3">{phone}</td><td className="px-4 py-3">{row.matching.length}</td><td className="px-4 py-3 text-right font-semibold">{row.oldest} dias</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(row.amount)}</td><td className="px-4 py-3">{treatments.length ? treatments.slice(0, 2).join(" • ") : <span className="text-xs text-muted-foreground">Venda não localizada</span>}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button size="icon" variant="outline" title="Detalhes" onClick={() => onPatient(row.patient)}><FileText className="h-4 w-4" /></Button><Button size="icon" variant="outline" title="WhatsApp" disabled={!wa} onClick={() => window.open(`https://wa.me/55${wa}`, "_blank")}><MessageCircle className="h-4 w-4" /></Button></div></td></tr>;
            })}
            {!queue.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Nenhum paciente nessa fila.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function DueSection({ title, rows, onPatient }: { title: string; rows: DueGroup[]; onPatient: (patient: PatientDebt) => void }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <Card>
      <CardHeader className="border-b pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle className="text-base">{title}</CardTitle><CardDescription>{rows.length} paciente(s) • {formatCurrency(total)}</CardDescription></div></div></CardHeader>
      <CardContent className="p-0">
        {rows.length ? <div className="divide-y">{rows.map((row) => {
          const phone = row.patient.phones[0] || "";
          const wa = phoneDigits(phone);
          return <div key={`${title}-${row.patient.id}`} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_160px_140px] md:items-center"><button className="text-left" onClick={() => onPatient(row.patient)}><div className="font-semibold">{row.patient.name}</div><div className="mt-1 text-xs text-muted-foreground">{phone || "Sem telefone"} • {row.installments.length} parcela(s)</div></button><div className="font-semibold md:text-right">{formatCurrency(row.amount)}</div><div className="flex justify-end"><Button size="sm" variant="outline" className="gap-2" disabled={!wa} onClick={() => window.open(`https://wa.me/55${wa}`, "_blank")}><MessageCircle className="h-4 w-4" />WhatsApp</Button></div></div>;
        })}</div> : <div className="p-8 text-center text-sm text-muted-foreground">Nenhum vencimento nesta janela.</div>}
      </CardContent>
    </Card>
  );
}

function PatientDetail({ patient, salesIndex, onClose }: { patient: PatientDebt; salesIndex: Map<string, SaleItem[]>; onClose: () => void }) {
  const total = patient.installments.reduce((sum, item) => sum + item.current, 0);
  const overdue = patient.installments.filter((item) => daysLate(item.dueDate) > 0);
  const sales = patient.installments.flatMap((item) => salesIndex.get(baseDocument(item.document)) || []);
  const treatments = uniqueTreatments(sales);
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="h-full w-full max-w-4xl overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background/95 p-5 backdrop-blur"><div><div className="text-xs uppercase tracking-wide text-muted-foreground">Ficha financeira</div><h3 className="mt-1 text-xl font-bold">{patient.name}</h3><div className="mt-1 text-sm text-muted-foreground">CPF {patient.cpf}</div></div><Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button></div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3"><SummaryCard title="Saldo em aberto" value={formatCurrency(total)} helper={`${patient.installments.length} parcela(s)`} icon={<Banknote className="h-4 w-4" />} /><SummaryCard title="Em atraso" value={formatCurrency(overdue.reduce((sum, item) => sum + item.current, 0))} helper={`${overdue.length} parcela(s)`} icon={<AlertTriangle className="h-4 w-4" />} tone="danger" /><SummaryCard title="Tratamentos" value={String(treatments.length)} helper={treatments.slice(0, 2).join(" • ") || "Venda não localizada"} icon={<ReceiptText className="h-4 w-4" />} /></div>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Contato</CardTitle></CardHeader><CardContent>{patient.phones.length ? patient.phones.map((phone) => <div key={phone} className="flex items-center gap-2 py-1 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{phone}</div>) : <div className="text-sm text-muted-foreground">Telefone não identificado.</div>}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Parcelas</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-y bg-muted/40 text-xs uppercase text-muted-foreground"><th className="px-4 py-3 text-left">Documento</th><th className="px-4 py-3 text-left">Vencimento</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Original</th><th className="px-4 py-3 text-right">Atualizado</th></tr></thead><tbody>{[...patient.installments].sort((a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate))).map((item) => <tr key={`${item.document}-${item.dueDate}`} className="border-b"><td className="px-4 py-3 font-medium">{item.document}</td><td className="px-4 py-3">{item.dueDate}</td><td className="px-4 py-3 text-right">{daysLate(item.dueDate) ? `${daysLate(item.dueDate)} dias` : "Em dia"}</td><td className="px-4 py-3 text-right">{formatCurrency(item.original)}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.current)}</td></tr>)}</tbody></table></CardContent></Card>
        </div>
      </div>
    </div>
  );
}

async function parseCollectionPdf(file: File): Promise<{ patients: PatientDebt[]; period: string }> {
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  let pdfjs: any;
  try {
    pdfjs = await import(/* @vite-ignore */ pdfjsUrl);
  } catch {
    throw new Error("Não consegui carregar o leitor de PDF. Atualize a página e tente novamente.");
  }
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const parsed: PatientDebt[] = [];
  let current: PatientDebt | null = null;
  let period = "—";

  const finish = () => {
    if (current && current.installments.length) parsed.push(current);
    current = null;
  };

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = (content.items as any[])
      .map((item) => ({ text: String(item.str || "").trim(), x: Number(item.transform?.[4] || 0), y: Number(item.transform?.[5] || 0) }))
      .filter((item) => item.text)
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const clusters: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
    for (const item of items) {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(last.y - item.y) > 1.25) clusters.push({ y: item.y, items: [{ x: item.x, text: item.text }] });
      else last.items.push({ x: item.x, text: item.text });
    }

    const lines = clusters.map((cluster) => cluster.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim());
    if (pageNumber === 1) {
      const header = lines.join(" ");
      const match = header.match(/PER[IÍ]ODO:\s*(\d{2}\/\d{2}\/\d{4})\s+A\s+(\d{2}\/\d{2}\/\d{4})/i);
      if (match) period = `${match[1]} a ${match[2]}`;
    }

    for (const line of lines) {
      const cpf = line.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
      if (cpf) {
        const before = line.slice(0, cpf.index).replace(/CPF\.?\s*:?/gi, "").trim();
        const name = before.replace(/\s+(CPF|RG|FONE\(S\)).*$/i, "").trim();
        if (name && !/EMPRESA|PER[IÍ]ODO|RELAT[ÓO]RIO|TOTAL/i.test(name)) {
          finish();
          const phones = Array.from(new Set((line.match(/\(?\d{2}\)?\s?\d{4,5}-\d{4}/g) || []).map((phone) => phone.trim())));
          current = { id: cpf[0], name, cpf: cpf[0], phones, installments: [] };
          continue;
        }
      }
      if (!current) continue;
      const extraPhones = line.match(/\(?\d{2}\)?\s?\d{4,5}-\d{4}/g) || [];
      for (const phone of extraPhones) if (!current.phones.includes(phone.trim())) current.phones.push(phone.trim());
      const row = line.match(/(\d{1,6}\/[-\w.]+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(-?[\d,.]+)\s+(-?[\d,.]+)(?:\s+(.*))?$/);
      if (!row) continue;
      current.installments.push({ document: row[1], emission: row[2], dueDate: row[3], original: parseMoney(row[4]), current: parseMoney(row[5]), observation: row[6]?.trim() });
    }
  }
  finish();

  const merged = new Map<string, PatientDebt>();
  for (const patient of parsed) {
    const existing = merged.get(patient.cpf);
    if (!existing) {
      merged.set(patient.cpf, patient);
      continue;
    }
    existing.installments.push(...patient.installments);
    for (const phone of patient.phones) if (!existing.phones.includes(phone)) existing.phones.push(phone);
  }
  return { patients: [...merged.values()], period };
}
