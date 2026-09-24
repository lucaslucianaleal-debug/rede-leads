import { useMemo, useRef, useState } from "react";
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

type FinanceView = "overview" | "delinquency";
type BucketKey = "1-30" | "31-60" | "61-90" | "91-180" | "181-365" | "365+";
type MatchFilter = "all" | "matched" | "unmatched";

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

const SNAPSHOT = {
  source: "Relatório de Cobrança",
  period: "01/01/2026 a 23/09/2026",
  generatedAt: "23/09/2026 17:56",
  patients: 288,
  installments: 3272,
  original: 533645.87,
  current: 1095838.93,
};

const COLLECTION_CUTOFF = new Date(2025, 10, 1, 12, 0, 0);
const COLLECTION_CUTOFF_LABEL = "01/11/2025";

const AGING_SNAPSHOT: AgingBucket[] = [
  { key: "1-30", label: "1–30 dias", installments: 150, patients: 144, original: 35058.47, current: 36866.19 },
  { key: "31-60", label: "31–60 dias", installments: 109, patients: 104, original: 25260.75, current: 28846.78 },
  { key: "61-90", label: "61–90 dias", installments: 102, patients: 97, original: 21123.87, current: 25770.57 },
  { key: "91-180", label: "91–180 dias", installments: 319, patients: 127, original: 63803.12, current: 88300.14 },
  { key: "181-365", label: "181–365 dias", installments: 846, patients: 179, original: 155245.32, current: 267209.81 },
  { key: "365+", label: "+1 ano", installments: 1746, patients: 122, original: 233154.34, current: 648845.44 },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
const formatCurrency = (value: number) => brl.format(value || 0);

function parseMoney(value: string) {
  let normalized = value.trim().replace(/\s/g, "");
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

function uniqueDescriptions(items: SaleItem[]) {
  return Array.from(new Set(items.map((item) => item.description).filter(Boolean)));
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
  const [view, setView] = useState<FinanceView>("overview");
  const [selectedBucket, setSelectedBucket] = useState<BucketKey | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientDebt | null>(null);
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [patients, setPatients] = useState<PatientDebt[]>([]);
  const [collectionFile, setCollectionFile] = useState<string | null>(null);
  const [receiptsFile, setReceiptsFile] = useState<string | null>(null);
  const [period, setPeriod] = useState(SNAPSHOT.period);
  const [importing, setImporting] = useState(false);
  const [ignoredBeforeCutoff, setIgnoredBeforeCutoff] = useState(0);
  const collectionInputRef = useRef<HTMLInputElement | null>(null);
  const receiptsInputRef = useRef<HTMLInputElement | null>(null);

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

  const dynamicAging = useMemo(() => {
    if (!imported) return AGING_SNAPSHOT;
    const keys: Array<{ key: BucketKey; label: string }> = [
      { key: "1-30", label: "1–30 dias" },
      { key: "31-60", label: "31–60 dias" },
      { key: "61-90", label: "61–90 dias" },
      { key: "91-180", label: "91–180 dias" },
      { key: "181-365", label: "181–365 dias" },
      { key: "365+", label: "+1 ano" },
    ];
    return keys.map(({ key, label }) => {
      const matches = patients
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
  }, [imported, patients]);

  const totals = useMemo(() => {
    if (!imported) return SNAPSHOT;
    const installments = patients.flatMap((patient) => patient.installments);
    return {
      ...SNAPSHOT,
      source: collectionFile || "Relatório importado",
      period,
      generatedAt: "importado agora",
      patients: patients.length,
      installments: installments.length,
      original: installments.reduce((sum, item) => sum + item.original, 0),
      current: installments.reduce((sum, item) => sum + item.current, 0),
    };
  }, [collectionFile, imported, patients, period]);

  const metrics = useMemo(() => {
    const increase = totals.current - totals.original;
    const increasePct = totals.original > 0 ? (increase / totals.original) * 100 : 0;
    const overOneYear = dynamicAging.find((item) => item.key === "365+");
    const overOneYearPct = overOneYear && totals.current > 0 ? (overOneYear.current / totals.current) * 100 : 0;
    return { increase, increasePct, overOneYearPct };
  }, [dynamicAging, totals]);

  const reconciliation = useMemo(() => {
    if (!imported) return { totalDocs: 0, matchedDocs: 0, unmatchedDocs: 0, matchedBalance: 0, percentage: 0 };
    const allInstallments = patients.flatMap((patient) => patient.installments);
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
  }, [imported, patients, salesIndex]);

  const queue = useMemo(() => {
    if (!selectedBucket || !imported) return [];
    const term = search.trim().toLowerCase();
    return patients
      .filter((patient) => patient.installments.some((item) => item.bucket === selectedBucket))
      .map((patient) => {
        const bucketItems = patient.installments.filter((item) => item.bucket === selectedBucket);
        const saleItems = bucketItems.flatMap((item) => salesIndex.get(baseDocument(item.document)) || []);
        const hasSale = saleItems.length > 0;
        const searchable = [
          patient.name,
          patient.cpf,
          ...patient.phones,
          ...bucketItems.map((item) => item.document),
          ...saleItems.map((item) => item.description),
        ].join(" ").toLowerCase();
        return {
          patient,
          bucketItems,
          saleItems,
          hasSale,
          original: bucketItems.reduce((sum, item) => sum + item.original, 0),
          current: bucketItems.reduce((sum, item) => sum + item.current, 0),
          oldest: Math.max(...bucketItems.map((item) => item.daysLate)),
          searchable,
        };
      })
      .filter((row) => !term || row.searchable.includes(term))
      .filter((row) => matchFilter === "all" || (matchFilter === "matched" ? row.hasSale : !row.hasSale))
      .sort((a, b) => b.oldest - a.oldest);
  }, [imported, matchFilter, patients, salesIndex, search, selectedBucket]);

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

      if (!eligiblePatients.length || !eligibleInstallments) {
        throw new Error(`Não encontrei cobranças com emissão a partir de ${COLLECTION_CUTOFF_LABEL}.`);
      }

      setPatients(eligiblePatients);
      setIgnoredBeforeCutoff(ignored);
      setPeriod(parsed.period);
      setView("delinquency");
      setSelectedBucket("1-30");
      setMatchFilter("all");
      toast.success(`${number.format(eligiblePatients.length)} pacientes e ${number.format(eligibleInstallments)} parcelas na carteira operacional. ${number.format(ignored)} parcelas anteriores a ${COLLECTION_CUTOFF_LABEL} foram ocultadas.`);
    } catch (error: any) {
      setPatients([]);
      setIgnoredBeforeCutoff(0);
      toast.error(error?.message || "Falha ao ler o relatório de cobrança.");
    } finally {
      setImporting(false);
      if (collectionInputRef.current) collectionInputRef.current.value = "";
    }
  }

  function importReceiptsReport(file?: File) {
    if (!file) return;
    setReceiptsFile(file.name);
    toast.success("Relatório de recebimentos selecionado. A baixa automática entra na próxima etapa da conciliação.");
    if (receiptsInputRef.current) receiptsInputRef.current.value = "";
  }

  function openBucket(key: BucketKey) {
    setSelectedBucket(key);
    setView("delinquency");
    setSearch("");
    setMatchFilter("all");
  }

  return (
    <div className="space-y-5">
      <input ref={collectionInputRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => importCollectionReport(event.target.files?.[0])} />
      <input ref={receiptsInputRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => importReceiptsReport(event.target.files?.[0])} />

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /><h2 className="font-heading text-xl font-bold">Financeiro da Clínica</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">A cobrança é o centro. A venda entra como origem do débito para você saber exatamente o que está cobrando.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-2" disabled={importing} onClick={() => collectionInputRef.current?.click()}><Upload className="h-4 w-4" />{importing ? "Lendo relatório..." : "Importar Cobrança"}</Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => receiptsInputRef.current?.click()}><FileDown className="h-4 w-4" />Importar Recebimentos</Button>
          <Button size="sm" variant={view === "overview" ? "default" : "ghost"} onClick={() => { setView("overview"); setSelectedBucket(null); }}>Visão geral</Button>
          <Button size="sm" variant={view === "delinquency" ? "default" : "ghost"} onClick={() => setView("delinquency")}>Cobrança</Button>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/35 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Cobrança: {collectionFile || totals.source}</span>
        <span>Período: {totals.period}</span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">Filtro ativo: emissão a partir de {COLLECTION_CUTOFF_LABEL}</span>
        {ignoredBeforeCutoff > 0 && <span>{number.format(ignoredBeforeCutoff)} parcelas antigas ocultadas</span>}
        {salesItems.length > 0 && <span className="font-medium text-emerald-700">Vendas carregadas: {number.format(new Set(salesItems.map((item) => item.document)).size)} DOCs</span>}
        {receiptsFile && <span className="font-medium text-emerald-700">Recebimentos: {receiptsFile}</span>}
        <span className="ml-auto rounded-full border bg-background px-2.5 py-1 font-medium">Preview: dados ficam somente neste navegador</span>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Saldo em cobrança" value={formatCurrency(totals.current)} helper="Valor atualizado da carteira operacional" icon={<CircleDollarSign className="h-5 w-5" />} tone="danger" />
        <SummaryCard title="Valor original" value={formatCurrency(totals.original)} helper="Principal das parcelas visíveis" icon={<Banknote className="h-5 w-5" />} />
        <SummaryCard title="Acréscimos" value={formatCurrency(metrics.increase)} helper={`+${metrics.increasePct.toFixed(1).replace(".", ",")}% sobre o original`} icon={<ReceiptText className="h-5 w-5" />} tone="warning" />
        <SummaryCard title="Pacientes" value={number.format(totals.patients)} helper={`Emissões desde ${COLLECTION_CUTOFF_LABEL}`} icon={<UsersRound className="h-5 w-5" />} />
        <SummaryCard title="Parcelas" value={number.format(totals.installments)} helper="Títulos da carteira operacional" icon={<CalendarClock className="h-5 w-5" />} />
      </section>

      {imported && (
        <Card className={salesItems.length ? "border-emerald-200" : "border-blue-200"}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" />Conciliação cobrança × venda</CardTitle>
            <CardDescription>O DOC da parcela é ligado ao DOC da venda para trazer tratamento, data e itens vendidos direto para a fila de cobrança.</CardDescription>
          </CardHeader>
          <CardContent>
            {!salesItems.length ? (
              <div className="rounded-lg border border-dashed bg-blue-50/50 px-4 py-3 text-sm text-blue-900">Importe a base de vendas acima para transformar a cobrança em uma fila conciliada com o produto/tratamento.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MiniMetric label="DOCs em cobrança" value={number.format(reconciliation.totalDocs)} helper="Documentos únicos" />
                <MiniMetric label="Venda localizada" value={number.format(reconciliation.matchedDocs)} helper={`${reconciliation.percentage.toFixed(1).replace(".", ",")}% conciliado`} success />
                <MiniMetric label="Sem venda localizada" value={number.format(reconciliation.unmatchedDocs)} helper="Precisam de período/base adicional" warning />
                <MiniMetric label="Saldo com origem" value={formatCurrency(reconciliation.matchedBalance)} helper="Débitos com tratamento identificado" success />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!imported && (
        <Card className="border-blue-200 bg-blue-50/60"><CardContent className="p-4 text-sm text-blue-900">Clique em <b>Importar Cobrança</b> para liberar nomes, documentos e filas reais. Na importação, cobranças com emissão anterior a <b>{COLLECTION_CUTOFF_LABEL}</b> são descartadas da carteira operacional.</CardContent></Card>
      )}

      {view === "overview" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Carteira por faixa de atraso</CardTitle><CardDescription>Clique em uma faixa para iniciar a cobrança já com a origem da venda.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dynamicAging.map((item) => <BucketCard key={item.key} item={item} onClick={() => openBucket(item.key)} />)}
          </CardContent>
        </Card>
      )}

      {view === "delinquency" && !selectedBucket && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dynamicAging.map((item) => <BucketCard key={item.key} item={item} onClick={() => openBucket(item.key)} />)}
        </section>
      )}

      {view === "delinquency" && selectedBucket && (
        <CollectionQueue
          bucket={dynamicAging.find((item) => item.key === selectedBucket)!}
          queue={queue}
          imported={imported}
          salesLoaded={salesItems.length > 0}
          search={search}
          matchFilter={matchFilter}
          onMatchFilter={setMatchFilter}
          onSearch={setSearch}
          onBack={() => setSelectedBucket(null)}
          onPatient={setSelectedPatient}
        />
      )}

      {view === "overview" && metrics.overOneYearPct > 0 && (
        <Card className="border-amber-200 bg-amber-50/50"><CardContent className="flex items-center gap-3 p-4"><AlertTriangle className="h-5 w-5 text-amber-700" /><div><div className="font-semibold">{metrics.overOneYearPct.toFixed(1).replace(".", ",")}% do saldo está acima de 1 ano</div><div className="text-xs text-muted-foreground">As faixas continuam sendo a régua operacional da cobrança.</div></div></CardContent></Card>
      )}

      {selectedPatient && <PatientDetail patient={selectedPatient} salesIndex={salesIndex} onClose={() => setSelectedPatient(null)} />}
    </div>
  );
}

