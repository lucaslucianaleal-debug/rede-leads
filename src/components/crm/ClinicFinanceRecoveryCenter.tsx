import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  FileWarning,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
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
  updatedAt?: string | null;
  updatedBy?: string | null;
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

export function ClinicFinanceRecoveryCenter({ salesItems = [] }: { salesItems?: SaleItem[] }) {
  const { currentClinic, user } = useAuth();
  const [store, setStore] = useState<FinanceStore | null>(null);
  const [cases, setCases] = useState<Record<string, RecoveryCase>>({});
  const [open, setOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientDebt | null>(null);
  const [bucket, setBucket] = useState<BucketKey>("all");
  const [statusFilter, setStatusFilter] = useState<RecoveryStatus | "all">("all");
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
        next[data.patientId || item.id] = { ...data, patientId: data.patientId || item.id };
      });
      setCases(next);
    });
  }, [currentClinic]);

  const salesIndex = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    for (const item of salesItems) {
      const key = baseDocument(item.document);
      if (!key) continue;
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    }
    return map;
  }, [salesItems]);

  const overduePatients = useMemo(() => (store?.patients || [])
    .map((patient) => {
      const overdue = patient.installments.filter((item) => daysLate(item.dueDate) > 0);
      const totalOpen = patient.installments.reduce((sum, item) => sum + item.current, 0);
      const overdueAmount = overdue.reduce((sum, item) => sum + item.current, 0);
      const oldest = overdue.length ? Math.max(...overdue.map((item) => daysLate(item.dueDate))) : 0;
      const matchedDocs = new Set(overdue.filter((item) => salesIndex.has(baseDocument(item.document))).map((item) => baseDocument(item.document)));
      const allDocs = new Set(overdue.map((item) => baseDocument(item.document)).filter(Boolean));
      const treatments = Array.from(new Set(overdue.flatMap((item) => (salesIndex.get(baseDocument(item.document)) || []).map((sale) => sale.description)).filter(Boolean)));
      return { patient, overdue, totalOpen, overdueAmount, oldest, matchedDocs: matchedDocs.size, allDocs: allDocs.size, treatments };
    })
    .filter((row) => row.overdue.length > 0), [salesIndex, store]);

  const metrics = useMemo(() => {
    const overdueAmount = overduePatients.reduce((sum, row) => sum + row.overdueAmount, 0);
    const installments = overduePatients.reduce((sum, row) => sum + row.overdue.length, 0);
    const criticalPatients = overduePatients.filter((row) => row.oldest > 90).length;
    const noLastro = overduePatients.filter((row) => row.allDocs > 0 && row.matchedDocs === 0).length;
    return { overdueAmount, installments, patients: overduePatients.length, criticalPatients, noLastro };
  }, [overduePatients]);

  const rows = useMemo(() => {
    const term = normalize(search);
    return overduePatients
      .map((row) => {
        const matching = bucket === "all" ? row.overdue : row.overdue.filter((item) => bucketFor(daysLate(item.dueDate)) === bucket);
        const recovery = cases[row.patient.id] || { patientId: row.patient.id, patientName: row.patient.name, status: "pending" as RecoveryStatus };
        const searchable = normalize([row.patient.name, row.patient.cpf, ...row.patient.phones, ...row.treatments, STATUS_LABEL[recovery.status]].join(" "));
        return { ...row, matching, recovery, searchable };
      })
      .filter((row) => row.matching.length > 0)
      .filter((row) => statusFilter === "all" || row.recovery.status === statusFilter)
      .filter((row) => !term || row.searchable.includes(term))
      .sort((a, b) => {
        if (a.recovery.status === "pending" && b.recovery.status !== "pending") return -1;
        if (a.recovery.status !== "pending" && b.recovery.status === "pending") return 1;
        return b.oldest - a.oldest || b.overdueAmount - a.overdueAmount;
      });
  }, [bucket, cases, overduePatients, search, statusFilter]);

  async function updateCase(patient: PatientDebt, patch: Partial<RecoveryCase>) {
    if (!currentClinic) return;
    const current = cases[patient.id] || { patientId: patient.id, patientName: patient.name, status: "pending" as RecoveryStatus };
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
    } catch (error) {
      console.error("[finance-recovery-case]", error);
      toast.error("Não consegui salvar o andamento da cobrança.");
    }
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
                <Button className="gap-2" onClick={() => setOpen(true)}>Abrir recuperação <ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">Esta é a carteira que precisa de ação agora. Vencimentos de hoje e amanhã entram como prevenção, não substituem a recuperação dos atrasados.</div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 xl:grid-cols-2">
              <MiniMetric icon={<UsersRound className="h-4 w-4" />} label="Em recuperação" value={String(metrics.patients)} />
              <MiniMetric icon={<AlertTriangle className="h-4 w-4" />} label="Críticos +90d" value={String(metrics.criticalPatients)} />
              <MiniMetric icon={<FileWarning className="h-4 w-4" />} label="Sem lastro localizado" value={String(metrics.noLastro)} />
              <MiniMetric icon={<CalendarClock className="h-4 w-4" />} label="Com retorno marcado" value={String(Object.values(cases).filter((item) => item.nextActionDate).length)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {open && (
        <div className="fixed inset-0 z-[90] bg-black/45 p-3 sm:p-5">
          <div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
            <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-red-700" /><h2 className="text-xl font-bold">Central de Recuperação de Contas</h2></div>
                <div className="mt-1 text-sm text-muted-foreground">Fila operacional com carteira completa, lastro e andamento da cobrança.</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-lg border bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{money(metrics.overdueAmount)} vencidos</div>
                <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
              </div>
            </div>

            <div className="space-y-3 border-b bg-muted/20 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                  {BUCKETS.map((item) => <button key={item.key} onClick={() => setBucket(item.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${bucket === item.key ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{item.label}</button>)}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as RecoveryStatus | "all")} className="h-9 rounded-md border bg-background px-3 text-sm">
                    <option value="all">Todos os status</option>
                    {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <div className="relative w-full sm:w-[320px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Paciente, CPF, telefone ou tratamento" className="pl-9" /></div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[1320px] text-sm">
                <thead className="sticky top-0 z-10 bg-background"><tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3">Parcelas</th><th className="px-4 py-3 text-right">Maior atraso</th><th className="px-4 py-3 text-right">Saldo vencido</th><th className="px-4 py-3 text-right">Saldo aberto</th><th className="px-4 py-3">Lastro</th><th className="px-4 py-3">Tratamento</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const phone = row.patient.phones[0] || "";
                    const wa = phoneDigits(phone);
                    const matched = row.allDocs > 0 && row.matchedDocs === row.allDocs;
                    return (
                      <tr key={row.patient.id} className="border-b align-top hover:bg-muted/25">
                        <td className="px-4 py-3"><button className="text-left font-semibold hover:underline" onClick={() => setSelectedPatient(row.patient)}>{row.patient.name}</button><div className="mt-0.5 text-xs text-muted-foreground">{row.patient.cpf}</div>{row.recovery.nextActionDate && <div className="mt-1 text-xs font-medium text-blue-700">Retorno: {row.recovery.nextActionDate}</div>}</td>
                        <td className="px-4 py-3"><select value={row.recovery.status} onChange={(event) => void updateCase(row.patient, { status: event.target.value as RecoveryStatus, ...(event.target.value === "contacted" ? { lastContactAt: new Date().toISOString() } : {}) })} className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(row.recovery.status)}`}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                        <td className="px-4 py-3">{phone || <span className="text-muted-foreground">Sem telefone</span>}</td>
                        <td className="px-4 py-3"><div className="font-semibold">{row.patient.installments.length} abertas</div><div className="text-xs text-muted-foreground">{row.overdue.length} vencidas{bucket !== "all" ? ` • ${row.matching.length} nesta faixa` : ""}</div></td>
                        <td className="px-4 py-3 text-right font-semibold">{row.oldest} dias</td>
                        <td className="px-4 py-3 text-right font-semibold text-red-700">{money(row.overdueAmount)}</td>
                        <td className="px-4 py-3 text-right">{money(row.totalOpen)}</td>
                        <td className="px-4 py-3">{matched ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"><FileCheck2 className="h-3.5 w-3.5" />Completo</span> : row.matchedDocs > 0 ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Parcial {row.matchedDocs}/{row.allDocs}</span> : <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Não localizado</span>}</td>
                        <td className="max-w-[300px] px-4 py-3">{row.treatments.length ? <div className="font-medium">{row.treatments.slice(0, 2).join(" • ")}{row.treatments.length > 2 ? ` +${row.treatments.length - 2}` : ""}</div> : <span className="text-xs text-muted-foreground">Importe/atualize Vendas</span>}</td>
                        <td className="px-4 py-3"><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => setSelectedPatient(row.patient)}>Ficha</Button><Button size="icon" variant="outline" title="WhatsApp" disabled={!wa} onClick={() => window.open(`https://wa.me/55${wa}`, "_blank")}><MessageCircle className="h-4 w-4" /></Button></div></td>
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

      {selectedPatient && (
        <RecoveryDrawer
          patient={selectedPatient}
          recovery={cases[selectedPatient.id] || { patientId: selectedPatient.id, patientName: selectedPatient.name, status: "pending" }}
          salesIndex={salesIndex}
          onUpdate={(patch) => updateCase(selectedPatient, patch)}
          onClose={() => setSelectedPatient(null)}
        />
      )}
    </>
  );
}

function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="bg-background p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-2 text-xl font-bold">{value}</div></div>;
}

function RecoveryDrawer({ patient, recovery, salesIndex, onUpdate, onClose }: {
  patient: PatientDebt;
  recovery: RecoveryCase;
  salesIndex: Map<string, SaleItem[]>;
  onUpdate: (patch: Partial<RecoveryCase>) => Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState(recovery.note || "");
  const [nextActionDate, setNextActionDate] = useState(recovery.nextActionDate || "");
  const overdue = patient.installments.filter((item) => daysLate(item.dueDate) > 0);
  const overdueAmount = overdue.reduce((sum, item) => sum + item.current, 0);
  const totalOpen = patient.installments.reduce((sum, item) => sum + item.current, 0);
  const phone = patient.phones[0] || "";
  const wa = phoneDigits(phone);

  const saveNotes = async () => {
    await onUpdate({ note: note.trim() || null, nextActionDate: nextActionDate || null });
    toast.success("Acompanhamento da cobrança salvo.");
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/35" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="h-full w-full max-w-5xl overflow-y-auto bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background/95 p-5 backdrop-blur">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ficha de recuperação</div><h3 className="mt-1 text-xl font-bold">{patient.name}</h3><div className="mt-1 text-sm text-muted-foreground">CPF {patient.cpf} • {phone || "sem telefone"}</div></div>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="space-y-5 p-5">
          <section className="grid gap-3 sm:grid-cols-4">
            <Metric label="Saldo vencido" value={money(overdueAmount)} danger />
            <Metric label="Saldo aberto" value={money(totalOpen)} />
            <Metric label="Parcelas vencidas" value={`${overdue.length}/${patient.installments.length}`} />
            <Metric label="Maior atraso" value={`${Math.max(...overdue.map((item) => daysLate(item.dueDate)))} dias`} />
          </section>

          <Card>
            <CardContent className="grid gap-4 p-4 lg:grid-cols-[220px_180px_1fr_auto] lg:items-end">
              <div><label className="text-xs font-semibold text-muted-foreground">Status da cobrança</label><select value={recovery.status} onChange={(event) => void onUpdate({ status: event.target.value as RecoveryStatus, ...(event.target.value === "contacted" ? { lastContactAt: new Date().toISOString() } : {}) })} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Próxima ação</label><Input className="mt-1" type="date" value={nextActionDate} onChange={(event) => setNextActionDate(event.target.value)} /></div>
              <div><label className="text-xs font-semibold text-muted-foreground">Observação interna</label><Input className="mt-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: pediu retorno após dia 30, aguardando comprovante..." /></div>
              <div className="flex gap-2"><Button onClick={() => void saveNotes()}>Salvar</Button><Button size="icon" variant="outline" title="WhatsApp" disabled={!wa} onClick={() => window.open(`https://wa.me/55${wa}`, "_blank")}><MessageCircle className="h-4 w-4" /></Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="border-b p-4"><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-700" />Lastro da cobrança</div><div className="mt-1 text-sm text-muted-foreground">Cada parcela é cruzada pelo DOC com a venda e o tratamento importados.</div></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead><tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground"><th className="px-4 py-3">Parcela</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Atraso</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3">Venda / DOC</th><th className="px-4 py-3">Serviço / tratamento</th><th className="px-4 py-3">Data da venda</th></tr></thead>
                  <tbody>{[...patient.installments].sort((a, b) => daysLate(b.dueDate) - daysLate(a.dueDate)).map((item) => {
                    const docKey = baseDocument(item.document);
                    const sales = salesIndex.get(docKey) || [];
                    const treatments = Array.from(new Set(sales.map((sale) => sale.description).filter(Boolean)));
                    const dates = Array.from(new Set(sales.map((sale) => sale.date).filter(Boolean)));
                    return <tr key={`${item.document}-${item.dueDate}`} className="border-b"><td className="px-4 py-3 font-semibold">{item.document}</td><td className="px-4 py-3">{item.dueDate}</td><td className="px-4 py-3 text-right">{daysLate(item.dueDate) ? `${daysLate(item.dueDate)} dias` : "Em dia"}</td><td className="px-4 py-3 text-right font-semibold">{money(item.current)}</td><td className="px-4 py-3">{sales.length ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" />DOC {docKey}</span> : <span className="text-red-700">Não localizada</span>}</td><td className="max-w-[360px] px-4 py-3">{treatments.length ? treatments.join(" • ") : "—"}</td><td className="px-4 py-3">{dates.join(", ") || "—"}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {recovery.updatedAt && <div className="text-xs text-muted-foreground">Última atualização operacional: {new Date(recovery.updatedAt).toLocaleString("pt-BR")} {recovery.updatedBy ? `• ${recovery.updatedBy}` : ""}</div>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={`rounded-xl border p-4 ${danger ? "border-red-200 bg-red-50/60" : "bg-card"}`}><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-2 text-xl font-bold ${danger ? "text-red-800" : ""}`}>{value}</div></div>;
}
