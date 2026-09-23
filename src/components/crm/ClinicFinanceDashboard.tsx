import { useMemo, useRef, useState } from "react";
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
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type FinanceView = "overview" | "delinquency";
type BucketKey = "1-30" | "31-60" | "61-90" | "91-180" | "181-365" | "365+";

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

const SNAPSHOT = {
  source: "Relatório de Cobrança",
  period: "01/01/2026 a 23/09/2026",
  generatedAt: "23/09/2026 17:56",
  patients: 288,
  installments: 3272,
  original: 533645.87,
  current: 1095838.93,
};

const AGING_SNAPSHOT: AgingBucket[] = [
  { key: "1-30", label: "1–30 dias", installments: 150, patients: 144, original: 35058.47, current: 36866.19 },
  { key: "31-60", label: "31–60 dias", installments: 109, patients: 104, original: 25260.75, current: 28846.78 },
  { key: "61-90", label: "61–90 dias", installments: 102, patients: 97, original: 21123.87, current: 25770.57 },
  { key: "91-180", label: "91–180 dias", installments: 319, patients: 127, original: 63803.12, current: 88300.14 },
  { key: "181-365", label: "181–365 dias", installments: 846, patients: 179, original: 155245.32, current: 267209.81 },
  { key: "365+", label: "+1 ano", installments: 1746, patients: 122, original: 233154.34, current: 648845.44 },
];