function MiniMetric({ label, value, helper, success, warning }: { label: string; value: string; helper: string; success?: boolean; warning?: boolean }) {
  const cls = success ? "border-emerald-200 bg-emerald-50/50" : warning ? "border-amber-200 bg-amber-50/50" : "bg-muted/25";
  return <div className={`rounded-xl border p-3 ${cls}`}><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{helper}</div></div>;
}

function BucketCard({ item, onClick }: { item: AgingBucket; onClick: () => void }) {
  return (
    <button className="text-left" onClick={onClick}>
      <Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">{item.label}</div><div className="mt-1 text-2xl font-bold">{formatCurrency(item.current)}</div></div><ChevronRight className="h-5 w-5 text-muted-foreground" /></div>
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span>{number.format(item.installments)} parcelas</span><span>{number.format(item.patients)} pacientes</span></div>
        </CardContent>
      </Card>
    </button>
  );
}

function CollectionQueue({ bucket, queue, imported, salesLoaded, search, matchFilter, onMatchFilter, onSearch, onBack, onPatient }: {
  bucket: AgingBucket;
  queue: Array<{ patient: PatientDebt; bucketItems: Installment[]; saleItems: SaleItem[]; hasSale: boolean; original: number; current: number; oldest: number }>;
  imported: boolean;
  salesLoaded: boolean;
  search: string;
  matchFilter: MatchFilter;
  onMatchFilter: (value: MatchFilter) => void;
  onSearch: (value: string) => void;
  onBack: () => void;
  onPatient: (patient: PatientDebt) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div><div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={onBack}>← Faixas</Button><CardTitle className="text-lg">Fila de cobrança • {bucket.label}</CardTitle></div><CardDescription className="mt-1">{number.format(bucket.patients)} pacientes • {number.format(bucket.installments)} parcelas • {formatCurrency(bucket.current)}</CardDescription></div>
          <div className="flex flex-col gap-2 lg:flex-row">
            {salesLoaded && <div className="flex rounded-lg border bg-muted/20 p-1 text-xs"><button onClick={() => onMatchFilter("all")} className={`rounded-md px-2.5 py-1.5 ${matchFilter === "all" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>Todos</button><button onClick={() => onMatchFilter("matched")} className={`rounded-md px-2.5 py-1.5 ${matchFilter === "matched" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>Com venda</button><button onClick={() => onMatchFilter("unmatched")} className={`rounded-md px-2.5 py-1.5 ${matchFilter === "unmatched" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>Sem venda</button></div>}
            <div className="relative w-full lg:w-[320px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Paciente, DOC ou tratamento" className="pl-9" /></div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[1180px] text-sm">
          <thead><tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3">Parcela / DOC</th><th className="px-4 py-3">Venda / tratamento</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Atualizado</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
          <tbody>
            {queue.map(({ patient, bucketItems, saleItems, hasSale, current, oldest }) => {
              const first = bucketItems[0];
              const phone = patient.phones[0] || "—";
              const wa = phoneDigits(phone);
              const descriptions = uniqueDescriptions(saleItems);
              const docs = Array.from(new Set(bucketItems.map((item) => baseDocument(item.document)).filter(Boolean)));
              return (
                <tr key={patient.id} className="border-b hover:bg-muted/25">
                  <td className="px-4 py-3"><button className="text-left font-semibold hover:underline" onClick={() => onPatient(patient)}>{patient.name}</button><div className="text-xs text-muted-foreground">{patient.cpf}</div></td>
                  <td className="px-4 py-3">{phone}</td>
                  <td className="px-4 py-3"><div className="font-medium">{first?.document}{bucketItems.length > 1 && <span className="ml-1 text-xs text-muted-foreground">+{bucketItems.length - 1}</span>}</div><div className="mt-1 text-xs text-muted-foreground">Venda {docs.join(", ") || "—"}</div></td>
                  <td className="max-w-[360px] px-4 py-3">{hasSale ? <div><div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Venda localizada</div><div className="mt-1 font-medium">{descriptions.slice(0, 2).join(" • ")}{descriptions.length > 2 ? ` +${descriptions.length - 2}` : ""}</div></div> : <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700"><Unlink className="h-3.5 w-3.5" />Venda não localizada na base importada</div>}</td>
                  <td className="px-4 py-3">{first?.dueDate}</td>
                  <td className="px-4 py-3 text-right font-semibold">{oldest} dias</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(current)}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button size="icon" variant="outline" title="Detalhes" onClick={() => onPatient(patient)}><FileText className="h-4 w-4" /></Button><Button size="icon" variant="outline" title="WhatsApp" disabled={!wa} onClick={() => window.open(`https://wa.me/55${wa}`, "_blank")}><MessageCircle className="h-4 w-4" /></Button></div></td>
                </tr>
              );
            })}
            {!queue.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">{imported ? "Nenhum paciente encontrado com esses filtros." : "Importe o PDF para carregar os pacientes."}</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PatientDetail({ patient, salesIndex, onClose }: { patient: PatientDebt; salesIndex: Map<string, SaleItem[]>; onClose: () => void }) {
  const totalOriginal = patient.installments.reduce((sum, item) => sum + item.original, 0);
  const totalCurrent = patient.installments.reduce((sum, item) => sum + item.current, 0);
  const patientDocs = Array.from(new Set(patient.installments.map((item) => baseDocument(item.document)).filter(Boolean)));

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="h-full w-full max-w-4xl overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background/95 p-5 backdrop-blur"><div><div className="text-xs uppercase tracking-wide text-muted-foreground">Ficha de cobrança conciliada</div><h3 className="mt-1 text-xl font-bold">{patient.name}</h3><div className="mt-1 text-sm text-muted-foreground">CPF {patient.cpf}</div></div><Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button></div>
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-3"><SummaryCard title="Saldo original" value={formatCurrency(totalOriginal)} helper="Parcelas em cobrança" icon={<Banknote className="h-4 w-4" />} /><SummaryCard title="Saldo atualizado" value={formatCurrency(totalCurrent)} helper="Conforme relatório" icon={<CircleDollarSign className="h-4 w-4" />} tone="danger" /><SummaryCard title="Parcelas" value={number.format(patient.installments.length)} helper="Débitos localizados" icon={<CalendarClock className="h-4 w-4" />} /></div>

          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Contato</CardTitle></CardHeader><CardContent className="space-y-2">{patient.phones.length ? patient.phones.map((phone) => <div key={phone} className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{phone}</div>) : <div className="text-sm text-muted-foreground">Telefone não identificado.</div>}</CardContent></Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" />Origem da cobrança / venda</CardTitle><CardDescription>Aqui fica o contexto que você precisa antes de falar com o paciente.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {patientDocs.map((doc) => {
                const sales = salesIndex.get(doc) || [];
                const descriptions = uniqueDescriptions(sales);
                const saleTotal = sales.reduce((sum, item) => sum + item.total, 0);
                return <div key={doc} className={`rounded-xl border p-3 ${sales.length ? "border-emerald-200 bg-emerald-50/35" : "border-amber-200 bg-amber-50/35"}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">Venda / DOC {doc}</div>{sales.length ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Conciliada</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Unlink className="h-3.5 w-3.5" />Não localizada</span>}</div>{sales.length ? <><div className="mt-2 text-sm font-medium">{descriptions.join(" • ")}</div><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Data da venda: {sales[0]?.date || "—"}</span><span>{sales.length} item(ns)</span><span>Total dos itens: {formatCurrency(saleTotal)}</span></div></> : <div className="mt-2 text-sm text-muted-foreground">Esse DOC não apareceu no relatório de vendas importado. Pode ser necessário ampliar o período da base.</div>}</div>;
              })}
            </CardContent>
          </Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Parcelas do paciente</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[920px] text-sm"><thead><tr className="border-y bg-muted/40 text-xs uppercase text-muted-foreground"><th className="px-4 py-3 text-left">Parcela</th><th className="px-4 py-3 text-left">Venda</th><th className="px-4 py-3 text-left">Tratamento</th><th className="px-4 py-3 text-left">Vencimento</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Original</th><th className="px-4 py-3 text-right">Atualizado</th></tr></thead><tbody>{[...patient.installments].sort((a, b) => b.daysLate - a.daysLate).map((item) => { const doc = baseDocument(item.document); const sales = salesIndex.get(doc) || []; const descriptions = uniqueDescriptions(sales); return <tr key={`${item.document}-${item.dueDate}`} className="border-b"><td className="px-4 py-3 font-medium">{item.document}</td><td className="px-4 py-3">{doc || "—"}</td><td className="max-w-[300px] px-4 py-3">{descriptions.length ? descriptions.join(" • ") : <span className="text-amber-700">Não localizada</span>}</td><td className="px-4 py-3">{item.dueDate}</td><td className="px-4 py-3 text-right">{item.daysLate} dias</td><td className="px-4 py-3 text-right">{formatCurrency(item.original)}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.current)}</td></tr>; })}</tbody></table></CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Informações originais do relatório</CardTitle><CardDescription>Endereço, RG, observações, histórico e demais informações lidas diretamente do PDF.</CardDescription></CardHeader><CardContent><div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">{patient.rawLines.join("\n")}</div></CardContent></Card>
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
  let period = SNAPSHOT.period;
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
