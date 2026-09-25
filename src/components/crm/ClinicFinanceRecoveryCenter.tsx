import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileText,
  FileWarning,
  History,
  MessageCircle,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SaleItem } from "@/components/crm/ClinicSalesImportPanel";
import { FINANCE_SNAPSHOT_EVENT } from "@/components/crm/ClinicFinanceSnapshotBridge";
import { toast } from "sonner";

type BucketKey = "all" | "1-30" | "31-60" | "61-90" | "91-180" | "181-365" | "365+";
type RecoveryStatus = "pending" | "contacted" | "no_response" | "promised" | "negotiating" | "settled";
type QueueMode = "today" | "all" | "promises" | "no_lastro";
type ContactChannel = "whatsapp" | "phone" | "presential" | "internal";

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

type RecoveryCase = {
  patientId: string;
  patientName: string;
  status: RecoveryStatus;
  nextActionDate?: string | null;
  note?: string | null;
  lastContactAt?: string | null;
  promiseDate?: string | null;
  promiseAmount?: number | null;
  optOutWhatsapp?: boolean;
  scorePriority?: number | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type RecoveryEvent = {
  id: string;
  type: string;
  channel: ContactChannel;
  result: string;
  note?: string | null;
  createdAt: string;
  createdBy: string;
};

type PersistentSale = {
  id: string;
  patientId: string;
  patientName: string;
  doc: string;
  saleDate: string;
  professional: string;
  treatments: string[];
  totalValue: number;
  condition?: string | null;
  installments?: Array<{ document: string; dueDate: string; value: number }>;
  source: "manual" | "pdf";
  createdAt: string;
  updatedAt: string;
};

type SaleEvidence = {
  key: string;
  doc: string;
  patientId?: string | null;
  date: string;
  professional: string;
  treatments: string[];
  total: number;
  condition?: string | null;
  source: "report" | "manual" | "pdf";
};

const STATUS_LABEL: Record<RecoveryStatus, string> = {
  pending: "Pendente",
  contacted: "Contatado",
  no_response: "Sem resposta",
  promised: "Prometeu pagar",
  negotiating: "Em negociação",
  settled: "Regularizado",
};

const BUCKETS: Array<{ key: BucketKey; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "1-30", label: "1–30 dias" },
  { key: "31-60", label: "31–60 dias" },
  { key: "61-90", label: "61–90 dias" },
  { key: "91-180", label: "91–180 dias" },
  { key: "181-365", label: "181–365 dias" },
  { key: "365+", label: "+1 ano" },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
const storeKey = (clinicId: string) => `clinic_finance_store_v4_${clinicId}`;
const money = (value: number) => brl.format(value || 0);

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

function todayAtNoon() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysLate(value: string) {
  const due = parseBrDate(value);
  if (!due) return 0;
  return Math.max(0, Math.floor((todayAtNoon().getTime() - due.getTime()) / 86400000));
}

function bucketFor(late: number): Exclude<BucketKey, "all"> {
  if (late <= 30) return "1-30";
  if (late <= 60) return "31-60";
  if (late <= 90) return "61-90";
  if (late <= 180) return "91-180";
  if (late <= 365) return "181-365";
  return "365+";
}

function baseDocument(value: string) {
  return (String(value || "").split("/")[0] || "").replace(/\D/g, "");
}

function phoneDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function normalize(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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

function statusClass(status: RecoveryStatus) {
  if (status === "settled") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "promised") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "negotiating") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "contacted") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (status === "no_response") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function promiseState(recovery: RecoveryCase) {
  if (recovery.status !== "promised" || !recovery.promiseDate) return null;
  const today = todayIso();
  if (recovery.promiseDate > today) return "future" as const;
  if (recovery.promiseDate === today) return "today" as const;
  return "broken" as const;
}

function recentContact(lastContactAt?: string | null) {
  if (!lastContactAt) return false;
  const date = new Date(lastContactAt);
  if (Number.isNaN(date.getTime())) return false;
  return (Date.now() - date.getTime()) / 86400000 < 3;
}

function priorityScore(args: {
  overdueAmount: number;
  maxOverdueAmount: number;
  oldest: number;
  lastroRatio: number;
  recovery: RecoveryCase;
}) {
  const valueNorm = args.maxOverdueAmount ? Math.min(1, args.overdueAmount / args.maxOverdueAmount) : 0;
  const lateNorm = Math.min(1, args.oldest / 365);
  const contactPenalty = recentContact(args.recovery.lastContactAt) ? 1 : 0;
  const promisePenalty = promiseState(args.recovery) === "future" ? 1 : 0;
  const raw = (0.35 * valueNorm) + (0.30 * lateNorm) + (0.20 * args.lastroRatio) - (0.10 * contactPenalty) - (0.15 * promisePenalty);
  return Math.round(Math.max(0, Math.min(1, raw / 0.85)) * 100);
}

