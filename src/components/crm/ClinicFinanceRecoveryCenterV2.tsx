import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import {
  AlertTriangle, Ban, CalendarClock, CheckCircle2, ChevronRight, CircleDollarSign,
  Clock3, FileCheck2, FileWarning, History, MessageCircle, Plus, Search, ShieldCheck,
  Upload, UsersRound, X,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SaleItem } from "@/components/crm/ClinicSalesImportPanel";
import { FINANCE_SNAPSHOT_EVENT } from "@/components/crm/ClinicFinanceSnapshotBridge";
import { toast } from "sonner";

type RecoveryStatus = "pending" | "contacted" | "no_response" | "promised" | "negotiating" | "settled";
type QueueMode = "today" | "all" | "promises" | "no_lastro";
type ContactChannel = "whatsapp" | "phone" | "presential" | "internal";
type BucketKey = "all" | "1-30" | "31-60" | "61-90" | "91-180" | "181-365" | "365+";

type Installment = { document: string; emission: string; dueDate: string; original: number; current: number; observation?: string };
type PatientDebt = { id: string; name: string; cpf: string; phones: string[]; installments: Installment[] };
type FinanceStore = { version: 1; fileName: string; importedAt: string; period: string; receiptsFile?: string | null; patients: PatientDebt[] };
type RecoveryCase = {
  patientId: string; patientName: string; status: RecoveryStatus; nextActionDate?: string | null;
  note?: string | null; lastContactAt?: string | null; promiseDate?: string | null;
  promiseAmount?: number | null; optOutWhatsapp?: boolean; updatedAt?: string | null; updatedBy?: string | null;
};
type RecoveryEvent = { id: string; type: string; channel: ContactChannel; result: string; note?: string | null; createdAt: string; createdBy: string };
type PersistentSale = {
  id: string; patientId: string; patientName: string; doc: string; saleDate: string; professional: string;
  treatments: string[]; originalValue?: number; totalValue: number; condition?: string | null;
  installments?: Array<{ document: string; dueDate: string; value: number }>;
  source: "manual" | "pdf"; createdAt: string; updatedAt: string;
};
type ConsolidatedSale = {
  doc: string; date: string; professional: string; treatments: string[]; original: number; total: number;
  condition?: string | null; sources: Array<"report" | "manual" | "pdf">;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
const storeKey = (clinicId: string) => `clinic_finance_store_v4_${clinicId}`;
const money = (value: number) => brl.format(value || 0);
const STATUS_LABEL: Record<RecoveryStatus, string> = {
  pending: "Pendente", contacted: "Contatado", no_response: "Sem resposta", promised: "Prometeu pagar",
  negotiating: "Em negociação", settled: "Regularizado",
};
const BUCKETS: Array<{ key: BucketKey; label: string }> = [
  { key: "all", label: "Todos" }, { key: "1-30", label: "1–30 dias" }, { key: "31-60", label: "31–60 dias" },
  { key: "61-90", label: "61–90 dias" }, { key: "91-180", label: "91–180 dias" },
  { key: "181-365", label: "181–365 dias" }, { key: "365+", label: "+1 ano" },
];

function parseMoney(value: string) {
  let normalized = String(value || "").trim().replace(/\s/g, "");
  const comma = normalized.lastIndexOf(","); const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  else if (comma >= 0) normalized = normalized.replace(",", ".");
  const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : 0;
}
function normalize(value: string) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function baseDocument(value: string) { return (String(value || "").split("/")[0] || "").replace(/\D/g, ""); }
function phoneDigits(value: string) { return String(value || "").replace(/\D/g, ""); }
function safeDocId(value: string) { return String(value || "").replace(/[\/\\]/g, "_").replace(/\s+/g, "_"); }
function loadStore(clinicId: string | null): FinanceStore | null {
  if (!clinicId || typeof window === "undefined") return null;
  try { const parsed = JSON.parse(localStorage.getItem(storeKey(clinicId)) || "null") as FinanceStore | null; return parsed?.version === 1 && Array.isArray(parsed.patients) ? parsed : null; } catch { return null; }
}
function parseBrDate(value: string) {
  const [d, m, rawY] = String(value || "").split("/").map(Number); const y = rawY && rawY < 100 ? 2000 + rawY : rawY;
  if (!d || !m || !y) return null; const date = new Date(y, m - 1, d, 12); return Number.isNaN(date.getTime()) ? null : date;
}
function daysLate(value: string) { const due = parseBrDate(value); if (!due) return 0; const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12); return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000)); }
function todayIso() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function bucketFor(late: number): Exclude<BucketKey, "all"> { if (late <= 30) return "1-30"; if (late <= 60) return "31-60"; if (late <= 90) return "61-90"; if (late <= 180) return "91-180"; if (late <= 365) return "181-365"; return "365+"; }
function saleDateKey(value: string) {
  const iso = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/); if (!br) return "";
  const y = Number(br[3]) < 100 ? 2000 + Number(br[3]) : Number(br[3]); return `${y}-${br[2]}-${br[1]}`;
}
function recentContact(value?: string | null) { if (!value) return false; const date = new Date(value); return !Number.isNaN(date.getTime()) && (Date.now() - date.getTime()) / 86400000 < 3; }
function promiseState(recovery: RecoveryCase) { if (recovery.status !== "promised" || !recovery.promiseDate) return null; const today = todayIso(); return recovery.promiseDate > today ? "future" : recovery.promiseDate === today ? "today" : "broken"; }
function priorityScore(overdueAmount: number, max: number, oldest: number, lastro: number, recovery: RecoveryCase) {
  const valueNorm = max ? Math.min(1, overdueAmount / max) : 0; const lateNorm = Math.min(1, oldest / 365);
  const raw = .35 * valueNorm + .30 * lateNorm + .20 * lastro - .10 * (recentContact(recovery.lastContactAt) ? 1 : 0) - .15 * (promiseState(recovery) === "future" ? 1 : 0);
  return Math.round(Math.max(0, Math.min(1, raw / .85)) * 100);
}
function formatDateTime(value?: string | null) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }

