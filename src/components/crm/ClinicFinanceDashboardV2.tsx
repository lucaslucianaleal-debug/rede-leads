import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileDown,
  FileText,
  Landmark,
  Link2,
  MessageCircle,
  Phone,
  ReceiptText,
  RotateCcw,
  Search,
  Unlink,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { SaleItem } from "@/components/crm/ClinicSalesImportPanel";

type FinanceView = "overview" | "collections" | "patients";
type BucketKey = "1-30" | "31-60" | "61-90" | "91-180" | "181-365" | "365+";
type BucketFilter = "all" | BucketKey;
type CollectionStatus = "pending" | "sent" | "no_response" | "promised" | "negotiating" | "settled";

type Installment = {
  document: string;
  emission: string;
  dueDate: string;
  original: number;
  current: number;
  observation?: string;
  daysLate: number;
  bucket: BucketKey;
};

type PatientDebt = {
  id: string;
  name: string;
  cpf: string;
  phones: string[];
  rawLines: string[];
  installments: Installment[];
};

type AgingBucket = {
  key: BucketKey;
  label: string;
  installments: number;
  patients: number;
  original: number;
  current: number;
};

type ImportedReport = {
  patients: PatientDebt[];
  reportDate: Date;
  period: string;
};

type ManualSettlements = Record<string, string>;
type PatientOps = {
  status: CollectionStatus;
  returnDate?: string;
  lastMessageAt?: string;
};
type PatientOpsMap = Record<string, PatientOps>;

type QueueRow = {
  patient: PatientDebt;
  allItems: Installment[];
  matchingItems: Installment[];
  saleItems: SaleItem[];
  hasSale: boolean;
  current: number;
  original: number;
  oldest: number;
  firstDue: string;
  lastDue: string;
  treatments: string[];
  status: CollectionStatus;
  returnDate?: string;
  searchable: string;
};

const SNAPSHOT = {
  source: "Aguardando importação",
  period: "—",
  generatedAt: "—",
  patients: 0,
  installments: 0,
  original: 0,
  current: 0,
};

const COLLECTION_CUTOFF = new Date(2025, 10, 1, 12, 0, 0);
const COLLECTION_CUTOFF_LABEL = "01/11/2025";
const SETTLEMENT_STORAGE_KEY = "clinic-finance-manual-settlements-v2";
const OPS_STORAGE_KEY = "clinic-finance-patient-ops-v1";

const BUCKETS: Array<{ key: BucketKey; label: string }> = [
  { key: "1-30", label: "1–30 dias" },
  { key: "31-60", label: "31–60 dias" },
  { key: "61-90", label: "61–90 dias" },
  { key: "91-180", label: "91–180 dias" },
  { key: "181-365", label: "181–365 dias" },
  { key: "365+", label: "+1 ano" },
];

const EMPTY_AGING: AgingBucket[] = BUCKETS.map((bucket) => ({
  ...bucket,
  installments: 0,
  patients: 0,
  original: 0,
  current: 0,
}));