function safeDocId(value: string) {
  return String(value || "").replace(/[\/\\]/g, "_").replace(/\s+/g, "_");
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ClinicFinanceRecoveryCenter({ salesItems = [] }: { salesItems?: SaleItem[] }) {
  const { currentClinic, user } = useAuth();
  const [store, setStore] = useState<FinanceStore | null>(null);
  const [cases, setCases] = useState<Record<string, RecoveryCase>>({});
  const [persistentSales, setPersistentSales] = useState<PersistentSale[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientDebt | null>(null);
  const [bucket, setBucket] = useState<BucketKey>("all");
  const [statusFilter, setStatusFilter] = useState<RecoveryStatus | "all">("all");
  const [queueMode, setQueueMode] = useState<QueueMode>("today");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const reload = () => setStore(loadStore(currentClinic));
    reload();
    window.addEventListener(FINANCE_SNAPSHOT_EVENT, reload as EventListener);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(FINANCE_SNAPSHOT_EVENT, reload as EventListener);
      window.removeEventListener("storage", reload);
    };
  }, [currentClinic]);

  useEffect(() => {
    if (!currentClinic) return;
    const ref = collection(db, "clinics", currentClinic, "financeRecoveryCases");
    return onSnapshot(ref, (snapshot) => {
      const next: Record<string, RecoveryCase> = {};
      snapshot.docs.forEach((item) => {
        const data = item.data() as RecoveryCase;
        next[data.patientId || item.id] = {
          patientId: data.patientId || item.id,
          patientName: data.patientName || "Paciente",
          status: data.status || "pending",
          nextActionDate: data.nextActionDate || null,
          note: data.note || null,
          lastContactAt: data.lastContactAt || null,
          promiseDate: data.promiseDate || null,
          promiseAmount: data.promiseAmount || null,
          optOutWhatsapp: Boolean(data.optOutWhatsapp),
          scorePriority: data.scorePriority ?? null,
          updatedAt: data.updatedAt || null,
          updatedBy: data.updatedBy || null,
        };
      });
      setCases(next);
    });
  }, [currentClinic]);

  useEffect(() => {
    if (!currentClinic) return;
    const ref = collection(db, "clinics", currentClinic, "financeSales");
    return onSnapshot(ref, (snapshot) => {
      setPersistentSales(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<PersistentSale, "id">) })));
    });
  }, [currentClinic]);

  const saleEvidence = useMemo(() => {
    const map = new Map<string, SaleEvidence[]>();
    const push = (item: SaleEvidence) => {
      if (!item.doc) return;
      const current = map.get(item.doc) || [];
      const exists = current.some((entry) => entry.key === item.key);
      if (!exists) current.push(item);
      map.set(item.doc, current);
    };

    const reportGroups = new Map<string, SaleItem[]>();
    salesItems.forEach((item) => {
      const docKey = baseDocument(item.document);
      if (!docKey) return;
      const current = reportGroups.get(docKey) || [];
      current.push(item);
      reportGroups.set(docKey, current);
    });
    reportGroups.forEach((items, docKey) => {
      push({
        key: `report-${docKey}`,
        doc: docKey,
        date: items[0]?.date || "",
        professional: "",
        treatments: Array.from(new Set(items.map((item) => item.description).filter(Boolean))),
        total: items.reduce((sum, item) => sum + (item.total || 0), 0),
        source: "report",
      });
    });

    persistentSales.forEach((sale) => {
      const docKey = baseDocument(sale.doc);
      push({
        key: sale.id,
        doc: docKey,
        patientId: sale.patientId,
        date: sale.saleDate,
        professional: sale.professional,
        treatments: sale.treatments || [],
        total: sale.totalValue || 0,
        condition: sale.condition || null,
        source: sale.source,
      });
    });
    return map;
  }, [persistentSales, salesItems]);

  const overduePatients = useMemo(() => (store?.patients || [])
    .map((patient) => {
      const overdue = patient.installments.filter((item) => daysLate(item.dueDate) > 0);
      const totalOpen = patient.installments.reduce((sum, item) => sum + item.current, 0);
      const overdueAmount = overdue.reduce((sum, item) => sum + item.current, 0);
      const oldest = overdue.length ? Math.max(...overdue.map((item) => daysLate(item.dueDate))) : 0;
      const allDocs = new Set(overdue.map((item) => baseDocument(item.document)).filter(Boolean));
      const matchedDocs = new Set<string>();
      const treatments = new Set<string>();
      allDocs.forEach((docKey) => {
        const evidence = (saleEvidence.get(docKey) || []).filter((sale) => !sale.patientId || sale.patientId === patient.id);
        if (evidence.length) matchedDocs.add(docKey);
        evidence.forEach((sale) => sale.treatments.forEach((treatment) => treatments.add(treatment)));
      });
      const lastroRatio = allDocs.size ? matchedDocs.size / allDocs.size : 0;
      const recovery = cases[patient.id] || {
        patientId: patient.id,
        patientName: patient.name,
        status: "pending" as RecoveryStatus,
        optOutWhatsapp: false,
      };
      return {
        patient,
        overdue,
        totalOpen,
        overdueAmount,
        oldest,
        matchedDocs: matchedDocs.size,
        allDocs: allDocs.size,
        lastroRatio,
        treatments: Array.from(treatments),
        recovery,
      };
    })
    .filter((row) => row.overdue.length > 0), [cases, saleEvidence, store]);

  const maxOverdueAmount = useMemo(() => Math.max(0, ...overduePatients.map((row) => row.overdueAmount)), [overduePatients]);

  const enrichedPatients = useMemo(() => overduePatients.map((row) => ({
    ...row,
    score: priorityScore({
      overdueAmount: row.overdueAmount,
      maxOverdueAmount,
      oldest: row.oldest,
      lastroRatio: row.lastroRatio,
      recovery: row.recovery,
    }),
  })), [maxOverdueAmount, overduePatients]);

  const metrics = useMemo(() => {
    const overdueAmount = enrichedPatients.reduce((sum, row) => sum + row.overdueAmount, 0);
    const installments = enrichedPatients.reduce((sum, row) => sum + row.overdue.length, 0);
    const criticalPatients = enrichedPatients.filter((row) => row.oldest > 90 && row.recovery.status !== "settled").length;
    const noLastro = enrichedPatients.filter((row) => row.allDocs > 0 && row.matchedDocs < row.allDocs).length;
    const futurePromises = enrichedPatients.filter((row) => promiseState(row.recovery) === "future");
    const promiseAmount = futurePromises.reduce((sum, row) => sum + (row.recovery.promiseAmount || 0), 0);
    const brokenPromises = enrichedPatients.filter((row) => promiseState(row.recovery) === "broken").length;
    const todayQueue = enrichedPatients.filter((row) => {
      if (row.recovery.status === "settled") return false;
      if (promiseState(row.recovery) === "future") return false;
      if (row.recovery.nextActionDate && row.recovery.nextActionDate > todayIso()) return false;
      return true;
    }).length;
    return { overdueAmount, installments, patients: enrichedPatients.length, criticalPatients, noLastro, promiseAmount, brokenPromises, todayQueue };
  }, [enrichedPatients]);

  const rows = useMemo(() => {
    const term = normalize(search);
    return enrichedPatients
      .map((row) => {
        const matching = bucket === "all" ? row.overdue : row.overdue.filter((item) => bucketFor(daysLate(item.dueDate)) === bucket);
        const searchable = normalize([
          row.patient.name,
          row.patient.cpf,
          ...row.patient.phones,
          ...row.treatments,
          STATUS_LABEL[row.recovery.status],
        ].join(" "));
        return { ...row, matching, searchable };
      })
      .filter((row) => row.matching.length > 0)
      .filter((row) => statusFilter === "all" || row.recovery.status === statusFilter)
      .filter((row) => {
        if (queueMode === "all") return true;
        if (queueMode === "promises") return row.recovery.status === "promised";
        if (queueMode === "no_lastro") return row.allDocs > 0 && row.matchedDocs < row.allDocs;
        if (row.recovery.status === "settled") return false;
        if (promiseState(row.recovery) === "future") return false;
        if (row.recovery.nextActionDate && row.recovery.nextActionDate > todayIso()) return false;
        return true;
      })
      .filter((row) => !term || row.searchable.includes(term))
      .sort((a, b) => {
        const aBroken = promiseState(a.recovery) === "broken" ? 1 : 0;
        const bBroken = promiseState(b.recovery) === "broken" ? 1 : 0;
        if (aBroken !== bBroken) return bBroken - aBroken;
        return b.score - a.score || b.oldest - a.oldest || b.overdueAmount - a.overdueAmount;
      });
  }, [bucket, enrichedPatients, queueMode, search, statusFilter]);

  async function logEvent(patient: PatientDebt, input: Omit<RecoveryEvent, "id" | "createdAt" | "createdBy">) {
    if (!currentClinic) return;
    await addDoc(collection(db, "clinics", currentClinic, "financeRecoveryCases", patient.id, "events"), {
      ...input,
      note: input.note || null,
      createdAt: new Date().toISOString(),
      createdBy: user?.email || user?.uid || "clinic",
    });
  }

  async function updateCase(patient: PatientDebt, patch: Partial<RecoveryCase>, event?: { type: string; channel: ContactChannel; result: string; note?: string | null }) {
    if (!currentClinic) return;
    const current = cases[patient.id] || {
      patientId: patient.id,
      patientName: patient.name,
      status: "pending" as RecoveryStatus,
      optOutWhatsapp: false,
    };
    const next: RecoveryCase = {
      ...current,
      ...patch,
      patientId: patient.id,
      patientName: patient.name,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || user?.uid || "clinic",
    };
    try {
      await setDoc(doc(db, "clinics", currentClinic, "financeRecoveryCases", patient.id), next, { merge: true });
      if (event) await logEvent(patient, event);
    } catch (error) {
      console.error("[finance-recovery-case]", error);
      toast.error("Não consegui salvar o andamento da cobrança.");
    }
  }

  async function savePersistentSale(patient: PatientDebt, data: Omit<PersistentSale, "id" | "patientId" | "patientName" | "createdAt" | "updatedAt">) {
    if (!currentClinic) return;
    const docKey = baseDocument(data.doc);
    if (!docKey) throw new Error("Informe o DOC da venda.");
    const id = safeDocId(`${patient.id}__${docKey}`);
    const existing = persistentSales.find((item) => item.id === id);
    const payload: Omit<PersistentSale, "id"> = {
      patientId: patient.id,
      patientName: patient.name,
      doc: docKey,
      saleDate: data.saleDate || "",
      professional: data.professional || "",
      treatments: Array.from(new Set((data.treatments || []).filter(Boolean))),
      totalValue: data.totalValue || 0,
      condition: data.condition || null,
      installments: data.installments || [],
      source: data.source,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "clinics", currentClinic, "financeSales", id), payload, { merge: true });
    await logEvent(patient, {
      type: "sale_linked",
      channel: "internal",
      result: `Venda DOC ${docKey} vinculada`,
      note: `${payload.treatments.join(" • ") || "Sem descrição"} • ${money(payload.totalValue)}`,
    });
  }

  if (!currentClinic) return null;

  if (!store?.patients?.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="h-5 w-5" />
          A Central de Recuperação será liberada assim que o relatório de cobrança for importado.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border-red-200 bg-gradient-to-r from-red-50/70 via-background to-amber-50/50">
        <CardContent className="p-0">
          <div className="grid gap-0 xl:grid-cols-[1.15fr_1fr]">
            <div className="border-b p-5 xl:border-b-0 xl:border-r">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-red-700"><AlertTriangle className="h-5 w-5" /><span className="text-sm font-bold uppercase tracking-wide">Central de recuperação</span></div>
                  <div className="mt-2 text-3xl font-bold tracking-tight">{money(metrics.overdueAmount)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{number.format(metrics.patients)} pacientes • {number.format(metrics.installments)} parcelas vencidas</div>
                </div>
                <Button className="gap-2" onClick={() => setOpen(true)}>Abrir fila do dia <ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">A fila prioriza quem precisa de ação agora e tira da frente promessas futuras. O score considera valor, atraso, lastro e contato recente.</div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-3">
              <MiniMetric icon={<UsersRound className="h-4 w-4" />} label="Fila de hoje" value={String(metrics.todayQueue)} />
              <MiniMetric icon={<AlertTriangle className="h-4 w-4" />} label="Críticos +90d" value={String(metrics.criticalPatients)} />
              <MiniMetric icon={<FileWarning className="h-4 w-4" />} label="Lastro incompleto" value={String(metrics.noLastro)} />
              <MiniMetric icon={<CalendarClock className="h-4 w-4" />} label="Prometido futuro" value={money(metrics.promiseAmount)} />
              <MiniMetric icon={<Clock3 className="h-4 w-4" />} label="Promessas quebradas" value={String(metrics.brokenPromises)} />
              <MiniMetric icon={<CircleDollarSign className="h-4 w-4" />} label="Carteira vencida" value={money(metrics.overdueAmount)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {open && (
        <div className="fixed inset-0 z-[90] bg-black/45 p-3 sm:p-5">
          <div className="mx-auto flex h-full max-w-[1550px] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
            <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-red-700" /><h2 className="text-xl font-bold">Central de Recuperação de Contas</h2></div>
                <div className="mt-1 text-sm text-muted-foreground">Fila operacional por prioridade, com lastro, promessas e histórico.</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-lg border bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{money(metrics.overdueAmount)} vencidos</div>
                <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
              </div>
            </div>

            <div className="space-y-3 border-b bg-muted/20 p-4">
              <div className="flex flex-wrap gap-2">
                <QueueButton active={queueMode === "today"} onClick={() => setQueueMode("today")} label={`Fila de hoje · ${metrics.todayQueue}`} />
                <QueueButton active={queueMode === "all"} onClick={() => setQueueMode("all")} label="Toda carteira" />
                <QueueButton active={queueMode === "promises"} onClick={() => setQueueMode("promises")} label="Promessas" />
                <QueueButton active={queueMode === "no_lastro"} onClick={() => setQueueMode("no_lastro")} label={`Sem lastro · ${metrics.noLastro}`} />
              </div>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {BUCKETS.map((item) => <button key={item.key} onClick={() => setBucket(item.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${bucket === item.key ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{item.label}</button>)}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RecoveryStatus | "all")} className="h-9 rounded-md border bg-background px-3 text-sm">
                    <option value="all">Todos os status</option>
                    {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <div className="relative w-full sm:w-[340px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Paciente, CPF, telefone ou tratamento" className="pl-9" /></div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[1480px] text-sm">
                <thead className="sticky top-0 z-10 bg-background"><tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Prioridade</th><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Contato</th><th className="px-4 py-3">Parcelas</th><th className="px-4 py-3 text-right">Maior atraso</th><th className="px-4 py-3 text-right">Saldo vencido</th><th className="px-4 py-3">Lastro</th><th className="px-4 py-3">Próxima ação</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const phone = row.patient.phones[0] || "";
                    const wa = phoneDigits(phone);
                    const pState = promiseState(row.recovery);
                    return (
                      <tr key={row.patient.id} className="border-b align-top hover:bg-muted/25">
                        <td className="px-4 py-3"><ScoreBadge score={row.score} broken={pState === "broken"} /></td>
                        <td className="px-4 py-3"><button className="text-left font-semibold hover:underline" onClick={() => setSelectedPatient(row.patient)}>{row.patient.name}</button><div className="mt-0.5 text-xs text-muted-foreground">{row.patient.cpf}</div>{pState === "broken" && <div className="mt-1 text-xs font-semibold text-red-700">Promessa vencida</div>}</td>
                        <td className="px-4 py-3"><select value={row.recovery.status} onChange={(event) => void updateCase(row.patient, { status: event.target.value as RecoveryStatus }, { type: "status", channel: "internal", result: `Status alterado para ${STATUS_LABEL[event.target.value as RecoveryStatus]}` })} className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(row.recovery.status)}`}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                        <td className="px-4 py-3"><div>{phone || <span className="text-muted-foreground">Sem telefone</span>}</div>{row.recovery.optOutWhatsapp && <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-700"><Ban className="h-3.5 w-3.5" />WhatsApp bloqueado</div>}</td>
                        <td className="px-4 py-3"><div className="font-semibold">{row.patient.installments.length} abertas</div><div className="text-xs text-muted-foreground">{row.overdue.length} vencidas{bucket !== "all" ? ` • ${row.matching.length} nesta faixa` : ""}</div></td>
                        <td className="px-4 py-3 text-right font-semibold">{row.oldest} dias</td>
                        <td className="px-4 py-3 text-right font-semibold text-red-700">{money(row.overdueAmount)}</td>
                        <td className="px-4 py-3"><LastroBadge matched={row.matchedDocs} total={row.allDocs} /></td>
                        <td className="px-4 py-3"><NextAction recovery={row.recovery} /></td>
                        <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => setSelectedPatient(row.patient)}>Ficha</Button><Button size="icon" variant="outline" title="Abrir WhatsApp" disabled={!wa || row.recovery.optOutWhatsapp} onClick={() => window.open(`https://wa.me/55${wa}`, "_blank")}><MessageCircle className="h-4 w-4" /></Button></div></td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={10} className="px-4 py-14 text-center text-muted-foreground">Nenhum paciente encontrado com esses filtros.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedPatient && (() => {
        const row = enrichedPatients.find((item) => item.patient.id === selectedPatient.id);
        const recovery = cases[selectedPatient.id] || { patientId: selectedPatient.id, patientName: selectedPatient.name, status: "pending" as RecoveryStatus, optOutWhatsapp: false };
        return (
          <RecoveryDrawer
            clinicId={currentClinic}
            patient={selectedPatient}
            recovery={recovery}
            score={row?.score || 0}
            saleEvidence={saleEvidence}
            onUpdate={(patch, event) => updateCase(selectedPatient, patch, event)}
            onSaveSale={(data) => savePersistentSale(selectedPatient, data)}
            onClose={() => setSelectedPatient(null)}
          />
        );
      })()}
    </>
  );
}

function QueueButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${active ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{label}</button>;
}

function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="bg-background p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-2 text-lg font-bold">{value}</div></div>;
}

function ScoreBadge({ score, broken }: { score: number; broken: boolean }) {
  const cls = broken || score >= 75 ? "border-red-200 bg-red-50 text-red-800" : score >= 50 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700";
  return <div className={`inline-flex min-w-14 justify-center rounded-full border px-2 py-1 text-xs font-bold ${cls}`}>{score}</div>;
}

function LastroBadge({ matched, total }: { matched: number; total: number }) {
  if (!total || !matched) return <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Não localizado</span>;
  if (matched < total) return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Parcial {matched}/{total}</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><FileCheck2 className="h-3.5 w-3.5" />Completo</span>;
}

function NextAction({ recovery }: { recovery: RecoveryCase }) {
  const pState = promiseState(recovery);
  if (pState === "future") return <div><div className="font-semibold text-blue-700">Aguardar promessa</div><div className="text-xs text-muted-foreground">{recovery.promiseDate} • {money(recovery.promiseAmount || 0)}</div></div>;
  if (pState === "today") return <div><div className="font-semibold text-amber-700">Promessa vence hoje</div><div className="text-xs text-muted-foreground">{money(recovery.promiseAmount || 0)}</div></div>;
  if (pState === "broken") return <div><div className="font-semibold text-red-700">Promessa quebrada</div><div className="text-xs text-muted-foreground">Era para {recovery.promiseDate}</div></div>;
  if (recovery.nextActionDate) return <div><div className="font-semibold">Retorno agendado</div><div className="text-xs text-muted-foreground">{recovery.nextActionDate}</div></div>;
  return <span className="text-xs text-muted-foreground">Ação disponível agora</span>;
}

function RecoveryDrawer({ clinicId, patient, recovery, score, saleEvidence, onUpdate, onSaveSale, onClose }: {
  clinicId: string;
  patient: PatientDebt;
  recovery: RecoveryCase;
  score: number;
  saleEvidence: Map<string, SaleEvidence[]>;
  onUpdate: (patch: Partial<RecoveryCase>, event?: { type: string; channel: ContactChannel; result: string; note?: string | null }) => Promise<void>;
  onSaveSale: (data: Omit<PersistentSale, "id" | "patientId" | "patientName" | "createdAt" | "updatedAt">) => Promise<void>;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<RecoveryEvent[]>([]);
  const [note, setNote] = useState(recovery.note || "");
  const [nextActionDate, setNextActionDate] = useState(recovery.nextActionDate || "");
  const [promiseDate, setPromiseDate] = useState(recovery.promiseDate || "");
  const [promiseAmount, setPromiseAmount] = useState(recovery.promiseAmount ? String(recovery.promiseAmount).replace(".", ",") : "");
  const [contactNote, setContactNote] = useState("");
  const [manualSaleOpen, setManualSaleOpen] = useState(false);
  const [saleDoc, setSaleDoc] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [saleProfessional, setSaleProfessional] = useState("");
  const [saleTreatments, setSaleTreatments] = useState("");
  const [saleTotal, setSaleTotal] = useState("");
  const [saleCondition, setSaleCondition] = useState("");
  const [importingSale, setImportingSale] = useState(false);
  const salePdfRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const ref = collection(db, "clinics", clinicId, "financeRecoveryCases", patient.id, "events");
    return onSnapshot(ref, (snapshot) => {
      const next = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<RecoveryEvent, "id">) }));
      next.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      setEvents(next);
    });
  }, [clinicId, patient.id]);

  useEffect(() => {
    setNote(recovery.note || "");
    setNextActionDate(recovery.nextActionDate || "");
    setPromiseDate(recovery.promiseDate || "");
    setPromiseAmount(recovery.promiseAmount ? String(recovery.promiseAmount).replace(".", ",") : "");
  }, [recovery]);

  const overdue = patient.installments.filter((item) => daysLate(item.dueDate) > 0);
  const overdueAmount = overdue.reduce((sum, item) => sum + item.current, 0);
  const totalOpen = patient.installments.reduce((sum, item) => sum + item.current, 0);
  const phone = patient.phones[0] || "";
  const wa = phoneDigits(phone);
  const patientDocs = Array.from(new Set(patient.installments.map((item) => baseDocument(item.document)).filter(Boolean)));
  const patientSales = patientDocs.flatMap((docKey) => (saleEvidence.get(docKey) || []).filter((sale) => !sale.patientId || sale.patientId === patient.id));
  const matchedDocs = new Set(patientSales.map((sale) => sale.doc)).size;

  const saveNotes = async () => {
    await onUpdate({ note: note.trim() || null, nextActionDate: nextActionDate || null }, {
      type: "follow_up",
      channel: "internal",
      result: nextActionDate ? `Próxima ação marcada para ${nextActionDate}` : "Acompanhamento atualizado",
      note: note.trim() || null,
    });
    toast.success("Acompanhamento da cobrança salvo.");
  };

  const registerContact = async (channel: ContactChannel, result: string, status: RecoveryStatus) => {
    await onUpdate({ status, lastContactAt: new Date().toISOString() }, {
      type: "contact",
      channel,
      result,
      note: contactNote.trim() || null,
    });
    setContactNote("");
    toast.success("Contato registrado no histórico.");
  };

  const savePromise = async () => {
    if (!promiseDate) return toast.error("Informe a data prometida.");
    const amount = parseMoney(promiseAmount);
    await onUpdate({
      status: "promised",
      promiseDate,
      promiseAmount: amount || null,
      nextActionDate: promiseDate,
      lastContactAt: new Date().toISOString(),
    }, {
      type: "promise",
      channel: "whatsapp",
      result: `Promessa de pagamento para ${promiseDate}`,
      note: amount ? `Valor prometido: ${money(amount)}` : null,
    });
    toast.success("Promessa registrada e retirada da fila normal até a data.");
  };

  const toggleOptOut = async () => {
    const next = !recovery.optOutWhatsapp;
    await onUpdate({ optOutWhatsapp: next }, {
      type: "opt_out",
      channel: "internal",
      result: next ? "WhatsApp bloqueado a pedido do paciente" : "WhatsApp liberado novamente",
    });
  };

  const saveManualSale = async () => {
    const docKey = baseDocument(saleDoc);
    if (!docKey) return toast.error("Informe o DOC da venda.");
    const treatments = saleTreatments.split(/\n|,|;/).map((item) => item.trim()).filter(Boolean);
    await onSaveSale({
      doc: docKey,
      saleDate,
      professional: saleProfessional.trim(),
      treatments,
      totalValue: parseMoney(saleTotal),
      condition: saleCondition.trim() || null,
      installments: [],
      source: "manual",
    });
    setManualSaleOpen(false);
    setSaleDoc(""); setSaleDate(""); setSaleProfessional(""); setSaleTreatments(""); setSaleTotal(""); setSaleCondition("");
    toast.success("Venda vinculada ao paciente.");
  };

  const importSalePdf = async (file?: File) => {
    if (!file) return;
    setImportingSale(true);
    try {
      const parsed = await parseIndividualSalePdf(file);
      await onSaveSale({ ...parsed, source: "pdf" });
      toast.success(`Venda DOC ${parsed.doc} vinculada com sucesso.`);
    } catch (error: any) {
      toast.error(error?.message || "Não consegui ler esse PDF de venda.");
    } finally {
      setImportingSale(false);
      if (salePdfRef.current) salePdfRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/35" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="h-full w-full max-w-6xl overflow-y-auto bg-background shadow-2xl">
        <input ref={salePdfRef} className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => void importSalePdf(event.target.files?.[0])} />
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background/95 p-5 backdrop-blur">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ficha de recuperação</div><h3 className="mt-1 text-xl font-bold">{patient.name}</h3><div className="mt-1 text-sm text-muted-foreground">CPF {patient.cpf} • {phone || "sem telefone"}</div></div>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>

        <div className="space-y-5 p-5">
          <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Metric label="Saldo vencido" value={money(overdueAmount)} danger />
            <Metric label="Saldo aberto" value={money(totalOpen)} />
            <Metric label="Parcelas vencidas" value={`${overdue.length}/${patient.installments.length}`} />
            <Metric label="Maior atraso" value={`${Math.max(...overdue.map((item) => daysLate(item.dueDate)))} dias`} />
            <Metric label="Score" value={String(score)} danger={score >= 75} />
            <Metric label="Lastro" value={`${matchedDocs}/${patientDocs.length} DOC`} danger={matchedDocs < patientDocs.length} />
          </section>

          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-4 lg:grid-cols-[220px_180px_1fr_auto] lg:items-end">
                <div><label className="text-xs font-semibold text-muted-foreground">Status da cobrança</label><select value={recovery.status} onChange={(event) => void onUpdate({ status: event.target.value as RecoveryStatus }, { type: "status", channel: "internal", result: `Status alterado para ${STATUS_LABEL[event.target.value as RecoveryStatus]}` })} className={`mt-1 h-10 w-full rounded-md border px-3 text-sm ${statusClass(recovery.status)}`}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-muted-foreground">Próxima ação</label><Input className="mt-1" type="date" value={nextActionDate} onChange={(event) => setNextActionDate(event.target.value)} /></div>
                <div><label className="text-xs font-semibold text-muted-foreground">Observação interna</label><Input className="mt-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: pediu retorno após dia 30, aguardando comprovante..." /></div>
                <Button onClick={() => void saveNotes()}>Salvar</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button variant="outline" className="gap-2" disabled={!wa || recovery.optOutWhatsapp} onClick={() => window.open(`https://wa.me/55${wa}`, "_blank")}><MessageCircle className="h-4 w-4" />Abrir WhatsApp</Button>
                <Button variant="outline" className="gap-2" onClick={() => void registerContact("whatsapp", "Contato realizado", "contacted")}><CheckCircle2 className="h-4 w-4" />Registrar contato</Button>
                <Button variant="outline" onClick={() => void registerContact("whatsapp", "Sem resposta", "no_response")}>Sem resposta</Button>
                <Button variant="outline" onClick={() => void onUpdate({ status: "negotiating", lastContactAt: new Date().toISOString() }, { type: "negotiation", channel: "whatsapp", result: "Negociação iniciada", note: contactNote.trim() || null })}>Em negociação</Button>
                <Button variant="outline" className="border-emerald-200 text-emerald-700" onClick={() => void onUpdate({ status: "settled", nextActionDate: null, promiseDate: null, promiseAmount: null }, { type: "settled", channel: "internal", result: "Marcado como regularizado" })}>Regularizado</Button>
                <Button variant="ghost" className={recovery.optOutWhatsapp ? "text-red-700" : "text-muted-foreground"} onClick={() => void toggleOptOut()}><Ban className="mr-2 h-4 w-4" />{recovery.optOutWhatsapp ? "WhatsApp bloqueado" : "Bloquear WhatsApp"}</Button>
              </div>
              <div><label className="text-xs font-semibold text-muted-foreground">Observação do contato rápido</label><Input className="mt-1" value={contactNote} onChange={(event) => setContactNote(event.target.value)} placeholder="Ex.: falou que recebe no dia 30; pediu boleto atualizado..." /></div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
              <div><div className="font-semibold">Promessa de pagamento</div><div className="mt-1 text-sm text-muted-foreground">Promessa futura sai da fila normal. Se a data passar sem regularização, volta como promessa quebrada.</div></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Data prometida</label><Input className="mt-1" type="date" value={promiseDate} onChange={(event) => setPromiseDate(event.target.value)} /></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Valor prometido</label><Input className="mt-1" value={promiseAmount} onChange={(event) => setPromiseAmount(event.target.value)} placeholder="0,00" /></div>
              <Button onClick={() => void savePromise()}>Marcar promessa</Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="flex items-center gap-2 font-semibold"><FileCheck2 className="h-4 w-4 text-emerald-700" />Vendas / contratos vinculados</div><div className="mt-1 text-sm text-muted-foreground">O lastro fica permanente no Firestore e acompanha o paciente na cobrança.</div></div>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="gap-2" disabled={importingSale} onClick={() => salePdfRef.current?.click()}><Upload className="h-4 w-4" />{importingSale ? "Lendo venda..." : "Importar PDF da venda"}</Button><Button size="sm" variant="outline" className="gap-2" onClick={() => setManualSaleOpen((value) => !value)}><Plus className="h-4 w-4" />Adicionar manualmente</Button></div>
              </div>

              {manualSaleOpen && (
                <div className="grid gap-3 border-b bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="DOC"><Input value={saleDoc} onChange={(event) => setSaleDoc(event.target.value)} placeholder="Ex.: 45738" /></Field>
                  <Field label="Data da venda"><Input type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} /></Field>
                  <Field label="Profissional"><Input value={saleProfessional} onChange={(event) => setSaleProfessional(event.target.value)} placeholder="Ex.: Dra. Tailuene" /></Field>
                  <Field label="Tratamentos / serviços"><Input value={saleTreatments} onChange={(event) => setSaleTreatments(event.target.value)} placeholder="Implante; Coroa; PPR..." /></Field>
                  <Field label="Valor total"><Input value={saleTotal} onChange={(event) => setSaleTotal(event.target.value)} placeholder="0,00" /></Field>
                  <Field label="Condição"><Input value={saleCondition} onChange={(event) => setSaleCondition(event.target.value)} placeholder="Crediário, cartão..." /></Field>
                  <div className="md:col-span-2 xl:col-span-3"><Button onClick={() => void saveManualSale()}>Salvar venda no paciente</Button></div>
                </div>
              )}

              <div className="divide-y">
                {patientSales.length ? patientSales.map((sale) => (
                  <div key={sale.key} className="grid gap-3 p-4 md:grid-cols-[120px_1fr_180px_160px] md:items-center">
                    <div><div className="text-xs uppercase text-muted-foreground">DOC</div><div className="font-bold">{sale.doc}</div><div className="mt-1 text-[11px] text-muted-foreground">{sale.source === "report" ? "Relatório" : sale.source === "pdf" ? "PDF individual" : "Manual"}</div></div>
                    <div><div className="font-semibold">{sale.treatments.join(" • ") || "Venda sem descrição"}</div><div className="mt-1 text-xs text-muted-foreground">{sale.professional || "Profissional não informado"}{sale.condition ? ` • ${sale.condition}` : ""}</div></div>
                    <div><div className="text-xs text-muted-foreground">Data</div><div className="font-medium">{sale.date || "—"}</div></div>
                    <div className="text-right"><div className="text-xs text-muted-foreground">Valor da venda</div><div className="font-bold">{money(sale.total)}</div></div>
                  </div>
                )) : <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma venda localizada para os DOCs deste paciente. Importe o PDF individual ou cadastre manualmente antes de argumentar a cobrança.</div>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="border-b p-4"><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-700" />Lastro por parcela</div><div className="mt-1 text-sm text-muted-foreground">Cada parcela é cruzada pelo DOC com a origem da venda.</div></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead><tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground"><th className="px-4 py-3">Parcela</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3">Venda / DOC</th><th className="px-4 py-3">Serviço / tratamento</th><th className="px-4 py-3">Data da venda</th></tr></thead>
                  <tbody>{[...patient.installments].sort((a, b) => daysLate(b.dueDate) - daysLate(a.dueDate)).map((item) => {
                    const docKey = baseDocument(item.document);
                    const evidence = (saleEvidence.get(docKey) || []).filter((sale) => !sale.patientId || sale.patientId === patient.id);
                    const treatments = Array.from(new Set(evidence.flatMap((sale) => sale.treatments)));
                    const dates = Array.from(new Set(evidence.map((sale) => sale.date).filter(Boolean)));
                    return <tr key={`${item.document}-${item.dueDate}`} className="border-b"><td className="px-4 py-3 font-semibold">{item.document}</td><td className="px-4 py-3">{item.dueDate}</td><td className="px-4 py-3 text-right">{daysLate(item.dueDate) ? `${daysLate(item.dueDate)} dias` : "Em dia"}</td><td className="px-4 py-3 text-right font-semibold">{money(item.current)}</td><td className="px-4 py-3">{evidence.length ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />DOC {docKey}</span> : <span className="text-red-700">Não localizada</span>}</td><td className="max-w-[360px] px-4 py-3">{treatments.length ? treatments.join(" • ") : "—"}</td><td className="px-4 py-3">{dates.join(", ") || "—"}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="border-b p-4"><div className="flex items-center gap-2 font-semibold"><History className="h-4 w-4" />Histórico da cobrança</div><div className="mt-1 text-sm text-muted-foreground">Timeline imutável das ações registradas nesta ficha.</div></div>
              {events.length ? <div className="divide-y">{events.map((event) => <div key={event.id} className="grid gap-2 p-4 sm:grid-cols-[150px_110px_1fr]"><div className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</div><div className="text-xs font-semibold uppercase text-muted-foreground">{event.channel}</div><div><div className="font-medium">{event.result}</div>{event.note && <div className="mt-1 text-sm text-muted-foreground">{event.note}</div>}<div className="mt-1 text-[11px] text-muted-foreground">{event.createdBy}</div></div></div>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">Ainda não há contatos registrados para este paciente.</div>}
            </CardContent>
          </Card>

          {recovery.updatedAt && <div className="text-xs text-muted-foreground">Última atualização operacional: {formatDateTime(recovery.updatedAt)} {recovery.updatedBy ? `• ${recovery.updatedBy}` : ""}</div>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</label>{children}</div>;
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded-xl border p-4 ${danger ? "border-red-200 bg-red-50/60" : "bg-card"}`}><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-2 text-xl font-bold ${danger ? "text-red-800" : ""}`}>{value}</div></div>;
}

async function parseIndividualSalePdf(file: File): Promise<Omit<PersistentSale, "id" | "patientId" | "patientName" | "createdAt" | "updatedAt" | "source">> {
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdfjs: any = await import(/* @vite-ignore */ pdfjsUrl);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const groups = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items as any[]) {
      const text = String(item.str || "").trim();
      if (!text) continue;
      const y = Math.round(Number(item.transform?.[5] || 0) * 2) / 2;
      const x = Number(item.transform?.[4] || 0);
      const row = groups.get(y) || [];
      row.push({ x, text });
      groups.set(y, row);
    }
    [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, row]) => lines.push(row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim()));
  }

  const full = lines.join("\n");
  const docMatch = full.match(/\bDOC\s*:?\s*(\d{2,10})\b/i);
  if (!docMatch) throw new Error("Não encontrei o DOC da venda nesse PDF.");
  const dateMatch = full.match(/\bDATA\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const responsibleMatch = full.match(/RESPONS[ÁA]VEL\s*:?\s*(.+?)(?:\n|$)/i);
  const conditionMatch = full.match(/TIPO\s*:?\s*(CREDIARIO|CREDIÁRIO|CART[AÃ]O|BOLETO|PIX|DINHEIRO)/i);
  const treatments: string[] = [];
  let totalValue = 0;
  const installments: Array<{ document: string; dueDate: string; value: number }> = [];

  for (const line of lines) {
    const product = line.match(/^(\d{2,6})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(-?[\d.,]+)\s+(-?[\d.,]+)$/);
    if (product && !/DOCUMENTO|PARCELA|VENCTO|EMISSAO/i.test(line)) {
      treatments.push(product[2].trim());
      totalValue += parseMoney(product[5]);
      continue;
    }
    const installment = line.match(/^(\d{2,10}\/\d{1,3})\s+\d{1,3}\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+\d{2}\/\d{2}\/\d{4}$/);
    if (installment) installments.push({ document: installment[1], dueDate: installment[2], value: parseMoney(installment[3]) });
  }

  const explicitTotal = lines.map((line) => line.match(/^TOTAL:\s+\d+(?:[.,]\d+)?\s+([\d.,]+)$/i)).find(Boolean);
  if (explicitTotal?.[1]) totalValue = parseMoney(explicitTotal[1]);

  return {
    doc: docMatch[1],
    saleDate: dateMatch?.[1] || "",
    professional: responsibleMatch?.[1]?.replace(/^\d+\s*-\s*/, "").trim() || "",
    treatments: Array.from(new Set(treatments)),
    totalValue,
    condition: conditionMatch?.[1] || null,
    installments,
  };
}