const DEMO_PATIENTS: PatientDebt[] = [
  {
    id: "demo-1",
    name: "Paciente de exemplo 01",
    cpf: "***.***.***-01",
    phones: ["(17) 9****-1001"],
    rawLines: ["Dados demonstrativos até a importação do relatório real."],
    installments: [
      { document: "48100/01", emission: "20/08/2026", dueDate: "28/08/2026", original: 350, current: 369.4, daysLate: 26, bucket: "1-30" },
    ],
  },
  {
    id: "demo-2",
    name: "Paciente de exemplo 02",
    cpf: "***.***.***-02",
    phones: ["(17) 9****-1002"],
    rawLines: ["Dados demonstrativos até a importação do relatório real."],
    installments: [
      { document: "47990/03", emission: "14/07/2026", dueDate: "12/08/2026", original: 220, current: 251.9, daysLate: 42, bucket: "31-60" },
    ],
  },
  {
    id: "demo-3",
    name: "Paciente de exemplo 03",
    cpf: "***.***.***-03",
    phones: ["(17) 9****-1003"],
    rawLines: ["Dados demonstrativos até a importação do relatório real."],
    installments: [
      { document: "47820/02", emission: "01/06/2026", dueDate: "01/07/2026", original: 495, current: 584.2, daysLate: 84, bucket: "61-90" },
    ],
  },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");

function formatCurrency(value: number) {
  return brl.format(value || 0);
}

function parseMoney(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBrDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
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

function SummaryCard({ title, value, helper, icon, tone = "default" }: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone?: "default" | "danger" | "warning";
}) {
  const toneClass = tone === "danger"
    ? "border-red-200 bg-red-50/60"
    : tone === "warning"
      ? "border-amber-200 bg-amber-50/60"
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

export function ClinicFinanceDashboard() {
  const [view, setView] = useState<FinanceView>("overview");
  const [selectedBucket, setSelectedBucket] = useState<BucketKey | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<PatientDebt | null>(null);
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<PatientDebt[]>([]);
  const [collectionFile, setCollectionFile] = useState<string | null>(null);
  const [receiptsFile, setReceiptsFile] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const collectionInputRef = useRef<HTMLInputElement | null>(null);
  const receiptsInputRef = useRef<HTMLInputElement | null>(null);

  const imported = patients.length > 0;
  const workingPatients = imported ? patients : DEMO_PATIENTS;

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
      const matches = patients.flatMap((patient) => patient.installments.map((item) => ({ patientId: patient.id, item }))).filter(({ item }) => item.bucket === key);
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
      generatedAt: "importado agora",
      patients: patients.length,
      installments: installments.length,
      original: installments.reduce((sum, item) => sum + item.original, 0),
      current: installments.reduce((sum, item) => sum + item.current, 0),
    };
  }, [collectionFile, imported, patients]);

  const metrics = useMemo(() => {
    const increase = totals.current - totals.original;
    const increasePct = totals.original > 0 ? (increase / totals.original) * 100 : 0;
    const overOneYear = dynamicAging.find((item) => item.key === "365+");
    const overOneYearPct = overOneYear && totals.current > 0 ? (overOneYear.current / totals.current) * 100 : 0;
    return { increase, increasePct, overOneYear, overOneYearPct };
  }, [dynamicAging, totals]);

  const queue = useMemo(() => {
    if (!selectedBucket) return [];
    const term = search.trim().toLowerCase();
    return workingPatients
      .filter((patient) => patient.installments.some((item) => item.bucket === selectedBucket))
      .filter((patient) => !term || patient.name.toLowerCase().includes(term) || patient.cpf.includes(term) || patient.phones.some((phone) => phone.includes(term)))
      .map((patient) => {
        const bucketItems = patient.installments.filter((item) => item.bucket === selectedBucket);
        return {
          patient,
          bucketItems,
          original: bucketItems.reduce((sum, item) => sum + item.original, 0),
          current: bucketItems.reduce((sum, item) => sum + item.current, 0),
          oldest: Math.max(...bucketItems.map((item) => item.daysLate)),
        };
      })
      .sort((a, b) => b.oldest - a.oldest);
  }, [search, selectedBucket, workingPatients]);

  async function importCollectionReport(file?: File) {
    if (!file) return;
    setImporting(true);
    setCollectionFile(file.name);
    try {
      const parsed = await parseCollectionPdf(file);
      if (!parsed.length) {
        throw new Error("Não consegui identificar pacientes e parcelas nesse PDF.");
      }
      setPatients(parsed);
      setView("delinquency");
      setSelectedBucket("1-30");
      toast.success(`Relatório carregado: ${parsed.length} pacientes identificados.`);
    } catch (error: any) {
      setPatients([]);
      toast.error(error?.message || "Falha ao ler o relatório de cobrança.");
    } finally {
      setImporting(false);
      if (collectionInputRef.current) collectionInputRef.current.value = "";
    }
  }

  function importReceiptsReport(file?: File) {
    if (!file) return;
    setReceiptsFile(file.name);
    toast.success("Relatório de recebimentos selecionado para o teste de conciliação.");
    if (receiptsInputRef.current) receiptsInputRef.current.value = "";
  }

  function openBucket(key: BucketKey) {
    setSelectedBucket(key);
    setView("delinquency");
    setSearch("");
  }

  return (
    <div className="space-y-5">
      <input ref={collectionInputRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => importCollectionReport(event.target.files?.[0])} />
      <input ref={receiptsInputRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => importReceiptsReport(event.target.files?.[0])} />

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-xl font-bold">Financeiro da Clínica</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Central de cobrança, inadimplência e conciliação dos recebimentos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-2" disabled={importing} onClick={() => collectionInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> {importing ? "Lendo relatório..." : "Importar Cobrança"}
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => receiptsInputRef.current?.click()}>
            <FileDown className="h-4 w-4" /> Importar Recebimentos
          </Button>
          <Button size="sm" variant={view === "overview" ? "default" : "ghost"} onClick={() => { setView("overview"); setSelectedBucket(null); }}>Visão geral</Button>
          <Button size="sm" variant={view === "delinquency" ? "default" : "ghost"} onClick={() => setView("delinquency")}>Cobrança</Button>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/35 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Fonte: {collectionFile || totals.source}</span>
        <span>Período: {totals.period}</span>
        <span>Atualizado: {totals.generatedAt}</span>
        {receiptsFile && <span className="font-medium text-emerald-700">Recebimentos: {receiptsFile}</span>}
        <span className="ml-auto rounded-full border bg-background px-2.5 py-1 font-medium">Preview: importação local, sem salvar dados no banco</span>
      </section>

      {view === "overview" && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard title="Saldo em cobrança" value={formatCurrency(totals.current)} helper="Valor atualizado da carteira" icon={<CircleDollarSign className="h-5 w-5" />} tone="danger" />
            <SummaryCard title="Valor original" value={formatCurrency(totals.original)} helper="Principal das parcelas" icon={<Banknote className="h-5 w-5" />} />
            <SummaryCard title="Acréscimos" value={formatCurrency(metrics.increase)} helper={`+${metrics.increasePct.toFixed(1).replace(".", ",")}% sobre o original`} icon={<ReceiptText className="h-5 w-5" />} tone="warning" />
            <SummaryCard title="Pacientes" value={number.format(totals.patients)} helper="Com valores em cobrança" icon={<UsersRound className="h-5 w-5" />} />
            <SummaryCard title="Parcelas" value={number.format(totals.installments)} helper="Títulos em aberto" icon={<CalendarClock className="h-5 w-5" />} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Envelhecimento da dívida</CardTitle><CardDescription>Clique em uma faixa para abrir a fila de cobrança.</CardDescription></CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dynamicAging} margin={{ top: 10, right: 8, left: 8, bottom: 0 }} onClick={(state: any) => state?.activePayload?.[0]?.payload?.key && openBucket(state.activePayload[0].payload.key)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} width={44} />
                      <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Valor atualizado"]} />
                      <Bar dataKey="current" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} className="cursor-pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-700" /> Ponto crítico</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-bold tracking-tight">{metrics.overOneYearPct.toFixed(1).replace(".", ",")}%</div>
                <p className="text-sm leading-relaxed text-muted-foreground">do saldo atualizado está em parcelas com mais de um ano de atraso.</p>
                <Button variant="outline" className="w-full justify-between" onClick={() => openBucket("365+")}>Abrir fila +1 ano <ChevronRight className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {view === "delinquency" && !selectedBucket && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dynamicAging.map((item) => (
            <button key={item.key} className="text-left" onClick={() => openBucket(item.key)}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-semibold">{item.label}</div><div className="mt-1 text-2xl font-bold">{formatCurrency(item.current)}</div></div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground"><span>{number.format(item.installments)} parcelas</span><span>{number.format(item.patients)} pacientes</span></div>
                </CardContent>
              </Card>
            </button>
          ))}
        </section>
      )}

      {view === "delinquency" && selectedBucket && (
        <CollectionQueue
          bucket={dynamicAging.find((item) => item.key === selectedBucket)!}
          queue={queue}
          imported={imported}
          search={search}
          onSearch={setSearch}
          onBack={() => setSelectedBucket(null)}
          onPatient={setSelectedPatient}
        />
      )}

      {view === "overview" && <AgingTable aging={dynamicAging} totals={totals} onBucket={openBucket} />}

      {selectedPatient && <PatientDetail patient={selectedPatient} onClose={() => setSelectedPatient(null)} />}
    </div>
  );
}