const STATUS_LABELS: Record<CollectionStatus, string> = {
  pending: "Pendente",
  sent: "Mensagem enviada",
  no_response: "Sem resposta",
  promised: "Prometeu pagar",
  negotiating: "Em negociação",
  settled: "Regularizado",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
const formatCurrency = (value: number) => brl.format(value || 0);

function parseMoney(value: string) {
  let normalized = value.trim().replace(/\s/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = normalized.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBrDate(value: string) {
  const [day, month, rawYear] = value.split("/").map(Number);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isOperationalInstallment(item: Installment) {
  const emission = parseBrDate(item.emission);
  return Boolean(emission && emission.getTime() >= COLLECTION_CUTOFF.getTime());
}

function bucketFor(daysLate: number): BucketKey {
  if (daysLate <= 30) return "1-30";
  if (daysLate <= 60) return "31-60";
  if (daysLate <= 90) return "61-90";
  if (daysLate <= 180) return "91-180";
  if (daysLate <= 365) return "181-365";
  return "365+";
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function baseDocument(value: string) {
  return (value.split("/")[0] || "").replace(/\D/g, "");
}

function installmentKey(item: Installment) {
  return `${item.document}|${item.dueDate}`;
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function uniqueDescriptions(items: SaleItem[]) {
  return Array.from(new Set(items.map((item) => item.description).filter(Boolean)));
}

function sortByDueDate(items: Installment[]) {
  return [...items].sort((a, b) => (parseBrDate(a.dueDate)?.getTime() || 0) - (parseBrDate(b.dueDate)?.getTime() || 0));
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildCollectionMessage(patient: PatientDebt, openItems: Installment[]) {
  const sorted = sortByDueDate(openItems);
  const total = sorted.reduce((sum, item) => sum + item.current, 0);
  const oldest = sorted.length ? Math.max(...sorted.map((item) => item.daysLate)) : 0;
  const dates = Array.from(new Set(sorted.map((item) => item.dueDate)));
  const dateText = dates.length === 1
    ? dates[0]
    : dates.length === 2
      ? `${dates[0]} e ${dates[1]}`
      : `${dates[0]}, ${dates[1]} e mais ${dates.length - 2}`;
  const parcelText = sorted.length === 1 ? "uma parcela" : `${sorted.length} parcelas`;
  const name = firstName(patient.name);

  if (oldest <= 30) {
    return `Olá, ${name}, tudo bem? Aqui é do financeiro da OdontoCompany Olímpia. Identificamos ${parcelText} do seu contrato, com vencimento${dates.length > 1 ? "s" : ""} em ${dateText}, que ainda consta${sorted.length > 1 ? "m" : ""} em aberto. O saldo atualizado é de ${formatCurrency(total)}. Posso te ajudar com a regularização por aqui?`;
  }
  if (oldest <= 60) {
    return `Olá, ${name}, tudo bem? Aqui é do financeiro da OdontoCompany Olímpia. Consta em nosso sistema ${parcelText} do seu contrato em aberto, com vencimento${dates.length > 1 ? "s" : ""} em ${dateText}. O saldo atualizado é de ${formatCurrency(total)}. Podemos regularizar essa pendência por aqui?`;
  }
  return `Olá, ${name}. Aqui é do financeiro da OdontoCompany Olímpia. Identificamos ${parcelText} do seu contrato ainda em aberto, com saldo atualizado de ${formatCurrency(total)}. Pedimos, por gentileza, que nos retorne por aqui para verificarmos a regularização.`;
}

function StatusBadge({ status }: { status: CollectionStatus }) {
  const className = status === "promised"
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : status === "negotiating"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : status === "sent"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : status === "no_response"
          ? "border-slate-200 bg-slate-50 text-slate-700"
          : status === "settled"
            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
            : "border-border bg-background text-muted-foreground";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${className}`}>{STATUS_LABELS[status]}</span>;
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

export function ClinicFinanceDashboardV2({ salesItems = [] }: { salesItems?: SaleItem[] }) {
  const [view, setView] = useState<FinanceView>("collections");
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>("1-30");
  const [selectedPatient, setSelectedPatient] = useState<PatientDebt | null>(null);
  const [search, setSearch] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<PatientDebt[]>([]);
  const [collectionFile, setCollectionFile] = useState<string | null>(null);
  const [receiptsFile, setReceiptsFile] = useState<string | null>(null);
  const [period, setPeriod] = useState(SNAPSHOT.period);
  const [importing, setImporting] = useState(false);
  const [ignoredBeforeCutoff, setIgnoredBeforeCutoff] = useState(0);
  const [manualSettlements, setManualSettlements] = useState<ManualSettlements>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.sessionStorage.getItem(SETTLEMENT_STORAGE_KEY) || "{}") as ManualSettlements;
    } catch {
      return {};
    }
  });
  const [patientOps, setPatientOps] = useState<PatientOpsMap>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.sessionStorage.getItem(OPS_STORAGE_KEY) || "{}") as PatientOpsMap;
    } catch {
      return {};
    }
  });
  const collectionInputRef = useRef<HTMLInputElement | null>(null);
  const receiptsInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try { window.sessionStorage.setItem(SETTLEMENT_STORAGE_KEY, JSON.stringify(manualSettlements)); } catch { /* preview */ }
  }, [manualSettlements]);

  useEffect(() => {
    try { window.sessionStorage.setItem(OPS_STORAGE_KEY, JSON.stringify(patientOps)); } catch { /* preview */ }
  }, [patientOps]);

  const imported = patients.length > 0;

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

  const activePatients = useMemo(() => {
    return patients
      .map((patient) => ({
        ...patient,
        installments: patient.installments.filter((item) => !manualSettlements[installmentKey(item)]),
      }))
      .filter((patient) => patient.installments.length > 0);
  }, [manualSettlements, patients]);

  const dynamicAging = useMemo(() => {
    if (!imported) return EMPTY_AGING;
    return BUCKETS.map(({ key, label }) => {
      const matches = activePatients
        .flatMap((patient) => patient.installments.map((item) => ({ patientId: patient.id, item })))
        .filter(({ item }) => item.bucket === key);
      return {
        key,
        label,
        installments: matches.length,
        patients: new Set(matches.map((match) => match.patientId)).size,
        original: matches.reduce((sum, match) => sum + match.item.original, 0),
        current: matches.reduce((sum, match) => sum + match.item.current, 0),
      };
    });
  }, [activePatients, imported]);

  const totals = useMemo(() => {
    if (!imported) return SNAPSHOT;
    const installments = activePatients.flatMap((patient) => patient.installments);
    return {
      ...SNAPSHOT,
      source: collectionFile || "Relatório importado",
      period,
      generatedAt: "importado agora",
      patients: activePatients.length,
      installments: installments.length,
      original: installments.reduce((sum, item) => sum + item.original, 0),
      current: installments.reduce((sum, item) => sum + item.current, 0),
    };
  }, [activePatients, collectionFile, imported, period]);

  const manualSettlementMetrics = useMemo(() => {
    const settledItems = patients.flatMap((patient) => patient.installments).filter((item) => manualSettlements[installmentKey(item)]);
    return {
      count: settledItems.length,
      value: settledItems.reduce((sum, item) => sum + item.current, 0),
    };
  }, [manualSettlements, patients]);

  const metrics = useMemo(() => {
    const increase = totals.current - totals.original;
    const increasePct = totals.original > 0 ? (increase / totals.original) * 100 : 0;
    return { increase, increasePct };
  }, [totals]);

  const reconciliation = useMemo(() => {
    if (!imported) return { totalDocs: 0, matchedDocs: 0, unmatchedDocs: 0, matchedBalance: 0, percentage: 0 };
    const allInstallments = activePatients.flatMap((patient) => patient.installments);
    const docSet = new Set(allInstallments.map((item) => baseDocument(item.document)).filter(Boolean));
    const matched = [...docSet].filter((doc) => salesIndex.has(doc));
    const matchedBalance = allInstallments
      .filter((item) => salesIndex.has(baseDocument(item.document)))
      .reduce((sum, item) => sum + item.current, 0);
    return {
      totalDocs: docSet.size,
      matchedDocs: matched.length,
      unmatchedDocs: Math.max(0, docSet.size - matched.length),
      matchedBalance,
      percentage: docSet.size ? (matched.length / docSet.size) * 100 : 0,
    };
  }, [activePatients, imported, salesIndex]);

  const queue = useMemo<QueueRow[]>(() => {
    if (!imported) return [];
    const term = normalizeSearch(search);
    return activePatients
      .filter((patient) => bucketFilter === "all" || patient.installments.some((item) => item.bucket === bucketFilter))
      .map((patient) => {
        const allItems = sortByDueDate(patient.installments);
        const matchingItems = bucketFilter === "all" ? allItems : allItems.filter((item) => item.bucket === bucketFilter);
        const saleItems = allItems.flatMap((item) => salesIndex.get(baseDocument(item.document)) || []);
        const treatments = uniqueDescriptions(saleItems);
        const ops = patientOps[patient.id] || { status: "pending" as CollectionStatus };
        const searchable = normalizeSearch([
          patient.name,
          patient.cpf,
          ...patient.phones,
          ...allItems.map((item) => item.document),
          ...treatments,
          STATUS_LABELS[ops.status],
        ].join(" "));
        return {
          patient,
          allItems,
          matchingItems,
          saleItems,
          hasSale: saleItems.length > 0,
          current: allItems.reduce((sum, item) => sum + item.current, 0),
          original: allItems.reduce((sum, item) => sum + item.original, 0),
          oldest: Math.max(...allItems.map((item) => item.daysLate)),
          firstDue: allItems[0]?.dueDate || "—",
          lastDue: allItems[allItems.length - 1]?.dueDate || "—",
          treatments,
          status: ops.status,
          returnDate: ops.returnDate,
          searchable,
        };
      })
      .filter((row) => !term || row.searchable.includes(term))
      .sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return b.oldest - a.oldest;
      });
  }, [activePatients, bucketFilter, imported, patientOps, salesIndex, search]);

  const patientSearchResults = useMemo(() => {
    const term = normalizeSearch(patientSearch);
    if (!imported || term.length < 2) return [];
    return patients
      .filter((patient) => normalizeSearch(patient.name).includes(term))
      .map((patient) => {
        const openItems = patient.installments.filter((item) => !manualSettlements[installmentKey(item)]);
        const settledItems = patient.installments.filter((item) => manualSettlements[installmentKey(item)]);
        return {
          patient,
          current: openItems.reduce((sum, item) => sum + item.current, 0),
          oldest: openItems.length ? Math.max(...openItems.map((item) => item.daysLate)) : 0,
          installments: openItems.length,
          settled: settledItems.length,
        };
      })
      .sort((a, b) => a.patient.name.localeCompare(b.patient.name, "pt-BR"));
  }, [imported, manualSettlements, patientSearch, patients]);

  const workMetrics = useMemo(() => {
    const today = localDateKey();
    const rows = activePatients.map((patient) => ({ patient, ops: patientOps[patient.id] || { status: "pending" as CollectionStatus } }));
    return {
      pending: rows.filter(({ ops }) => ops.status === "pending").length,
      sent: rows.filter(({ ops }) => ops.status === "sent").length,
      returns: rows.filter(({ ops }) => ops.returnDate === today).length,
      promises: rows.filter(({ ops }) => ops.status === "promised").length,
    };
  }, [activePatients, patientOps]);

  function updatePatientOps(patientId: string, patch: Partial<PatientOps>) {
    setPatientOps((current) => ({
      ...current,
      [patientId]: { status: current[patientId]?.status || "pending", ...current[patientId], ...patch },
    }));
  }

  function settleInstallment(patient: PatientDebt, item: Installment) {
    const key = installmentKey(item);
    if (manualSettlements[key]) return;
    if (!window.confirm(`Confirmar baixa manual da parcela ${item.document} no valor atualizado de ${formatCurrency(item.current)}?`)) return;
    setManualSettlements((current) => ({ ...current, [key]: new Date().toISOString() }));
    const remaining = patient.installments.filter((candidate) => !manualSettlements[installmentKey(candidate)] && installmentKey(candidate) !== key);
    if (!remaining.length) updatePatientOps(patient.id, { status: "settled" });
    toast.success(`Parcela ${item.document} baixada no Rede Leads.`);
  }

  function settleAll(patient: PatientDebt) {
    const openItems = patient.installments.filter((item) => !manualSettlements[installmentKey(item)]);
    if (!openItems.length) return;
    const total = openItems.reduce((sum, item) => sum + item.current, 0);
    if (!window.confirm(`Confirmar baixa de ${openItems.length} parcela(s), totalizando ${formatCurrency(total)}?`)) return;
    const now = new Date().toISOString();
    setManualSettlements((current) => {
      const next = { ...current };
      for (const item of openItems) next[installmentKey(item)] = now;
      return next;
    });
    updatePatientOps(patient.id, { status: "settled" });
    toast.success(`${openItems.length} parcela(s) baixada(s).`);
  }

  function undoSettlement(patient: PatientDebt, item: Installment) {
    const key = installmentKey(item);
    setManualSettlements((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (patientOps[patient.id]?.status === "settled") updatePatientOps(patient.id, { status: "pending" });
    toast.success(`Baixa da parcela ${item.document} desfeita.`);
  }

  async function importCollectionReport(file?: File) {
    if (!file) return;
    setImporting(true);
    setCollectionFile(file.name);
    try {
      const parsed = await parseCollectionPdf(file);
      const allInstallments = parsed.patients.flatMap((patient) => patient.installments);
      const eligiblePatients = parsed.patients
        .map((patient) => ({ ...patient, installments: patient.installments.filter(isOperationalInstallment) }))
        .filter((patient) => patient.installments.length > 0);
      const eligibleInstallments = eligiblePatients.reduce((sum, patient) => sum + patient.installments.length, 0);
      const ignored = Math.max(0, allInstallments.length - eligibleInstallments);
      if (!eligiblePatients.length || !eligibleInstallments) throw new Error(`Não encontrei cobranças com emissão a partir de ${COLLECTION_CUTOFF_LABEL}.`);

      setPatients(eligiblePatients);
      setIgnoredBeforeCutoff(ignored);
      setPatientSearch("");
      setSearch("");
      setPeriod(parsed.period);
      setView("collections");
      setBucketFilter("1-30");
      toast.success(`${number.format(eligiblePatients.length)} pacientes e ${number.format(eligibleInstallments)} parcelas na carteira operacional. ${number.format(ignored)} parcelas antigas foram ocultadas.`);
    } catch (error: any) {
      setPatients([]);
      setIgnoredBeforeCutoff(0);
      setPatientSearch("");
      setSearch("");
      setCollectionFile(null);
      setPeriod(SNAPSHOT.period);
      toast.error(error?.message || "Falha ao ler o relatório de cobrança.");
    } finally {
      setImporting(false);
      if (collectionInputRef.current) collectionInputRef.current.value = "";
    }
  }

  function importReceiptsReport(file?: File) {
    if (!file) return;
    setReceiptsFile(file.name);
    toast.success("Relatório de recebimentos selecionado. A conciliação automática entra na próxima etapa.");
    if (receiptsInputRef.current) receiptsInputRef.current.value = "";
  }

  return (
    <div className="space-y-5">
      <input ref={collectionInputRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => importCollectionReport(event.target.files?.[0])} />
      <input ref={receiptsInputRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => importReceiptsReport(event.target.files?.[0])} />

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /><h2 className="font-heading text-xl font-bold">Financeiro da Clínica</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Mesa de cobrança, conciliação com vendas e acompanhamento de recebimentos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-2" disabled={importing} onClick={() => collectionInputRef.current?.click()}><Upload className="h-4 w-4" />{importing ? "Lendo relatório..." : imported ? "Atualizar Cobrança" : "Importar Cobrança"}</Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => receiptsInputRef.current?.click()}><FileDown className="h-4 w-4" />Importar Recebimentos</Button>
          <Button size="sm" variant={view === "collections" ? "default" : "ghost"} onClick={() => setView("collections")}>Cobrança</Button>
          <Button size="sm" variant={view === "patients" ? "default" : "ghost"} onClick={() => setView("patients")}>Pacientes</Button>
          <Button size="sm" variant={view === "overview" ? "default" : "ghost"} onClick={() => setView("overview")}>Visão geral</Button>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/35 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Cobrança: {collectionFile || "nenhum relatório importado"}</span>
        <span>Período: {imported ? period : "—"}</span>
        {imported && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">Emissão a partir de {COLLECTION_CUTOFF_LABEL}</span>}
        {ignoredBeforeCutoff > 0 && <span>{number.format(ignoredBeforeCutoff)} parcelas antigas ocultadas</span>}
        {salesItems.length > 0 && <span className="font-medium text-emerald-700">Base de vendas: {number.format(new Set(salesItems.map((item) => item.document)).size)} DOCs</span>}
        {receiptsFile && <span className="font-medium text-emerald-700">Recebimentos: {receiptsFile}</span>}
        <span className="ml-auto rounded-full border bg-background px-2.5 py-1 font-medium">Preview: dados e ações ficam neste navegador</span>
      </section>

      {!imported ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard title="Saldo em cobrança" value={formatCurrency(0)} helper="Aguardando importação" icon={<CircleDollarSign className="h-5 w-5" />} />
            <SummaryCard title="Valor original" value={formatCurrency(0)} helper="Aguardando importação" icon={<Banknote className="h-5 w-5" />} />
            <SummaryCard title="Acréscimos" value={formatCurrency(0)} helper="Aguardando importação" icon={<ReceiptText className="h-5 w-5" />} />
            <SummaryCard title="Pacientes" value="0" helper="Aguardando importação" icon={<UsersRound className="h-5 w-5" />} />
            <SummaryCard title="Parcelas" value="0" helper="Aguardando importação" icon={<CalendarClock className="h-5 w-5" />} />
          </section>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
              <CircleDollarSign className="h-9 w-9 text-muted-foreground" />
              <div><div className="font-semibold">Importe o relatório de cobrança para iniciar</div><div className="mt-1 text-sm text-muted-foreground">Até a importação, o financeiro permanece zerado. A base de vendas não cria cobranças sozinha.</div></div>
              <Button className="gap-2" onClick={() => collectionInputRef.current?.click()}><Upload className="h-4 w-4" />Importar Cobrança</Button>
            </CardContent>
          </Card>
        </>
      ) : view === "collections" ? (
        <CollectionWorkbench
          queue={queue}
          bucketFilter={bucketFilter}
          aging={dynamicAging}
          search={search}
          workMetrics={workMetrics}
          totals={totals}
          settlementMetrics={manualSettlementMetrics}
          onBucket={setBucketFilter}
          onSearch={setSearch}
          onPatient={setSelectedPatient}
        />
      ) : view === "patients" ? (
        <PatientDirectory patients={patients} search={patientSearch} results={patientSearchResults} onSearch={setPatientSearch} onPatient={setSelectedPatient} />
      ) : (
        <Overview
          totals={totals}
          metrics={metrics}
          aging={dynamicAging}
          reconciliation={reconciliation}
          salesLoaded={salesItems.length > 0}
          settlementMetrics={manualSettlementMetrics}
          onBucket={(bucket) => { setBucketFilter(bucket); setView("collections"); }}
        />
      )}

      {selectedPatient && (
        <PatientDetail
          patient={selectedPatient}
          salesIndex={salesIndex}
          manualSettlements={manualSettlements}
          ops={patientOps[selectedPatient.id] || { status: "pending" }}
          onUpdateOps={(patch) => updatePatientOps(selectedPatient.id, patch)}
          onSettle={(item) => settleInstallment(selectedPatient, item)}
          onSettleAll={() => settleAll(selectedPatient)}
          onUndoSettlement={(item) => undoSettlement(selectedPatient, item)}
          onClose={() => setSelectedPatient(null)}
        />
      )}
    </div>
  );
}

function CollectionWorkbench({ queue, bucketFilter, aging, search, workMetrics, totals, settlementMetrics, onBucket, onSearch, onPatient }: {
  queue: QueueRow[];
  bucketFilter: BucketFilter;
  aging: AgingBucket[];
  search: string;
  workMetrics: { pending: number; sent: number; returns: number; promises: number };
  totals: typeof SNAPSHOT;
  settlementMetrics: { count: number; value: number };
  onBucket: (bucket: BucketFilter) => void;
  onSearch: (value: string) => void;
  onPatient: (patient: PatientDebt) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="Pendentes" value={number.format(workMetrics.pending)} helper="Ainda sem ação registrada" />
        <MiniMetric label="Mensagens enviadas" value={number.format(workMetrics.sent)} helper="Contato já iniciado" success />
        <MiniMetric label="Retornos hoje" value={number.format(workMetrics.returns)} helper="Pacientes para retomar hoje" warning={workMetrics.returns > 0} />
        <MiniMetric label="Promessas de pagamento" value={number.format(workMetrics.promises)} helper="Acompanhar até a baixa" success />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Saldo aberto" value={formatCurrency(totals.current)} helper="Carteira operacional" icon={<CircleDollarSign className="h-5 w-5" />} tone="danger" />
        <SummaryCard title="Pacientes" value={number.format(totals.patients)} helper="Com saldo em aberto" icon={<UsersRound className="h-5 w-5" />} />
        <SummaryCard title="Parcelas" value={number.format(totals.installments)} helper="Títulos em aberto" icon={<CalendarClock className="h-5 w-5" />} />
        <SummaryCard title="Baixas manuais" value={formatCurrency(settlementMetrics.value)} helper={`${number.format(settlementMetrics.count)} parcela(s) baixada(s)`} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
      </section>

      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle className="text-lg">Fila de cobrança</CardTitle>
              <CardDescription className="mt-1">A faixa serve para priorizar. Cada linha mostra a dívida inteira do paciente.</CardDescription>
            </div>
            <div className="relative w-full xl:w-[360px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Paciente, CPF, DOC ou tratamento" className="pl-9" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => onBucket("all")} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${bucketFilter === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>Todos</button>
            {aging.map((item) => (
              <button key={item.key} onClick={() => onBucket(item.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${bucketFilter === item.key ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
                {item.label} · {number.format(item.patients)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1240px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Parcelas</th><th className="px-4 py-3">Vencimentos</th><th className="px-4 py-3 text-right">Maior atraso</th><th className="px-4 py-3 text-right">Saldo total</th><th className="px-4 py-3">Tratamento</th><th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.patient.id} className="border-b hover:bg-muted/25">
                  <td className="px-4 py-3"><button onClick={() => onPatient(row.patient)} className="text-left font-semibold hover:underline">{row.patient.name}</button><div className="mt-0.5 text-xs text-muted-foreground">{row.patient.phones[0] || "Sem telefone"}</div></td>
                  <td className="px-4 py-3"><StatusBadge status={row.status} />{row.returnDate && <div className="mt-1 text-xs text-muted-foreground">Retorno: {row.returnDate.split("-").reverse().join("/")}</div>}</td>
                  <td className="px-4 py-3"><div className="font-semibold">{row.allItems.length} em aberto</div>{bucketFilter !== "all" && <div className="text-xs text-muted-foreground">{row.matchingItems.length} nesta faixa</div>}</td>
                  <td className="px-4 py-3"><div>{row.firstDue === row.lastDue ? row.firstDue : `${row.firstDue} → ${row.lastDue}`}</div><div className="text-xs text-muted-foreground">{Array.from(new Set(row.allItems.map((item) => item.document))).slice(0, 2).join(" • ")}{row.allItems.length > 2 ? ` +${row.allItems.length - 2}` : ""}</div></td>
                  <td className="px-4 py-3 text-right font-semibold">{row.oldest} dias</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(row.current)}</td>
                  <td className="max-w-[300px] px-4 py-3">{row.hasSale ? <><div className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Identificado</div><div className="mt-1 line-clamp-2">{row.treatments.slice(0, 2).join(" • ")}{row.treatments.length > 2 ? ` +${row.treatments.length - 2}` : ""}</div></> : <span className="text-xs font-medium text-amber-700">Venda não localizada</span>}</td>
                  <td className="px-4 py-3 text-right"><Button size="sm" onClick={() => onPatient(row.patient)}>Cobrar</Button></td>
                </tr>
              ))}
              {!queue.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">Nenhum paciente encontrado com esse filtro.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Overview({ totals, metrics, aging, reconciliation, salesLoaded, settlementMetrics, onBucket }: {
  totals: typeof SNAPSHOT;
  metrics: { increase: number; increasePct: number };
  aging: AgingBucket[];
  reconciliation: { totalDocs: number; matchedDocs: number; unmatchedDocs: number; matchedBalance: number; percentage: number };
  salesLoaded: boolean;
  settlementMetrics: { count: number; value: number };
  onBucket: (bucket: BucketKey) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Saldo em cobrança" value={formatCurrency(totals.current)} helper="Valor atualizado ainda em aberto" icon={<CircleDollarSign className="h-5 w-5" />} tone="danger" />
        <SummaryCard title="Valor original" value={formatCurrency(totals.original)} helper="Principal das parcelas abertas" icon={<Banknote className="h-5 w-5" />} />
        <SummaryCard title="Acréscimos" value={formatCurrency(metrics.increase)} helper={`+${metrics.increasePct.toFixed(1).replace(".", ",")}% sobre o original`} icon={<ReceiptText className="h-5 w-5" />} tone="warning" />
        <SummaryCard title="Pacientes" value={number.format(totals.patients)} helper="Com parcelas abertas" icon={<UsersRound className="h-5 w-5" />} />
        <SummaryCard title="Parcelas" value={number.format(totals.installments)} helper={`${settlementMetrics.count} baixa(s) manual(is)`} icon={<CalendarClock className="h-5 w-5" />} />
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">Carteira por faixa de atraso</CardTitle><CardDescription>Clique numa faixa para trabalhar a fila. O paciente continuará mostrando todas as parcelas dele.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {aging.map((item) => (
            <button key={item.key} className="text-left" onClick={() => onBucket(item.key)}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">{item.label}</div><div className="mt-1 text-2xl font-bold">{formatCurrency(item.current)}</div></div><ChevronRight className="h-5 w-5 text-muted-foreground" /></div><div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span>{number.format(item.installments)} parcelas</span><span>{number.format(item.patients)} pacientes</span></div></CardContent></Card>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className={salesLoaded ? "border-emerald-200" : "border-blue-200"}>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" />Conciliação cobrança × venda</CardTitle><CardDescription>A venda entra como contexto da cobrança, não como uma segunda fila de trabalho.</CardDescription></CardHeader>
        <CardContent>
          {!salesLoaded ? <div className="rounded-lg border border-dashed bg-blue-50/50 px-4 py-3 text-sm text-blue-900">Importe a base de vendas para identificar a origem dos DOCs.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MiniMetric label="DOCs em cobrança" value={number.format(reconciliation.totalDocs)} helper="Documentos únicos abertos" /><MiniMetric label="Venda localizada" value={number.format(reconciliation.matchedDocs)} helper={`${reconciliation.percentage.toFixed(1).replace(".", ",")}% conciliado`} success /><MiniMetric label="Sem venda" value={number.format(reconciliation.unmatchedDocs)} helper="Precisam de base adicional" warning /><MiniMetric label="Saldo com origem" value={formatCurrency(reconciliation.matchedBalance)} helper="Tratamento identificado" success /></div>}
        </CardContent>
      </Card>
    </div>
  );
}

function PatientDirectory({ patients, search, results, onSearch, onPatient }: {
  patients: PatientDebt[];
  search: string;
  results: Array<{ patient: PatientDebt; current: number; oldest: number; installments: number; settled: number }>;
  onSearch: (value: string) => void;
  onPatient: (patient: PatientDebt) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">Base completa de pacientes</CardTitle>
        <CardDescription>Busca geral nos {number.format(patients.length)} pacientes importados, sem depender da faixa de atraso.</CardDescription>
        <div className="relative mt-3 max-w-2xl"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Digite o nome do paciente..." className="pl-9 pr-9" autoFocus />{search && <button type="button" aria-label="Limpar busca" onClick={() => onSearch("")} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}</div>
      </CardHeader>
      <CardContent className="p-0">
        {normalizeSearch(search).length < 2 ? <div className="px-5 py-10 text-center text-sm text-muted-foreground">Digite pelo menos 2 letras para pesquisar a base inteira.</div> : results.length ? <div className="divide-y">{results.map(({ patient, current, oldest, installments, settled }) => <button key={patient.id} type="button" onClick={() => onPatient(patient)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/35"><div className="min-w-0"><div className="truncate font-semibold">{patient.name}</div><div className="mt-1 text-xs text-muted-foreground">{patient.phones[0] || "Sem telefone"} • CPF {patient.cpf}</div></div><div className="shrink-0 text-right"><div className={installments ? "font-semibold" : "font-semibold text-emerald-700"}>{installments ? formatCurrency(current) : "Sem saldo aberto"}</div><div className="mt-1 text-xs text-muted-foreground">{installments} aberta(s){settled ? ` • ${settled} baixada(s)` : ""}{oldest ? ` • maior atraso ${oldest} dias` : ""}</div></div></button>)}</div> : <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum paciente encontrado nessa base.</div>}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value, helper, success, warning }: { label: string; value: string; helper: string; success?: boolean; warning?: boolean }) {
  const cls = success ? "border-emerald-200 bg-emerald-50/50" : warning ? "border-amber-200 bg-amber-50/50" : "bg-muted/25";
  return <div className={`rounded-xl border p-3 ${cls}`}><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{helper}</div></div>;
}

function PatientDetail({ patient, salesIndex, manualSettlements, ops, onUpdateOps, onSettle, onSettleAll, onUndoSettlement, onClose }: {
  patient: PatientDebt;
  salesIndex: Map<string, SaleItem[]>;
  manualSettlements: ManualSettlements;
  ops: PatientOps;
  onUpdateOps: (patch: Partial<PatientOps>) => void;
  onSettle: (item: Installment) => void;
  onSettleAll: () => void;
  onUndoSettlement: (item: Installment) => void;
  onClose: () => void;
}) {
  const openItems = patient.installments.filter((item) => !manualSettlements[installmentKey(item)]);
  const settledItems = patient.installments.filter((item) => manualSettlements[installmentKey(item)]);
  const sortedOpen = sortByDueDate(openItems);
  const totalCurrent = openItems.reduce((sum, item) => sum + item.current, 0);
  const oldest = openItems.length ? Math.max(...openItems.map((item) => item.daysLate)) : 0;
  const patientDocs = Array.from(new Set(patient.installments.map((item) => baseDocument(item.document)).filter(Boolean)));
  const allSales = patientDocs.flatMap((doc) => salesIndex.get(doc) || []);
  const treatments = uniqueDescriptions(allSales);
  const [message, setMessage] = useState(() => buildCollectionMessage(patient, openItems));

  useEffect(() => {
    setMessage(buildCollectionMessage(patient, openItems));
  }, [patient.id, manualSettlements]);

  function openWhatsApp() {
    const phone = phoneDigits(patient.phones[0] || "");
    if (!phone) { toast.error("Esse paciente não tem telefone identificado."); return; }
    onUpdateOps({ status: "sent", lastMessageAt: new Date().toISOString() });
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, "_blank");
  }

  async function copyMessage() {
    try { await navigator.clipboard.writeText(message); toast.success("Mensagem copiada."); } catch { toast.error("Não consegui copiar a mensagem."); }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="h-full w-full max-w-5xl overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background/95 p-5 backdrop-blur">
          <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Cobrança do paciente</div><h3 className="mt-1 text-xl font-bold">{patient.name}</h3><div className="mt-1 text-sm text-muted-foreground">CPF {patient.cpf}</div></div>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>

        <div className="space-y-5 p-5">
          <Card className="border-primary/20 bg-primary/[0.025]">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div><div className="text-sm font-semibold">Resumo para cobrança</div><div className="mt-1 text-lg font-bold">{openItems.length} parcela(s) em aberto • {formatCurrency(totalCurrent)}</div><div className="mt-1 text-sm text-muted-foreground">{openItems.length ? `Vencimentos de ${sortedOpen[0]?.dueDate} até ${sortedOpen[sortedOpen.length - 1]?.dueDate} • maior atraso ${oldest} dias` : "Paciente sem saldo em aberto"}</div></div>
                <div className="flex flex-wrap items-center gap-2"><StatusBadge status={ops.status} />{openItems.length > 0 && <Button size="sm" variant="outline" onClick={onSettleAll}>Baixar todas</Button>}</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Contato e acompanhamento</CardTitle></CardHeader><CardContent className="space-y-4"><div>{patient.phones.length ? patient.phones.map((phone) => <div key={phone} className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{phone}</div>) : <div className="text-sm text-muted-foreground">Telefone não identificado.</div>}</div><label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situação<select value={ops.status} onChange={(event) => onUpdateOps({ status: event.target.value as CollectionStatus })} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm font-normal text-foreground"><option value="pending">Pendente</option><option value="sent">Mensagem enviada</option><option value="no_response">Sem resposta</option><option value="promised">Prometeu pagar</option><option value="negotiating">Em negociação</option><option value="settled">Regularizado</option></select></label><label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Retornar em<Input type="date" value={ops.returnDate || ""} onChange={(event) => onUpdateOps({ returnDate: event.target.value || undefined })} className="mt-1 font-normal normal-case" /></label></CardContent></Card>

            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4" />Mensagem de cobrança</CardTitle><CardDescription>O tratamento fica como contexto interno. A mensagem usa apenas contrato, parcelas, vencimentos e saldo.</CardDescription></CardHeader><CardContent><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={7} className="w-full resize-y rounded-lg border bg-background p-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring" /><div className="mt-3 flex flex-wrap gap-2"><Button className="gap-2" onClick={openWhatsApp}><MessageCircle className="h-4 w-4" />Abrir WhatsApp</Button><Button variant="outline" onClick={copyMessage}>Copiar mensagem</Button></div></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" />Contexto interno da venda</CardTitle><CardDescription>Use isso para saber exatamente o que originou a cobrança antes de falar com o paciente.</CardDescription></CardHeader>
            <CardContent>{allSales.length ? <div><div className="font-medium">{treatments.join(" • ")}</div><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{patientDocs.length} DOC(s)</span><span>{allSales.length} item(ns) de venda</span></div></div> : <div className="flex items-center gap-2 text-sm text-amber-700"><Unlink className="h-4 w-4" />Venda não localizada na base importada.</div>}</CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Parcelas</CardTitle><CardDescription>Baixa individual quando receber ou confirmar o pagamento.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[1040px] text-sm">
                <thead><tr className="border-y bg-muted/40 text-xs uppercase text-muted-foreground"><th className="px-4 py-3 text-left">Parcela</th><th className="px-4 py-3 text-left">Tratamento</th><th className="px-4 py-3 text-left">Vencimento</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Original</th><th className="px-4 py-3 text-right">Atualizado</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
                <tbody>{sortByDueDate(patient.installments).map((item) => { const sales = salesIndex.get(baseDocument(item.document)) || []; const descriptions = uniqueDescriptions(sales); const settledAt = manualSettlements[installmentKey(item)]; return <tr key={`${item.document}-${item.dueDate}`} className={`border-b ${settledAt ? "bg-emerald-50/35" : ""}`}><td className="px-4 py-3 font-medium">{item.document}</td><td className="max-w-[300px] px-4 py-3">{descriptions.length ? descriptions.join(" • ") : <span className="text-amber-700">Não localizada</span>}</td><td className="px-4 py-3">{item.dueDate}</td><td className="px-4 py-3 text-right">{item.daysLate} dias</td><td className="px-4 py-3 text-right">{formatCurrency(item.original)}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.current)}</td><td className="px-4 py-3 text-center">{settledAt ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Baixada</span> : <span className="rounded-full border px-2 py-1 text-xs font-medium text-muted-foreground">Em aberto</span>}</td><td className="px-4 py-3 text-right">{settledAt ? <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onUndoSettlement(item)}><RotateCcw className="h-3.5 w-3.5" />Desfazer</Button> : <Button size="sm" className="gap-1.5" onClick={() => onSettle(item)}><CheckCircle2 className="h-3.5 w-3.5" />Dar baixa</Button>}</td></tr>; })}</tbody>
              </table>
            </CardContent>
          </Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Informações originais do relatório</CardTitle><CardDescription>Endereço, RG, observações e histórico lidos do PDF.</CardDescription></CardHeader><CardContent><div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">{patient.rawLines.join("\n")}</div></CardContent></Card>
        </div>
      </div>
    </div>
  );
}

async function parseCollectionPdf(file: File): Promise<ImportedReport> {
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  let pdfjs: any;
  try {
    pdfjs = await import(/* @vite-ignore */ pdfjsUrl);
  } catch {
    throw new Error("Não consegui carregar o leitor de PDF. Atualize a página e tente novamente.");
  }
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;

  let reportDate = new Date();
  let period = "—";
  const parsedPatients: PatientDebt[] = [];
  let current: PatientDebt | null = null;

  const finishCurrent = () => {
    if (current && current.installments.length) parsedPatients.push(current);
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
      else {
        last.items.push({ x: item.x, text: item.text });
        last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
      }
    }

    const lines = clusters.map((cluster) => cluster.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim());

    if (pageNumber === 1) {
      const header = lines.join(" ");
      const periodMatch = header.match(/PER[IÍ]ODO:\s*(\d{2}\/\d{2}\/\d{4})\s+A\s+(\d{2}\/\d{2}\/\d{4})/i);
      if (periodMatch) {
        period = `${periodMatch[1]} a ${periodMatch[2]}`;
        reportDate = parseBrDate(periodMatch[2]) || reportDate;
      }
    }

    for (const line of lines) {
      const cpfMatch = line.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
      if (cpfMatch) {
        const beforeCpf = line.slice(0, cpfMatch.index).replace(/CPF\.?\s*:?/gi, "").trim();
        const candidate = beforeCpf.replace(/\s+(CPF|RG|FONE\(S\)).*$/i, "").trim();
        if (candidate && !/EMPRESA|PER[IÍ]ODO|RELAT[ÓO]RIO|TOTAL/i.test(candidate)) {
          finishCurrent();
          const phones = Array.from(new Set((line.match(/\(?\d{2}\)?\s?\d{4,5}-\d{4}/g) || []).map((phone) => phone.trim())));
          current = { id: cpfMatch[0], name: candidate, cpf: cpfMatch[0], phones, rawLines: [line], installments: [] };
          continue;
        }
      }

      if (!current) continue;
      current.rawLines.push(line);
      const extraPhones = line.match(/\(?\d{2}\)?\s?\d{4,5}-\d{4}/g) || [];
      for (const phone of extraPhones) if (!current.phones.includes(phone.trim())) current.phones.push(phone.trim());

      const row = line.match(/(\d{1,6}\/[-\w.]+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(-?[\d,.]+)\s+(-?[\d,.]+)(?:\s+(.*))?$/);
      if (!row) continue;
      const due = parseBrDate(row[3]);
      if (!due) continue;
      const daysLate = Math.max(1, Math.floor((reportDate.getTime() - due.getTime()) / 86400000));
      current.installments.push({
        document: row[1],
        emission: row[2],
        dueDate: row[3],
        original: parseMoney(row[4]),
        current: parseMoney(row[5]),
        observation: row[6]?.trim(),
        daysLate,
        bucket: bucketFor(daysLate),
      });
    }
  }
  finishCurrent();

  const merged = new Map<string, PatientDebt>();
  for (const patient of parsedPatients) {
    const existing = merged.get(patient.cpf);
    if (!existing) {
      merged.set(patient.cpf, patient);
      continue;
    }
    existing.installments.push(...patient.installments);
    existing.rawLines.push(...patient.rawLines);
    for (const phone of patient.phones) if (!existing.phones.includes(phone)) existing.phones.push(phone);
  }

  return { patients: [...merged.values()], reportDate, period };
}