export function ClinicFinanceRecoveryCenterV2({ salesItems = [] }: { salesItems?: SaleItem[] }) {
  const { currentClinic, user } = useAuth();
  const [store, setStore] = useState<FinanceStore | null>(null);
  const [cases, setCases] = useState<Record<string, RecoveryCase>>({});
  const [persistentSales, setPersistentSales] = useState<PersistentSale[]>([]);
  const [open, setOpen] = useState(false); const [selectedPatient, setSelectedPatient] = useState<PatientDebt | null>(null);
  const [bucket, setBucket] = useState<BucketKey>("all"); const [statusFilter, setStatusFilter] = useState<RecoveryStatus | "all">("all");
  const [queueMode, setQueueMode] = useState<QueueMode>("today"); const [search, setSearch] = useState("");
  const [saleFrom, setSaleFrom] = useState(""); const [saleTo, setSaleTo] = useState("");

  useEffect(() => { const reload = () => setStore(loadStore(currentClinic)); reload(); window.addEventListener(FINANCE_SNAPSHOT_EVENT, reload as EventListener); window.addEventListener("storage", reload); return () => { window.removeEventListener(FINANCE_SNAPSHOT_EVENT, reload as EventListener); window.removeEventListener("storage", reload); }; }, [currentClinic]);
  useEffect(() => { if (!currentClinic) return; return onSnapshot(collection(db, "clinics", currentClinic, "financeRecoveryCases"), (snap) => { const next: Record<string, RecoveryCase> = {}; snap.docs.forEach((d) => { const x = d.data() as RecoveryCase; next[x.patientId || d.id] = { ...x, patientId: x.patientId || d.id, patientName: x.patientName || "Paciente", status: x.status || "pending" }; }); setCases(next); }); }, [currentClinic]);
  useEffect(() => { if (!currentClinic) return; return onSnapshot(collection(db, "clinics", currentClinic, "financeSales"), (snap) => setPersistentSales(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PersistentSale, "id">) })))); }, [currentClinic]);

  const reportByDoc = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    salesItems.forEach((item) => { const docKey = baseDocument(item.document); if (!docKey) return; const list = map.get(docKey) || []; list.push(item); map.set(docKey, list); });
    return map;
  }, [salesItems]);

  const patientSales = (patient: PatientDebt): ConsolidatedSale[] => {
    const docs = new Set(patient.installments.map((i) => baseDocument(i.document)).filter(Boolean));
    const result: ConsolidatedSale[] = [];
    docs.forEach((docKey) => {
      const report = (reportByDoc.get(docKey) || []).filter((i) => !i.patientName || normalize(i.patientName) === normalize(patient.name));
      const stored = persistentSales.filter((s) => s.patientId === patient.id && baseDocument(s.doc) === docKey);
      if (!report.length && !stored.length) return;
      const treatments = new Set<string>(); report.forEach((i) => i.description && treatments.add(i.description)); stored.forEach((s) => (s.treatments || []).forEach((t) => t && treatments.add(t)));
      const reportOriginal = report.reduce((sum, i) => sum + (i.quantity || 0) * (i.value || 0), 0);
      const reportTotal = report.reduce((sum, i) => sum + (i.total || 0), 0);
      const best = [...stored].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0];
      const sources = Array.from(new Set([...(report.length ? ["report" as const] : []), ...stored.map((s) => s.source)]));
      result.push({
        doc: docKey,
        date: best?.saleDate || report[0]?.date || "",
        professional: best?.professional || "",
        treatments: Array.from(treatments),
        original: best?.originalValue || reportOriginal || best?.totalValue || reportTotal,
        total: best?.totalValue || reportTotal || best?.originalValue || reportOriginal,
        condition: best?.condition || null,
        sources,
      });
    });
    return result;
  };

  const overdueRows = useMemo(() => {
    const base = (store?.patients || []).map((patient) => {
      const overdue = patient.installments.filter((i) => daysLate(i.dueDate) > 0); const overdueAmount = overdue.reduce((s, i) => s + i.current, 0);
      const oldest = overdue.length ? Math.max(...overdue.map((i) => daysLate(i.dueDate))) : 0; const sales = patientSales(patient);
      const docs = new Set(overdue.map((i) => baseDocument(i.document)).filter(Boolean)); const matched = new Set(sales.map((s) => s.doc));
      const recovery = cases[patient.id] || { patientId: patient.id, patientName: patient.name, status: "pending" as RecoveryStatus };
      return { patient, overdue, overdueAmount, oldest, totalOpen: patient.installments.reduce((s, i) => s + i.current, 0), sales, matchedDocs: [...docs].filter((d) => matched.has(d)).length, allDocs: docs.size, recovery };
    }).filter((r) => r.overdue.length);
    const max = Math.max(0, ...base.map((r) => r.overdueAmount));
    return base.map((r) => ({ ...r, score: priorityScore(r.overdueAmount, max, r.oldest, r.allDocs ? r.matchedDocs / r.allDocs : 0, r.recovery) }));
  }, [store, cases, persistentSales, reportByDoc]);

  const rows = useMemo(() => {
    const term = normalize(search);
    return overdueRows.map((r) => ({ ...r, matching: bucket === "all" ? r.overdue : r.overdue.filter((i) => bucketFor(daysLate(i.dueDate)) === bucket) }))
      .filter((r) => r.matching.length)
      .filter((r) => statusFilter === "all" || r.recovery.status === statusFilter)
      .filter((r) => {
        if (!saleFrom && !saleTo) return true;
        return r.sales.some((s) => { const key = saleDateKey(s.date); return key && (!saleFrom || key >= saleFrom) && (!saleTo || key <= saleTo); });
      })
      .filter((r) => {
        if (queueMode === "all") return true; if (queueMode === "promises") return r.recovery.status === "promised"; if (queueMode === "no_lastro") return r.matchedDocs < r.allDocs;
        if (r.recovery.status === "settled" || promiseState(r.recovery) === "future") return false; if (r.recovery.nextActionDate && r.recovery.nextActionDate > todayIso()) return false; return true;
      })
      .filter((r) => !term || normalize([r.patient.name, r.patient.cpf, ...r.patient.phones, ...r.sales.flatMap((s) => s.treatments), ...r.sales.map((s) => s.doc)].join(" ")).includes(term))
      .sort((a, b) => (promiseState(b.recovery) === "broken" ? 1 : 0) - (promiseState(a.recovery) === "broken" ? 1 : 0) || b.score - a.score || b.oldest - a.oldest);
  }, [overdueRows, bucket, statusFilter, queueMode, search, saleFrom, saleTo]);

  const metrics = useMemo(() => ({
    amount: overdueRows.reduce((s, r) => s + r.overdueAmount, 0), patients: overdueRows.length,
    installments: overdueRows.reduce((s, r) => s + r.overdue.length, 0), noLastro: overdueRows.filter((r) => r.matchedDocs < r.allDocs).length,
    today: overdueRows.filter((r) => r.recovery.status !== "settled" && promiseState(r.recovery) !== "future" && (!r.recovery.nextActionDate || r.recovery.nextActionDate <= todayIso())).length,
    broken: overdueRows.filter((r) => promiseState(r.recovery) === "broken").length,
  }), [overdueRows]);

  async function logEvent(patient: PatientDebt, input: Omit<RecoveryEvent, "id" | "createdAt" | "createdBy">) {
    if (!currentClinic) return; await addDoc(collection(db, "clinics", currentClinic, "financeRecoveryCases", patient.id, "events"), { ...input, note: input.note || null, createdAt: new Date().toISOString(), createdBy: user?.email || user?.uid || "clinic" });
  }
  async function updateCase(patient: PatientDebt, patch: Partial<RecoveryCase>, event?: { type: string; channel: ContactChannel; result: string; note?: string | null }) {
    if (!currentClinic) return; const current = cases[patient.id] || { patientId: patient.id, patientName: patient.name, status: "pending" as RecoveryStatus };
    const next = { ...current, ...patch, patientId: patient.id, patientName: patient.name, updatedAt: new Date().toISOString(), updatedBy: user?.email || user?.uid || "clinic" };
    await setDoc(doc(db, "clinics", currentClinic, "financeRecoveryCases", patient.id), next, { merge: true }); if (event) await logEvent(patient, event);
  }
  async function saveSale(patient: PatientDebt, data: Omit<PersistentSale, "id" | "patientId" | "patientName" | "createdAt" | "updatedAt">) {
    if (!currentClinic) return; const docKey = baseDocument(data.doc); if (!docKey) throw new Error("Informe o DOC da venda.");
    const id = safeDocId(`${patient.id}__${docKey}`); const existing = persistentSales.find((s) => s.id === id || (s.patientId === patient.id && baseDocument(s.doc) === docKey));
    const payload: Omit<PersistentSale, "id"> = {
      patientId: patient.id, patientName: patient.name, doc: docKey,
      saleDate: data.saleDate || existing?.saleDate || "", professional: data.professional || existing?.professional || "",
      treatments: Array.from(new Set([...(existing?.treatments || []), ...(data.treatments || [])].filter(Boolean))),
      originalValue: data.originalValue || existing?.originalValue || data.totalValue || existing?.totalValue || 0,
      totalValue: data.totalValue || existing?.totalValue || data.originalValue || existing?.originalValue || 0,
      condition: data.condition || existing?.condition || null, installments: data.installments?.length ? data.installments : existing?.installments || [],
      source: data.source, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "clinics", currentClinic, "financeSales", id), payload, { merge: true });
    await logEvent(patient, { type: "sale_linked", channel: "internal", result: `Venda DOC ${docKey} vinculada/atualizada`, note: `${money(payload.originalValue || 0)} original • ${money(payload.totalValue)} fechado` });
  }

  if (!currentClinic) return null;
  if (!store?.patients?.length) return <Card className="border-dashed"><CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5" />A Central de Recuperação será liberada após importar o relatório de cobrança.</CardContent></Card>;

  return <>
    <Card className="overflow-hidden border-red-200 bg-gradient-to-r from-red-50/70 via-background to-amber-50/50"><CardContent className="p-0"><div className="grid xl:grid-cols-[1.15fr_1fr]">
      <div className="border-b p-5 xl:border-b-0 xl:border-r"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-red-700"><AlertTriangle className="h-5 w-5" /><span className="text-sm font-bold uppercase tracking-wide">Central de recuperação</span></div><div className="mt-2 text-3xl font-bold">{money(metrics.amount)}</div><div className="mt-1 text-sm text-muted-foreground">{number.format(metrics.patients)} pacientes • {number.format(metrics.installments)} parcelas vencidas</div></div><Button className="gap-2" onClick={() => setOpen(true)}>Abrir fila do dia <ChevronRight className="h-4 w-4" /></Button></div><div className="mt-4 text-sm text-muted-foreground">Fila por prioridade, com vendas consolidadas por DOC, promessas, lastro e histórico.</div></div>
      <div className="grid grid-cols-2 gap-px bg-border"><MiniMetric icon={<UsersRound className="h-4 w-4" />} label="Fila de hoje" value={String(metrics.today)} /><MiniMetric icon={<FileWarning className="h-4 w-4" />} label="Lastro incompleto" value={String(metrics.noLastro)} /><MiniMetric icon={<Clock3 className="h-4 w-4" />} label="Promessas quebradas" value={String(metrics.broken)} /><MiniMetric icon={<CircleDollarSign className="h-4 w-4" />} label="Carteira vencida" value={money(metrics.amount)} /></div>
    </div></CardContent></Card>

    {open && <div className="fixed inset-0 z-[90] bg-black/45 p-3 sm:p-5"><div className="mx-auto flex h-full max-w-[1580px] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b p-4"><div><h2 className="text-xl font-bold">Central de Recuperação de Contas</h2><div className="text-sm text-muted-foreground">Cobrança priorizada com filtro financeiro e comercial.</div></div><Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button></div>
      <div className="space-y-3 border-b bg-muted/20 p-4">
        <div className="flex flex-wrap gap-2"><QueueButton active={queueMode === "today"} onClick={() => setQueueMode("today")} label={`Fila de hoje · ${metrics.today}`} /><QueueButton active={queueMode === "all"} onClick={() => setQueueMode("all")} label="Toda carteira" /><QueueButton active={queueMode === "promises"} onClick={() => setQueueMode("promises")} label="Promessas" /><QueueButton active={queueMode === "no_lastro"} onClick={() => setQueueMode("no_lastro")} label={`Sem lastro · ${metrics.noLastro}`} /></div>
        <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto] xl:items-end"><div className="flex flex-wrap gap-2">{BUCKETS.map((b) => <button key={b.key} onClick={() => setBucket(b.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${bucket === b.key ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{b.label}</button>)}</div><Field label="Venda de"><Input type="date" value={saleFrom} onChange={(e) => setSaleFrom(e.target.value)} /></Field><Field label="Até"><Input type="date" value={saleTo} onChange={(e) => setSaleTo(e.target.value)} /></Field><Button variant="ghost" size="sm" onClick={() => { setSaleFrom(""); setSaleTo(""); }}>Limpar datas</Button></div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RecoveryStatus | "all")} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">Todos os status</option>{Object.entries(STATUS_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><div className="relative w-full sm:w-[360px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Paciente, CPF, telefone, DOC ou tratamento" className="pl-9" /></div></div>
      </div>
      <div className="flex-1 overflow-auto"><table className="w-full min-w-[1450px] text-sm"><thead className="sticky top-0 bg-background"><tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground"><th className="px-4 py-3">Score</th><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Parcelas</th><th className="px-4 py-3">Venda</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Saldo vencido</th><th className="px-4 py-3">Lastro</th><th className="px-4 py-3">Próxima ação</th><th className="px-4 py-3 text-right">Ação</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.patient.id} className="border-b align-top hover:bg-muted/25"><td className="px-4 py-3"><ScoreBadge score={r.score} broken={promiseState(r.recovery) === "broken"} /></td><td className="px-4 py-3"><button className="font-semibold hover:underline" onClick={() => setSelectedPatient(r.patient)}>{r.patient.name}</button><div className="text-xs text-muted-foreground">{r.patient.cpf}</div></td><td className="px-4 py-3"><select value={r.recovery.status} onChange={(e) => void updateCase(r.patient, { status: e.target.value as RecoveryStatus }, { type: "status", channel: "internal", result: `Status: ${STATUS_LABEL[e.target.value as RecoveryStatus]}` })} className="rounded-full border px-2 py-1 text-xs font-semibold">{Object.entries(STATUS_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></td><td className="px-4 py-3"><b>{r.patient.installments.length} abertas</b><div className="text-xs text-muted-foreground">{r.overdue.length} vencidas</div></td><td className="px-4 py-3"><div className="font-medium">{r.sales.map((s) => s.date).filter(Boolean).join(", ") || "—"}</div><div className="text-xs text-muted-foreground">{r.sales.map((s) => `DOC ${s.doc}`).join(" • ") || "Sem venda"}</div></td><td className="px-4 py-3 text-right font-semibold">{r.oldest} dias</td><td className="px-4 py-3 text-right font-semibold text-red-700">{money(r.overdueAmount)}</td><td className="px-4 py-3"><LastroBadge matched={r.matchedDocs} total={r.allDocs} /></td><td className="px-4 py-3"><NextAction recovery={r.recovery} /></td><td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setSelectedPatient(r.patient)}>Ficha</Button></td></tr>)}
        {!rows.length && <tr><td colSpan={10} className="px-4 py-14 text-center text-muted-foreground">Nenhum paciente encontrado com esses filtros.</td></tr>}
      </tbody></table></div>
    </div></div>}

    {selectedPatient && <RecoveryDrawerV2 clinicId={currentClinic} patient={selectedPatient} recovery={cases[selectedPatient.id] || { patientId: selectedPatient.id, patientName: selectedPatient.name, status: "pending" }} score={overdueRows.find((r) => r.patient.id === selectedPatient.id)?.score || 0} sales={patientSales(selectedPatient)} persistentSales={persistentSales} onUpdate={(p,e) => updateCase(selectedPatient,p,e)} onSaveSale={(d) => saveSale(selectedPatient,d)} onClose={() => setSelectedPatient(null)} />}
  </>;
}

function QueueButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) { return <button onClick={onClick} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${active ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{label}</button>; }
function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="bg-background p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-2 text-lg font-bold">{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>; }
function ScoreBadge({ score, broken }: { score: number; broken: boolean }) { return <span className={`inline-flex min-w-14 justify-center rounded-full border px-2 py-1 text-xs font-bold ${broken || score >= 75 ? "border-red-200 bg-red-50 text-red-800" : score >= 50 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{score}</span>; }
function LastroBadge({ matched, total }: { matched: number; total: number }) { if (!total || !matched) return <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Não localizado</span>; if (matched < total) return <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Parcial {matched}/{total}</span>; return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><FileCheck2 className="h-3.5 w-3.5" />Completo</span>; }
function NextAction({ recovery }: { recovery: RecoveryCase }) { const s = promiseState(recovery); if (s === "future") return <div><b className="text-blue-700">Aguardar promessa</b><div className="text-xs">{recovery.promiseDate}</div></div>; if (s === "today") return <b className="text-amber-700">Promessa vence hoje</b>; if (s === "broken") return <b className="text-red-700">Promessa quebrada</b>; return recovery.nextActionDate ? <div><b>Retorno</b><div className="text-xs">{recovery.nextActionDate}</div></div> : <span className="text-xs text-muted-foreground">Disponível agora</span>; }

function RecoveryDrawerV2({ clinicId, patient, recovery, score, sales, persistentSales, onUpdate, onSaveSale, onClose }: {
  clinicId: string; patient: PatientDebt; recovery: RecoveryCase; score: number; sales: ConsolidatedSale[]; persistentSales: PersistentSale[];
  onUpdate: (patch: Partial<RecoveryCase>, event?: { type: string; channel: ContactChannel; result: string; note?: string | null }) => Promise<void>;
  onSaveSale: (data: Omit<PersistentSale, "id" | "patientId" | "patientName" | "createdAt" | "updatedAt">) => Promise<void>; onClose: () => void;
}) {
  const [events, setEvents] = useState<RecoveryEvent[]>([]); const [manual, setManual] = useState(false); const pdfRef = useRef<HTMLInputElement | null>(null);
  const [note, setNote] = useState(recovery.note || ""); const [nextDate, setNextDate] = useState(recovery.nextActionDate || ""); const [promiseDate, setPromiseDate] = useState(recovery.promiseDate || ""); const [promiseAmount, setPromiseAmount] = useState(recovery.promiseAmount ? String(recovery.promiseAmount) : "");
  const [docNo, setDocNo] = useState(""); const [saleDate, setSaleDate] = useState(""); const [professional, setProfessional] = useState(""); const [treatments, setTreatments] = useState(""); const [originalValue, setOriginalValue] = useState(""); const [finalValue, setFinalValue] = useState(""); const [condition, setCondition] = useState("");
  useEffect(() => onSnapshot(collection(db, "clinics", clinicId, "financeRecoveryCases", patient.id, "events"), (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecoveryEvent,"id">) })).sort((a,b) => b.createdAt.localeCompare(a.createdAt)))), [clinicId, patient.id]);
  const overdue = patient.installments.filter((i) => daysLate(i.dueDate) > 0); const phone = patient.phones[0] || ""; const wa = phoneDigits(phone);
  const totalOpen = patient.installments.reduce((s,i) => s+i.current,0); const overdueAmount = overdue.reduce((s,i) => s+i.current,0);
  async function saveManual() { const d = baseDocument(docNo); if (!d) return toast.error("Informe o DOC."); await onSaveSale({ doc: d, saleDate, professional: professional.trim(), treatments: treatments.split(/;|,|\n/).map((x) => x.trim()).filter(Boolean), originalValue: parseMoney(originalValue), totalValue: parseMoney(finalValue) || parseMoney(originalValue), condition: condition.trim() || null, installments: [], source: "manual" }); setManual(false); toast.success("Venda atualizada sem duplicar o DOC."); }
  async function importPdf(file?: File) { if (!file) return; try { const parsed = await parseIndividualSalePdfV2(file); await onSaveSale({ ...parsed, source: "pdf" }); toast.success(`DOC ${parsed.doc} conciliado sem duplicidade.`); } catch (e: any) { toast.error(e?.message || "Não consegui ler a venda."); } finally { if (pdfRef.current) pdfRef.current.value = ""; } }
  async function savePromise() { if (!promiseDate) return toast.error("Informe a data."); const amount = parseMoney(promiseAmount); await onUpdate({ status: "promised", promiseDate, promiseAmount: amount || null, nextActionDate: promiseDate, lastContactAt: new Date().toISOString() }, { type: "promise", channel: "whatsapp", result: `Promessa para ${promiseDate}`, note: amount ? money(amount) : null }); }
  return <div className="fixed inset-0 z-[110] flex justify-end bg-black/35" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="h-full w-full max-w-6xl overflow-y-auto bg-background shadow-2xl"><input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void importPdf(e.target.files?.[0])} />
    <div className="sticky top-0 z-10 flex justify-between border-b bg-background/95 p-5"><div><div className="text-xs uppercase text-muted-foreground">Ficha de recuperação</div><h3 className="text-xl font-bold">{patient.name}</h3><div className="text-sm text-muted-foreground">CPF {patient.cpf} • {phone || "sem telefone"}</div></div><Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button></div>
    <div className="space-y-5 p-5">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6"><Metric label="Saldo vencido" value={money(overdueAmount)} danger /><Metric label="Saldo aberto" value={money(totalOpen)} /><Metric label="Parcelas vencidas" value={`${overdue.length}/${patient.installments.length}`} /><Metric label="Maior atraso" value={`${Math.max(0,...overdue.map((i)=>daysLate(i.dueDate)))} dias`} /><Metric label="Score" value={String(score)} danger={score>=75} /><Metric label="Vendas" value={`${sales.length} DOC`} /></div>
      <Card><CardContent className="space-y-4 p-4"><div className="grid gap-3 lg:grid-cols-[220px_180px_1fr_auto]"><Field label="Status"><select value={recovery.status} onChange={(e) => void onUpdate({ status: e.target.value as RecoveryStatus }, { type:"status", channel:"internal", result:`Status: ${STATUS_LABEL[e.target.value as RecoveryStatus]}` })} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{Object.entries(STATUS_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field><Field label="Próxima ação"><Input type="date" value={nextDate} onChange={(e)=>setNextDate(e.target.value)} /></Field><Field label="Observação"><Input value={note} onChange={(e)=>setNote(e.target.value)} /></Field><Button className="self-end" onClick={()=>void onUpdate({ note: note || null, nextActionDate: nextDate || null })}>Salvar</Button></div><div className="flex flex-wrap gap-2 border-t pt-4"><Button variant="outline" disabled={!wa || recovery.optOutWhatsapp} onClick={()=>window.open(`https://wa.me/55${wa}`,"_blank")}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button><Button variant="outline" onClick={()=>void onUpdate({ status:"contacted", lastContactAt:new Date().toISOString() },{type:"contact",channel:"whatsapp",result:"Contato realizado"})}>Registrar contato</Button><Button variant="ghost" className={recovery.optOutWhatsapp?"text-red-700":""} onClick={()=>void onUpdate({optOutWhatsapp:!recovery.optOutWhatsapp},{type:"opt_out",channel:"internal",result:!recovery.optOutWhatsapp?"WhatsApp bloqueado":"WhatsApp liberado"})}><Ban className="mr-2 h-4 w-4" />{recovery.optOutWhatsapp?"WhatsApp bloqueado":"Bloquear WhatsApp"}</Button></div></CardContent></Card>
      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_180px_180px_auto] md:items-end"><div><b>Promessa de pagamento</b><div className="text-sm text-muted-foreground">Sai da fila normal até a data prometida.</div></div><Field label="Data"><Input type="date" value={promiseDate} onChange={(e)=>setPromiseDate(e.target.value)} /></Field><Field label="Valor"><Input value={promiseAmount} onChange={(e)=>setPromiseAmount(e.target.value)} /></Field><Button onClick={()=>void savePromise()}>Marcar promessa</Button></CardContent></Card>
      <Card><CardContent className="p-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><b>Vendas / contratos vinculados</b><div className="text-sm text-muted-foreground">Um único registro por DOC, conciliando relatório, PDF e cadastro manual.</div></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>pdfRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Importar PDF da venda</Button><Button size="sm" variant="outline" onClick={()=>setManual(!manual)}><Plus className="mr-2 h-4 w-4" />Adicionar manualmente</Button></div></div>
        {manual && <div className="grid gap-3 border-b bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-4"><Field label="DOC"><Input value={docNo} onChange={(e)=>setDocNo(e.target.value)} /></Field><Field label="Data da venda"><Input type="date" value={saleDate} onChange={(e)=>setSaleDate(e.target.value)} /></Field><Field label="Profissional"><Input value={professional} onChange={(e)=>setProfessional(e.target.value)} /></Field><Field label="Condição"><Input value={condition} onChange={(e)=>setCondition(e.target.value)} /></Field><Field label="Tratamentos"><Input value={treatments} onChange={(e)=>setTreatments(e.target.value)} /></Field><Field label="Valor original"><Input value={originalValue} onChange={(e)=>setOriginalValue(e.target.value)} placeholder="0,00" /></Field><Field label="Valor fechado / negociado"><Input value={finalValue} onChange={(e)=>setFinalValue(e.target.value)} placeholder="0,00" /></Field><div className="self-end"><Button onClick={()=>void saveManual()}>Salvar / atualizar DOC</Button></div></div>}
        <div className="divide-y">{sales.length ? sales.map((s)=><div key={s.doc} className="grid gap-3 p-4 lg:grid-cols-[100px_1fr_130px_150px_150px]"><div><div className="text-xs text-muted-foreground">DOC</div><b>{s.doc}</b><div className="text-[11px] text-muted-foreground">{s.sources.join(" + ")}</div></div><div><b>{s.treatments.join(" • ") || "Sem descrição"}</b><div className="text-xs text-muted-foreground">{s.professional || "Profissional não informado"}{s.condition?` • ${s.condition}`:""}</div></div><div><div className="text-xs text-muted-foreground">Data</div><b>{s.date || "—"}</b></div><div className="text-right"><div className="text-xs text-muted-foreground">Valor original</div><b>{money(s.original)}</b></div><div className="text-right"><div className="text-xs text-muted-foreground">Fechado / negociado</div><b>{money(s.total)}</b>{s.original>s.total && <div className="text-xs text-emerald-700">Desconto {money(s.original-s.total)}</div>}</div></div>) : <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma venda localizada.</div>}</div>
      </CardContent></Card>
      <Card><CardContent className="p-0"><div className="border-b p-4"><b>Lastro por parcela</b></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground"><th className="px-4 py-3 text-left">Parcela</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3">DOC</th><th className="px-4 py-3">Tratamento</th></tr></thead><tbody>{patient.installments.map((i)=>{const d=baseDocument(i.document);const s=sales.find((x)=>x.doc===d);return <tr key={`${i.document}-${i.dueDate}`} className="border-b"><td className="px-4 py-3 font-semibold">{i.document}</td><td className="px-4 py-3 text-center">{i.dueDate}</td><td className="px-4 py-3 text-right">{money(i.current)}</td><td className="px-4 py-3">{s?<span className="text-emerald-700">DOC {d}</span>:<span className="text-red-700">Não localizada</span>}</td><td className="px-4 py-3">{s?.treatments.join(" • ") || "—"}</td></tr>})}</tbody></table></div></CardContent></Card>
      <Card><CardContent className="p-0"><div className="border-b p-4"><div className="flex items-center gap-2"><History className="h-4 w-4" /><b>Histórico da cobrança</b></div></div>{events.length?<div className="divide-y">{events.map((e)=><div key={e.id} className="grid gap-2 p-4 sm:grid-cols-[150px_120px_1fr]"><div className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</div><div className="text-xs uppercase text-muted-foreground">{e.channel}</div><div><b>{e.result}</b>{e.note&&<div className="text-sm text-muted-foreground">{e.note}</div>}</div></div>)}</div>:<div className="p-6 text-center text-sm text-muted-foreground">Nenhum contato registrado ainda.</div>}</CardContent></Card>
    </div>
  </div></div>;
}
function Metric({label,value,danger=false}:{label:string;value:string;danger?:boolean}){return <div className={`rounded-xl border p-4 ${danger?"border-red-200 bg-red-50/60":"bg-card"}`}><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-2 text-xl font-bold">{value}</div></div>}

async function parseIndividualSalePdfV2(file: File): Promise<Omit<PersistentSale, "id" | "patientId" | "patientName" | "source" | "createdAt" | "updatedAt">> {
  const pdfjs: any = await import(/* @vite-ignore */ "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs"); pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const lines: string[] = [];
  for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const c=await page.getTextContent();const groups=new Map<number,Array<{x:number;t:string}>>();for(const it of c.items as any[]){const t=String(it.str||"").trim();if(!t)continue;const y=Math.round(Number(it.transform?.[5]||0)*2)/2;const list=groups.get(y)||[];list.push({x:Number(it.transform?.[4]||0),t});groups.set(y,list)}[...groups.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,items])=>lines.push(items.sort((a,b)=>a.x-b.x).map(i=>i.t).join(" ").replace(/\s+/g," ").trim()))}
  const joined=lines.join("\n"); const docMatch=joined.match(/DOC\.?\s*:?\s*(\d{3,10})/i)||joined.match(/DOCUMENTO\s*:?\s*(\d{3,10})/i); if(!docMatch) throw new Error("Não encontrei o DOC da venda.");
  const dateMatch=joined.match(/(?:DATA|VENDA)\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i); const responsible=joined.match(/RESPONS[AÁ]VEL\s*:?\s*([^\n]+)/i); const conditionMatch=joined.match(/(?:CONDI[CÇ][AÃ]O|FORMA DE PAGAMENTO)\s*:?\s*([^\n]+)/i);
  const treatments:string[]=[];const installments:Array<{document:string;dueDate:string;value:number}>=[];let originalValue=0;let totalValue=0;
  for(const line of lines){const product=line.match(/^(\d{2,6})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(-?[\d.,]+)\s+(-?[\d.,]+)$/);if(product&&!/DOCUMENTO|PARCELA|VENCTO|EMISSAO/i.test(line)){const qty=parseMoney(product[3]);const unit=parseMoney(product[4]);treatments.push(product[2].trim());originalValue+=qty*unit;totalValue+=parseMoney(product[5]);continue}const inst=line.match(/^(\d{2,10}\/\d{1,3})\s+\d{1,3}\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+\d{2}\/\d{2}\/\d{4}$/);if(inst)installments.push({document:inst[1],dueDate:inst[2],value:parseMoney(inst[3])})}
  const explicit=lines.map(l=>l.match(/^TOTAL:\s+\d+(?:[.,]\d+)?\s+([\d.,]+)$/i)).find(Boolean);if(explicit?.[1])totalValue=parseMoney(explicit[1]);if(!originalValue)originalValue=totalValue;
  return {doc:docMatch[1],saleDate:dateMatch?.[1]||"",professional:responsible?.[1]?.replace(/^\d+\s*-\s*/,"").trim()||"",treatments:Array.from(new Set(treatments)),originalValue,totalValue,condition:conditionMatch?.[1]||null,installments};
}