function CollectionQueue({ bucket, queue, imported, search, onSearch, onBack, onPatient }: {
  bucket: AgingBucket;
  queue: Array<{ patient: PatientDebt; bucketItems: Installment[]; original: number; current: number; oldest: number }>;
  imported: boolean;
  search: string;
  onSearch: (value: string) => void;
  onBack: () => void;
  onPatient: (patient: PatientDebt) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={onBack}>← Faixas</Button><CardTitle className="text-lg">Fila de cobrança • {bucket.label}</CardTitle></div>
            <CardDescription className="mt-1">{number.format(bucket.patients)} pacientes • {number.format(bucket.installments)} parcelas • {formatCurrency(bucket.current)}</CardDescription>
          </div>
          <div className="relative w-full lg:w-[320px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar paciente, CPF ou telefone" className="pl-9" /></div>
        </div>
        {!imported && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">A lista abaixo é demonstrativa. Use <b>Importar Cobrança</b> para testar com o PDF real no seu próprio navegador.</div>}
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-sm">
          <thead><tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3">Documento</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Original</th><th className="px-4 py-3 text-right">Atualizado</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
          <tbody>
            {queue.map(({ patient, bucketItems, original, current, oldest }) => {
              const first = bucketItems[0];
              const phone = patient.phones[0] || "—";
              const wa = phoneDigits(phone);
              return (
                <tr key={patient.id} className="border-b hover:bg-muted/25">
                  <td className="px-4 py-3"><button className="font-semibold text-left hover:underline" onClick={() => onPatient(patient)}>{patient.name}</button><div className="text-xs text-muted-foreground">{patient.cpf}</div></td>
                  <td className="px-4 py-3">{phone}</td>
                  <td className="px-4 py-3">{first?.document}{bucketItems.length > 1 && <span className="ml-1 text-xs text-muted-foreground">+{bucketItems.length - 1}</span>}</td>
                  <td className="px-4 py-3">{first?.dueDate}</td>
                  <td className="px-4 py-3 text-right font-semibold">{oldest} dias</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(original)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(current)}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button size="icon" variant="outline" title="Detalhes" onClick={() => onPatient(patient)}><FileText className="h-4 w-4" /></Button><Button size="icon" variant="outline" title="WhatsApp" disabled={!wa || wa.includes("*")} onClick={() => window.open(`https://wa.me/55${wa}`, "_blank")}><MessageCircle className="h-4 w-4" /></Button></div></td>
                </tr>
              );
            })}
            {!queue.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Nenhum paciente encontrado nesta faixa.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PatientDetail({ patient, onClose }: { patient: PatientDebt; onClose: () => void }) {
  const totalOriginal = patient.installments.reduce((sum, item) => sum + item.original, 0);
  const totalCurrent = patient.installments.reduce((sum, item) => sum + item.current, 0);
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background/95 p-5 backdrop-blur">
          <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Ficha financeira</div><h3 className="mt-1 text-xl font-bold">{patient.name}</h3><div className="mt-1 text-sm text-muted-foreground">CPF {patient.cpf}</div></div>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-3"><SummaryCard title="Saldo original" value={formatCurrency(totalOriginal)} helper="Parcelas em cobrança" icon={<Banknote className="h-4 w-4" />} /><SummaryCard title="Saldo atualizado" value={formatCurrency(totalCurrent)} helper="Conforme relatório" icon={<CircleDollarSign className="h-4 w-4" />} tone="danger" /><SummaryCard title="Parcelas" value={number.format(patient.installments.length)} helper="Todos os débitos localizados" icon={<CalendarClock className="h-4 w-4" />} /></div>

          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Contato</CardTitle></CardHeader><CardContent className="space-y-2">{patient.phones.length ? patient.phones.map((phone) => <div key={phone} className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /> {phone}</div>) : <div className="text-sm text-muted-foreground">Telefone não identificado.</div>}</CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Parcelas do paciente</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-y bg-muted/40 text-xs uppercase text-muted-foreground"><th className="px-4 py-3 text-left">Documento</th><th className="px-4 py-3 text-left">Emissão</th><th className="px-4 py-3 text-left">Vencimento</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Original</th><th className="px-4 py-3 text-right">Atualizado</th></tr></thead><tbody>{patient.installments.sort((a, b) => b.daysLate - a.daysLate).map((item) => <tr key={`${item.document}-${item.dueDate}`} className="border-b"><td className="px-4 py-3 font-medium">{item.document}</td><td className="px-4 py-3">{item.emission}</td><td className="px-4 py-3">{item.dueDate}</td><td className="px-4 py-3 text-right">{item.daysLate} dias</td><td className="px-4 py-3 text-right">{formatCurrency(item.original)}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.current)}</td></tr>)}</tbody></table></CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Informações originais do relatório</CardTitle><CardDescription>Conteúdo preservado para você consultar endereço, RG, observações e histórico que vieram no PDF.</CardDescription></CardHeader><CardContent><div className="max-h-72 overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{patient.rawLines.join("\n")}</div></CardContent></Card>
        </div>
      </div>
    </div>
  );
}

function AgingTable({ aging, totals, onBucket }: { aging: AgingBucket[]; totals: typeof SNAPSHOT; onBucket: (key: BucketKey) => void }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Carteira por faixa de atraso</CardTitle><CardDescription>Clique em qualquer faixa para iniciar a cobrança.</CardDescription></CardHeader>
      <CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Faixa</th><th className="px-4 py-3 text-right">Parcelas</th><th className="px-4 py-3 text-right">Pacientes</th><th className="px-4 py-3 text-right">Original</th><th className="px-4 py-3 text-right">Atualizado</th><th className="px-4 py-3 text-right"></th></tr></thead><tbody>{aging.map((item) => <tr key={item.key} className="border-b hover:bg-muted/30"><td className="px-4 py-3 font-medium">{item.label}</td><td className="px-4 py-3 text-right">{number.format(item.installments)}</td><td className="px-4 py-3 text-right">{number.format(item.patients)}</td><td className="px-4 py-3 text-right">{formatCurrency(item.original)}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.current)}</td><td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => onBucket(item.key)}>Cobrar <ChevronRight className="ml-1 h-4 w-4" /></Button></td></tr>)}</tbody><tfoot><tr className="bg-muted/30 font-semibold"><td className="px-4 py-3">Total</td><td className="px-4 py-3 text-right">{number.format(totals.installments)}</td><td className="px-4 py-3 text-right">{number.format(totals.patients)}</td><td className="px-4 py-3 text-right">{formatCurrency(totals.original)}</td><td className="px-4 py-3 text-right">{formatCurrency(totals.current)}</td><td /></tr></tfoot></table></CardContent>
    </Card>
  );
}

