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

type FinanceView = "overview" | "delinquency" | "patients";
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

type ManualSettlements = Record<string, string>;

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
const SETTLEMENT_STORAGE_KEY = "clinic-finance-manual-settlements-v1";

const AGING_SNAPSHOT: AgingBucket[] = [
  { key: "1-30", label: "1–30 dias", installments: 0, patients: 0, original: 0, current: 0 },
  { key: "31-60", label: "31–60 dias", installments: 0, patients: 0, original: 0, current: 0 },
  { key: "61-90", label: "61–90 dias", installments: 0, patients: 0, original: 0, current: 0 },
  { key: "91-180", label: "91–180 dias", installments: 0, patients: 0, original: 0, current: 0 },
  { key: "181-365", label: "181–365 dias", installments: 0, patients: 0, original: 0, current: 0 },
  { key: "365+", label: "+1 ano", installments: 0, patients: 0, original: 0, current: 0 },
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
  const [patientSearch, setPatientSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
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
  const collectionInputRef = useRef<HTMLInputElement | null>(null);
  const receiptsInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(SETTLEMENT_STORAGE_KEY, JSON.stringify(manualSettlements));
    } catch {
      // Preview: se o navegador bloquear sessionStorage, a baixa continua válida até atualizar a página.
    }
  }, [manualSettlements]);

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
    const overOneYear = dynamicAging.find((item) => item.key === "365+");
    const overOneYearPct = overOneYear && totals.current > 0 ? (overOneYear.current / totals.current) * 100 : 0;
    return { increase, increasePct, overOneYearPct };
  }, [dynamicAging, totals]);

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

  const queue = useMemo(() => {
    if (!selectedBucket || !imported) return [];
    const term = normalizeSearch(search);
    return activePatients
      .filter((patient) => patient.installments.some((item) => item.bucket === selectedBucket))
      .map((patient) => {
        const bucketItems = patient.installments.filter((item) => item.bucket === selectedBucket);
        const allItems = patient.installments;
        const saleItems = allItems.flatMap((item) => salesIndex.get(baseDocument(item.document)) || []);
        const hasSale = saleItems.length > 0;
        const searchable = normalizeSearch([
          patient.name,
          patient.cpf,
          ...patient.phones,
          ...allItems.map((item) => item.document),
          ...saleItems.map((item) => item.description),
        ].join(" "));
        return {
          patient,
          bucketItems,
          allItems,
          saleItems,
          hasSale,
          original: allItems.reduce((sum, item) => sum + item.original, 0),
          current: allItems.reduce((sum, item) => sum + item.current, 0),
          oldest: Math.max(...allItems.map((item) => item.daysLate)),
          searchable,
        };
      })
      .filter((row) => !term || row.searchable.includes(term))
      .filter((row) => matchFilter === "all" || (matchFilter === "matched" ? row.hasSale : !row.hasSale))
      .sort((a, b) => b.oldest - a.oldest);
  }, [activePatients, imported, matchFilter, salesIndex, search, selectedBucket]);

  function settleInstallment(item: Installment) {
    const key = installmentKey(item);
    if (manualSettlements[key]) return;
    if (!window.confirm(`Confirmar baixa manual da parcela ${item.document} no valor atualizado de ${formatCurrency(item.current)}?`)) return;
    setManualSettlements((current) => ({ ...current, [key]: new Date().toISOString() }));
    toast.success(`Parcela ${item.document} baixada no Rede Leads.`);
  }

  function undoSettlement(item: Installment) {
    const key = installmentKey(item);
    setManualSettlements((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
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

      if (!eligiblePatients.length || !eligibleInstallments) {
        throw new Error(`Não encontrei cobranças com emissão a partir de ${COLLECTION_CUTOFF_LABEL}.`);
      }

      setPatients(eligiblePatients);
      setIgnoredBeforeCutoff(ignored);
      setPatientSearch("");
      setPeriod(parsed.period);
      setView("patients");
      setSelectedBucket(null);
      setMatchFilter("all");
      toast.success(`${number.format(eligiblePatients.length)} pacientes e ${number.format(eligibleInstallments)} parcelas na carteira operacional. ${number.format(ignored)} parcelas anteriores a ${COLLECTION_CUTOFF_LABEL} foram ocultadas.`);
    } catch (error: any) {
      setPatients([]);
      setIgnoredBeforeCutoff(0);
      setPatientSearch("");
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
          <Button size="sm" variant={view === "patients" ? "default" : "ghost"} onClick={() => { setView("patients"); setSelectedBucket(null); }}>Pacientes</Button>
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
        {manualSettlementMetrics.count > 0 && <span className="font-semibold text-emerald-700">Baixas manuais: {number.format(manualSettlementMetrics.count)} • {formatCurrency(manualSettlementMetrics.value)}</span>}
        {receiptsFile && <span className="font-medium text-emerald-700">Recebimentos: {receiptsFile}</span>}
        <span className="ml-auto rounded-full border bg-background px-2.5 py-1 font-medium">Preview: baixas manuais ficam nesta sessão do navegador</span>
      </section>

      {view === "patients" && imported && (
        <PatientDirectory
          patients={patients}
          search={patientSearch}
          results={patientSearchResults}
          onSearch={setPatientSearch}
          onPatient={setSelectedPatient}
        />
      )}

      {view !== "patients" && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard title="Saldo em cobrança" value={formatCurrency(totals.current)} helper={imported ? "Valor atualizado ainda em aberto" : "Aguardando importação"} icon={<CircleDollarSign className="h-5 w-5" />} tone="danger" />
            <SummaryCard title="Valor original" value={formatCurrency(totals.original)} helper={imported ? "Principal das parcelas abertas" : "Aguardando importação"} icon={<Banknote className="h-5 w-5" />} />
            <SummaryCard title="Acréscimos" value={formatCurrency(metrics.increase)} helper={imported ? `+${metrics.increasePct.toFixed(1).replace(".", ",")}% sobre o original` : "Aguardando importação"} icon={<ReceiptText className="h-5 w-5" />} tone="warning" />
            <SummaryCard title="Pacientes" value={number.format(totals.patients)} helper={imported ? "Com parcelas ainda abertas" : "Aguardando importação"} icon={<UsersRound className="h-5 w-5" />} />
            <SummaryCard title="Parcelas" value={number.format(totals.installments)} helper={imported ? "Títulos ainda em aberto" : "Aguardando importação"} icon={<CalendarClock className="h-5 w-5" />} />
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
                    <MiniMetric label="DOCs em cobrança" value={number.format(reconciliation.totalDocs)} helper="Documentos únicos abertos" />
                    <MiniMetric label="Venda localizada" value={number.format(reconciliation.matchedDocs)} helper={`${reconciliation.percentage.toFixed(1).replace(".", ",")}% conciliado`} success />
                    <MiniMetric label="Sem venda localizada" value={number.format(reconciliation.unmatchedDocs)} helper="Precisam de período/base adicional" warning />
                    <MiniMetric label="Saldo com origem" value={formatCurrency(reconciliation.matchedBalance)} helper="Débitos abertos com tratamento identificado" success />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!imported && (
        <Card className="border-blue-200 bg-blue-50/60"><CardContent className="p-4 text-sm text-blue-900">Financeiro zerado. Clique em <b>Importar Cobrança</b> para carregar a carteira real. Na importação, cobranças com emissão anterior a <b>{COLLECTION_CUTOFF_LABEL}</b> são descartadas da carteira operacional.</CardContent></Card>
      )}

      {view === "overview" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Carteira por faixa de atraso</CardTitle><CardDescription>{imported ? "Clique em uma faixa para iniciar a cobrança já com a origem da venda." : "As faixas serão preenchidas após importar a cobrança."}</CardDescription></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dynamicAging.map((item) => <BucketCard key={item.key} item={item} onClick={() => imported && openBucket(item.key)} disabled={!imported} />)}
          </CardContent>
        </Card>
      )}

      {view === "delinquency" && !selectedBucket && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dynamicAging.map((item) => <BucketCard key={item.key} item={item} onClick={() => imported && openBucket(item.key)} disabled={!imported} />)}
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

      {view === "overview" && imported && metrics.overOneYearPct > 0 && (
        <Card className="border-amber-200 bg-amber-50/50"><CardContent className="flex items-center gap-3 p-4"><AlertTriangle className="h-5 w-5 text-amber-700" /><div><div className="font-semibold">{metrics.overOneYearPct.toFixed(1).replace(".", ",")}% do saldo está acima de 1 ano</div><div className="text-xs text-muted-foreground">As faixas continuam sendo a régua operacional da cobrança.</div></div></CardContent></Card>
      )}

      {selectedPatient && (
        <PatientDetail
          patient={selectedPatient}
          salesIndex={salesIndex}
          manualSettlements={manualSettlements}
          onSettle={settleInstallment}
          onUndoSettlement={undoSettlement}
          onClose={() => setSelectedPatient(null)}
        />
      )}
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
        <CardDescription>Busca geral em todos os {number.format(patients.length)} pacientes importados — sem depender de faixa de atraso.</CardDescription>
        <div className="relative mt-3 max-w-2xl">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Digite o nome do paciente..." className="pl-9 pr-9" autoFocus />
          {search && <button type="button" aria-label="Limpar busca" onClick={() => onSearch("")} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {normalizeSearch(search).length < 2 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Digite pelo menos 2 letras para pesquisar a base inteira.</div>
        ) : results.length ? (
          <div className="divide-y">
            {results.map(({ patient, current, oldest, installments, settled }) => (
              <button key={patient.id} type="button" onClick={() => onPatient(patient)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-muted/35">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{patient.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{patient.phones[0] || "Sem telefone"} • CPF {patient.cpf}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={installments ? "font-semibold" : "font-semibold text-emerald-700"}>{installments ? formatCurrency(current) : "Sem saldo aberto"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{installments} aberta(s){settled ? ` • ${settled} baixada(s)` : ""}{oldest ? ` • maior atraso ${oldest} dias` : ""}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum paciente encontrado nessa base.</div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value, helper, success, warning }: { label: string; value: string; helper: string; success?: boolean; warning?: boolean }) {
  const cls = success ? "border-emerald-200 bg-emerald-50/50" : warning ? "border-amber-200 bg-amber-50/50" : "bg-muted/25";
  return <div className={`rounded-xl border p-3 ${cls}`}><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-xl font-bold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{helper}</div></div>;
}

function BucketCard({ item, onClick, disabled = false }: { item: AgingBucket; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="text-left disabled:cursor-default" onClick={onClick} disabled={disabled}>
      <Card className={`h-full transition ${disabled ? "opacity-60" : "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"}`}>
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
  queue: Array<{ patient: PatientDebt; bucketItems: Installment[]; allItems: Installment[]; saleItems: SaleItem[]; hasSale: boolean; original: number; current: number; oldest: number }>;
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
          <div>
            <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={onBack}>← Faixas</Button><CardTitle className="text-lg">Fila de cobrança • {bucket.label}</CardTitle></div>
            <CardDescription className="mt-1">{number.format(bucket.patients)} pacientes nesta prioridade • {number.format(bucket.installments)} parcela(s) nesta faixa • {formatCurrency(bucket.current)}</CardDescription>
            <div className="mt-1 text-xs font-medium text-primary">Cada paciente mostra abaixo todas as parcelas atrasadas ainda abertas, mesmo que estejam em outras faixas.</div>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row">
            {salesLoaded && <div className="flex rounded-lg border bg-muted/20 p-1 text-xs"><button onClick={() => onMatchFilter("all")} className={`rounded-md px-2.5 py-1.5 ${matchFilter === "all" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>Todos</button><button onClick={() => onMatchFilter("matched")} className={`rounded-md px-2.5 py-1.5 ${matchFilter === "matched" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>Com venda</button><button onClick={() => onMatchFilter("unmatched")} className={`rounded-md px-2.5 py-1.5 ${matchFilter === "unmatched" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>Sem venda</button></div>}
            <div className="relative w-full lg:w-[320px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Paciente, DOC ou tratamento" className="pl-9" /></div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[1240px] text-sm">
          <thead><tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3">Parcelas em atraso</th><th className="px-4 py-3">Venda / tratamento</th><th className="px-4 py-3">Vencimentos</th><th className="px-4 py-3 text-right">Atraso máx.</th><th className="px-4 py-3 text-right">Total aberto</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
          <tbody>
            {queue.map(({ patient, bucketItems, allItems, saleItems, hasSale, current, oldest }) => {
              const phone = patient.phones[0] || "—";
              const wa = phoneDigits(phone);
              const descriptions = uniqueDescriptions(saleItems);
              const ordered = sortByDueDate(allItems);
              const oldestItem = ordered[0];
              const newestItem = ordered[ordered.length - 1];
              const docsPreview = ordered.slice(0, 3).map((item) => item.document);
              return (
                <tr key={patient.id} className="border-b align-top hover:bg-muted/25">
                  <td className="px-4 py-3"><button className="text-left font-semibold hover:underline" onClick={() => onPatient(patient)}>{patient.name}</button><div className="text-xs text-muted-foreground">{patient.cpf}</div></td>
                  <td className="px-4 py-3">{phone}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{allItems.length} {allItems.length === 1 ? "parcela atrasada" : "parcelas atrasadas"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Nesta faixa: {bucketItems.length}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{docsPreview.join(" • ")}{ordered.length > 3 ? ` +${ordered.length - 3}` : ""}</div>
                  </td>
                  <td className="max-w-[360px] px-4 py-3">{hasSale ? <div><div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Venda localizada</div><div className="mt-1 font-medium">{descriptions.slice(0, 2).join(" • ")}{descriptions.length > 2 ? ` +${descriptions.length - 2}` : ""}</div></div> : <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700"><Unlink className="h-3.5 w-3.5" />Venda não localizada na base importada</div>}</td>
                  <td className="px-4 py-3"><div className="font-medium">Mais antigo: {oldestItem?.dueDate || "—"}</div>{newestItem && newestItem !== oldestItem && <div className="mt-1 text-xs text-muted-foreground">Mais recente: {newestItem.dueDate}</div>}</td>
                  <td className="px-4 py-3 text-right font-semibold">{oldest} dias</td>
                  <td className="px-4 py-3 text-right"><div className="font-bold">{formatCurrency(current)}</div><div className="mt-1 text-xs text-muted-foreground">todas abertas</div></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button size="icon" variant="outline" title="Ver todas as parcelas e dar baixa" onClick={() => onPatient(patient)}><FileText className="h-4 w-4" /></Button><Button size="icon" variant="outline" title="WhatsApp" disabled={!wa} onClick={() => window.open(`https://wa.me/55${wa}`, "_blank")}><MessageCircle className="h-4 w-4" /></Button></div></td>
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

function PatientDetail({ patient, salesIndex, manualSettlements, onSettle, onUndoSettlement, onClose }: {
  patient: PatientDebt;
  salesIndex: Map<string, SaleItem[]>;
  manualSettlements: ManualSettlements;
  onSettle: (item: Installment) => void;
  onUndoSettlement: (item: Installment) => void;
  onClose: () => void;
}) {
  const openItems = patient.installments.filter((item) => !manualSettlements[installmentKey(item)]);
  const settledItems = patient.installments.filter((item) => manualSettlements[installmentKey(item)]);
  const totalOriginal = openItems.reduce((sum, item) => sum + item.original, 0);
  const totalCurrent = openItems.reduce((sum, item) => sum + item.current, 0);
  const patientDocs = Array.from(new Set(patient.installments.map((item) => baseDocument(item.document)).filter(Boolean)));

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="h-full w-full max-w-5xl overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background/95 p-5 backdrop-blur"><div><div className="text-xs uppercase tracking-wide text-muted-foreground">Ficha de cobrança conciliada</div><h3 className="mt-1 text-xl font-bold">{patient.name}</h3><div className="mt-1 text-sm text-muted-foreground">CPF {patient.cpf}</div></div><Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button></div>
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryCard title="Saldo original" value={formatCurrency(totalOriginal)} helper="Parcelas ainda abertas" icon={<Banknote className="h-4 w-4" />} />
            <SummaryCard title="Saldo atualizado" value={formatCurrency(totalCurrent)} helper="Ainda em cobrança" icon={<CircleDollarSign className="h-4 w-4" />} tone="danger" />
            <SummaryCard title="Em aberto" value={number.format(openItems.length)} helper="Parcelas para cobrar" icon={<CalendarClock className="h-4 w-4" />} />
            <SummaryCard title="Baixadas" value={number.format(settledItems.length)} helper="Baixas manuais nesta sessão" icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
          </div>

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

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Parcelas do paciente</CardTitle><CardDescription>Todas as parcelas da carteira aparecem aqui. Use “Dar baixa” quando receber ou confirmar o pagamento.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[1080px] text-sm">
                <thead><tr className="border-y bg-muted/40 text-xs uppercase text-muted-foreground"><th className="px-4 py-3 text-left">Parcela</th><th className="px-4 py-3 text-left">Venda</th><th className="px-4 py-3 text-left">Tratamento</th><th className="px-4 py-3 text-left">Vencimento</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Atualizado</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
                <tbody>
                  {sortByDueDate(patient.installments).map((item) => {
                    const doc = baseDocument(item.document);
                    const sales = salesIndex.get(doc) || [];
                    const descriptions = uniqueDescriptions(sales);
                    const key = installmentKey(item);
                    const settledAt = manualSettlements[key];
                    return (
                      <tr key={`${item.document}-${item.dueDate}`} className={`border-b ${settledAt ? "bg-emerald-50/35" : ""}`}>
                        <td className="px-4 py-3 font-medium">{item.document}</td>
                        <td className="px-4 py-3">{doc || "—"}</td>
                        <td className="max-w-[300px] px-4 py-3">{descriptions.length ? descriptions.join(" • ") : <span className="text-amber-700">Não localizada</span>}</td>
                        <td className="px-4 py-3">{item.dueDate}</td>
                        <td className="px-4 py-3 text-right">{item.daysLate} dias</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.current)}</td>
                        <td className="px-4 py-3 text-center">{settledAt ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Baixada</span> : <span className="rounded-full border px-2 py-1 text-xs font-medium text-muted-foreground">Em aberto</span>}</td>
                        <td className="px-4 py-3 text-right">{settledAt ? <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onUndoSettlement(item)}><RotateCcw className="h-3.5 w-3.5" />Desfazer</Button> : <Button size="sm" className="gap-1.5" onClick={() => onSettle(item)}><CheckCircle2 className="h-3.5 w-3.5" />Dar baixa</Button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

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