async function parseCollectionPdf(file: File): Promise<PatientDebt[]> {
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdfjs: any = await import(/* @vite-ignore */ pdfjsUrl);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const reportDate = new Date();
  const patients: PatientDebt[] = [];
  let current: PatientDebt | null = null;

  const finishCurrent = () => {
    if (current && current.installments.length) patients.push(current);
    current = null;
  };

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const groups = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items as any[]) {
      const text = String(item.str || "").trim();
      if (!text) continue;
      const y = Math.round(Number(item.transform?.[5] || 0) * 2) / 2;
      const x = Number(item.transform?.[4] || 0);
      const list = groups.get(y) || [];
      list.push({ x, text });
      groups.set(y, list);
    }
    const lines = [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim());

    for (const line of lines) {
      const cpfMatch = line.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
      if (cpfMatch) {
        const beforeCpf = line.slice(0, cpfMatch.index).replace(/CPF\.?\s*:?/gi, "").trim();
        const candidate = beforeCpf.replace(/\s+(CPF|RG|FONE\(S\)).*$/i, "").trim();
        if (candidate && !/EMPRESA|PERÍODO|RELATÓRIO/i.test(candidate)) {
          finishCurrent();
          const phones = Array.from(new Set((line.match(/\(?\d{2}\)?\s?\d{4,5}-\d{4}/g) || []).map((phone) => phone.trim())));
          current = { id: `${cpfMatch[0]}-${pageNumber}`, name: candidate, cpf: cpfMatch[0], phones, rawLines: [line], installments: [] };
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
  return patients;
}
