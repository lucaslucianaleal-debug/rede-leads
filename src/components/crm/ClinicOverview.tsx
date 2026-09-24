import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Landmark,
  MessageCircle,
  Phone,
  RotateCcw,
  Search,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FINANCE_SNAPSHOT_EVENT,
  financeSnapshotKey,
  type ClinicFinanceSnapshot,
} from "@/components/crm/ClinicFinanceSnapshotBridge";

type ClinicAppointment = {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  professional: string;
  active?: boolean;
  confirmationStatus?: string;
};

type AgendaDestination = "calendar" | "confirmations" | "vacancies" | "rebookings";
type Interval = { start: number; end: number };

type ClinicOverviewProps = {
  onOpenAgenda: (view: AgendaDestination) => void;
  onOpenFinance: () => void;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatMoney = (value: number) => brl.format(value || 0);
const todayKey = () => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date());
const dateSortKey = (value: string) => {
  const [d, m, y] = String(value || "").split("/");
  return `${y || "0000"}-${m || "00"}-${d || "00"}`;
};
const timeToMinutes = (value: string) => {
  const [h, m] = String(value || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};
const prettyProfessional = (value: string) => {
  const clean = String(value || "").replace(/\s+-\s+(ORTO|ENDO|ORC|ORÇ).*$/i, "").replace(/\s+-\s*$/g, "").trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return clean.replace(/^Dra\.?\s*/i, "Dra. ") || "Profissional";
};
const isFreeStatus = (status?: string) => ["released_unconfirmed", "wont_attend", "cancelled", "reschedule"].includes(String(status || ""));
const isBlockedName = (name?: string) => {
  const text = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return text === "." || text.includes("nao agendar") || text.includes("feriado") || text.includes("folga") || text.includes("bloqueio") || text.includes("bloqueado");
};
function slotMinutes(professional: string) {
  const key = prettyProfessional(professional).toLowerCase();
  if (key.includes("tailuene")) return 30;
  if (key.includes("lucas") || key.includes("gabriela") || key.includes("manuela")) return 60;
  return 60;
}
function protectedBreaks(professional: string): Interval[] {
  const key = prettyProfessional(professional).toLowerCase();
  if (key.includes("tailuene")) return [{ start: 12 * 60, end: 14 * 60 }];
  if (key.includes("lucas") || key.includes("gabriela") || key.includes("manuela")) return [{ start: 12 * 60, end: 13 * 60 }];
  return [];
}
function splitAroundBreaks(start: number, end: number, professional: string) {
  let segments: Interval[] = [{ start, end }];
  protectedBreaks(professional).forEach((pause) => {
    const next: Interval[] = [];
    segments.forEach((segment) => {
      if (segment.end <= pause.start || segment.start >= pause.end) return void next.push(segment);
      if (segment.start < pause.start) next.push({ start: segment.start, end: pause.start });
      if (segment.end > pause.end) next.push({ start: pause.end, end: segment.end });
    });
    segments = next;
  });
  return segments;
}
function mergeIntervals(intervals: Interval[]) {
  const sorted = intervals.filter((item) => item.end > item.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  sorted.forEach((item) => {
    const last = merged[merged.length - 1];
    if (!last || item.start > last.end) merged.push({ ...item });
    else last.end = Math.max(last.end, item.end);
  });
  return merged;
}
const intervalMinutes = (items: Interval[]) => mergeIntervals(items).reduce((sum, item) => sum + item.end - item.start, 0);
const formatHours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}min`;
  if (!m) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
};

export function ClinicOverview({ onOpenAgenda, onOpenFinance }: ClinicOverviewProps) {
  const { currentClinic } = useAuth();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [finance, setFinance] = useState<ClinicFinanceSnapshot | null>(null);

  useEffect(() => {
    if (!currentClinic) return;
    return onSnapshot(collection(db, "clinics", currentClinic, "clinicAgenda"), (snapshot) => {
      setAppointments(snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<ClinicAppointment, "id">) }))
        .filter((item) => item.active !== false));
    });
  }, [currentClinic]);

  useEffect(() => {
    if (!currentClinic) return;
    const load = () => {
      try {
        const raw = localStorage.getItem(financeSnapshotKey(currentClinic));
        setFinance(raw ? JSON.parse(raw) : null);
      } catch {
        setFinance(null);
      }
    };
    const onSnapshotUpdate = (event: Event) => {
      const custom = event as CustomEvent<ClinicFinanceSnapshot>;
      if (custom.detail) setFinance(custom.detail);
      else load();
    };
    load();
    window.addEventListener(FINANCE_SNAPSHOT_EVENT, onSnapshotUpdate);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(FINANCE_SNAPSHOT_EVENT, onSnapshotUpdate);
      window.removeEventListener("storage", load);
    };
  }, [currentClinic]);

  const agenda = useMemo(() => {
    const today = todayKey();
    const todaySortable = dateSortKey(today);
    const todays = appointments.filter((item) => item.date === today && !isBlockedName(item.name));
    const future = appointments.filter((item) => dateSortKey(item.date) >= todaySortable && !isBlockedName(item.name));
    const activeToday = todays.filter((item) => !isFreeStatus(item.confirmationStatus));
    const confirmed = activeToday.filter((item) => item.confirmationStatus === "confirmed").length;
    const waiting = activeToday.filter((item) => !["confirmed", "wont_attend", "cancelled", "reschedule", "released_unconfirmed"].includes(String(item.confirmationStatus || "pending"))).length;
    const rebookings = future.filter((item) => ["reschedule", "wont_attend", "cancelled", "released_unconfirmed"].includes(String(item.confirmationStatus || ""))).length;

    const occupiedByDoctor = new Map<string, Interval[]>();
    activeToday.forEach((item) => {
      const professional = prettyProfessional(item.professional);
      const start = timeToMinutes(item.startTime);
      const end = Math.max(timeToMinutes(item.endTime), start + slotMinutes(professional));
      const list = occupiedByDoctor.get(professional) || [];
      splitAroundBreaks(start, end, professional).forEach((segment) => list.push(segment));
      occupiedByDoctor.set(professional, list);
    });

    const vacancyIntervals: Array<{ professional: string; interval: Interval }> = [];
    todays.filter((item) => isFreeStatus(item.confirmationStatus)).forEach((item) => {
      const professional = prettyProfessional(item.professional);
      const start = timeToMinutes(item.startTime);
      const end = Math.max(timeToMinutes(item.endTime), start + slotMinutes(professional));
      splitAroundBreaks(start, end, professional).forEach((interval) => vacancyIntervals.push({ professional, interval }));
    });

    occupiedByDoctor.forEach((intervals, professional) => {
      const required = slotMinutes(professional);
      const merged = mergeIntervals(intervals);
      for (let i = 0; i < merged.length - 1; i += 1) {
        splitAroundBreaks(merged[i].end, merged[i + 1].start, professional).forEach((gap) => {
          if (gap.end - gap.start < required) return;
          let cursor = gap.start;
          while (cursor + required <= gap.end) {
            vacancyIntervals.push({ professional, interval: { start: cursor, end: cursor + required } });
            cursor += required;
          }
        });
      }
    });

    const occupiedMinutes = [...occupiedByDoctor.values()].reduce((sum, intervals) => sum + intervalMinutes(intervals), 0);
    const vacancyMinutes = vacancyIntervals.reduce((sum, item) => sum + item.interval.end - item.interval.start, 0);
    const capacityMinutes = occupiedMinutes + vacancyMinutes;
    const occupancy = capacityMinutes ? Math.round((occupiedMinutes / capacityMinutes) * 100) : activeToday.length ? 100 : 0;
    const occupancyLabel = occupancy >= 80 ? "Dentro" : occupancy >= 60 ? "Atenção" : "Abaixo";

    return {
      total: todays.length,
      active: activeToday.length,
      confirmed,
      waiting,
      rebookings,
      vacancyCount: vacancyIntervals.length,
      occupiedMinutes,
      capacityMinutes,
      occupancy,
      occupancyLabel,
    };
  }, [appointments]);

  const dueTodayAmount = finance?.dueToday.reduce((sum, item) => sum + item.current, 0) || 0;
  const dueTomorrowAmount = finance?.dueTomorrow.reduce((sum, item) => sum + item.current, 0) || 0;
  const confirmationPct = agenda.active ? Math.round((agenda.confirmed / agenda.active) * 100) : 0;

  return (
    <div className="space-y-5">
      <section>
        <h2 className="font-heading text-2xl font-bold">Visão geral da clínica</h2>
        <p className="mt-1 text-sm text-muted-foreground">Uma leitura rápida do que está cheio, do que está em risco e do que precisa virar ação hoje.</p>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden border-emerald-200/80">
          <CardContent className="p-0">
            <div className="border-b bg-emerald-50/55 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xl font-bold"><CalendarDays className="h-5 w-5 text-emerald-700" />Agenda</div>
                  <p className="mt-1 text-sm text-muted-foreground">Ocupação, confirmação, vagas e movimentos de hoje.</p>
                </div>
                <div className={`rounded-full border px-3 py-1 text-sm font-semibold ${agenda.occupancy >= 80 ? "border-emerald-200 bg-emerald-100 text-emerald-800" : agenda.occupancy >= 60 ? "border-amber-200 bg-amber-100 text-amber-800" : "border-red-200 bg-red-100 text-red-800"}`}>
                  {agenda.occupancyLabel}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background/80 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ocupação de hoje</div>
                  <div className="mt-1 flex items-end gap-2"><span className="text-3xl font-bold">{agenda.occupancy}%</span><span className="pb-1 text-xs text-muted-foreground">da capacidade utilizável</span></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${agenda.occupancy >= 80 ? "bg-emerald-500" : agenda.occupancy >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, agenda.occupancy)}%` }} /></div>
                  <div className="mt-2 text-xs text-muted-foreground">{formatHours(agenda.occupiedMinutes)} ocupadas de {formatHours(agenda.capacityMinutes)}</div>
                </div>
                <div className="rounded-xl border bg-background/80 p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Confirmação de hoje</div>
                  <div className="mt-1 flex items-end gap-2"><span className="text-3xl font-bold">{confirmationPct}%</span><span className="pb-1 text-xs text-muted-foreground">confirmado</span></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><b className="text-base text-emerald-700">{agenda.confirmed}</b><div className="text-muted-foreground">confirmados</div></div><div><b className="text-base text-amber-700">{agenda.waiting}</b><div className="text-muted-foreground">aguardando</div></div></div>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-3 flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4" />Leitura de hoje</div>
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <Question answer={agenda.occupancyLabel === "Dentro" ? "Sim, está dentro." : agenda.occupancyLabel === "Atenção" ? "Está em atenção." : "Está abaixo."} question="A agenda está dentro?" />
                  <Question answer={`${agenda.vacancyCount} vaga(s) utilizável(is).`} question="Onde ainda cabe paciente?" />
                  <Question answer={agenda.waiting ? `${agenda.waiting} ainda sem confirmação.` : "Nenhuma confirmação pendente."} question="Qual o risco imediato?" />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Shortcut label="Calendário" helper={`${agenda.total} consulta(s) hoje`} icon={<CalendarDays className="h-4 w-4" />} onClick={() => onOpenAgenda("calendar")} />
                <Shortcut label="Confirmações" helper={`${agenda.waiting} aguardando`} icon={<MessageCircle className="h-4 w-4" />} onClick={() => onOpenAgenda("confirmations")} />
                <Shortcut label="Vagas" helper={`${agenda.vacancyCount} utilizável(is) hoje`} icon={<Search className="h-4 w-4" />} onClick={() => onOpenAgenda("vacancies")} />
                <Shortcut label="Reagendamentos" helper={`${agenda.rebookings} precisam ação`} icon={<RotateCcw className="h-4 w-4" />} onClick={() => onOpenAgenda("rebookings")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-blue-200/80">
          <CardContent className="p-0">
            <div className="border-b bg-blue-50/55 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xl font-bold"><Landmark className="h-5 w-5 text-blue-700" />Financeiro</div>
                  <p className="mt-1 text-sm text-muted-foreground">O que vence agora para você preparar cobrança antes de virar atraso.</p>
                </div>
                <Button size="sm" variant="outline" className="gap-2 bg-background" onClick={onOpenFinance}>Abrir Financeiro<ArrowRight className="h-4 w-4" /></Button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DueCard title="Vence hoje" count={finance?.dueToday.length ?? null} amount={dueTodayAmount} icon={<Clock3 className="h-5 w-5" />} tone="today" />
                <DueCard title="Vence amanhã" count={finance?.dueTomorrow.length ?? null} amount={dueTomorrowAmount} icon={<CalendarDays className="h-5 w-5" />} tone="tomorrow" />
              </div>
            </div>

            <div className="space-y-4 p-4">
              {!finance ? (
                <div className="rounded-xl border border-dashed bg-muted/20 p-5 text-center">
                  <WalletCards className="mx-auto h-6 w-6 text-muted-foreground" />
                  <div className="mt-2 font-semibold">Vencimentos ainda não carregados</div>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Importe o relatório de cobrança no Financeiro. Depois disso, hoje e amanhã passam a aparecer aqui automaticamente neste navegador.</p>
                  <Button className="mt-4" size="sm" onClick={onOpenFinance}>Ir para o Financeiro</Button>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DueList title="Cobrar hoje" items={finance.dueToday} empty="Nenhum vencimento hoje." />
                    <DueList title="Preparar amanhã" items={finance.dueTomorrow} empty="Nenhum vencimento amanhã." />
                  </div>
                  <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" /><div><div className="font-semibold">{finance.overdueCount} parcela(s) já vencida(s)</div><div className="text-xs text-muted-foreground">Saldo identificado: {formatMoney(finance.overdueAmount)}</div></div></div>
                    <div className="text-xs text-muted-foreground">Atualizado {new Date(finance.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Question({ question, answer }: { question: string; answer: string }) {
  return <div className="rounded-lg bg-background p-3"><div className="text-xs text-muted-foreground">{question}</div><div className="mt-1 font-semibold">{answer}</div></div>;
}

function DueCard({ title, count, amount, icon, tone }: { title: string; count: number | null; amount: number; icon: React.ReactNode; tone: "today" | "tomorrow" }) {
  return (
    <div className={`rounded-xl border bg-background/85 p-4 ${tone === "today" ? "border-blue-200" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div><div className="mt-1 text-3xl font-bold">{count === null ? "—" : count}</div></div><div className="rounded-lg border bg-muted/20 p-2 text-muted-foreground">{icon}</div></div>
      <div className="mt-2 text-sm font-medium">{count === null ? "Importe o relatório" : formatMoney(amount)}</div>
    </div>
  );
}

function DueList({ title, items, empty }: { title: string; items: ClinicFinanceSnapshot["dueToday"]; empty: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-3 font-semibold">{title}</div>
      {items.length ? <div className="space-y-2">{items.slice(0, 4).map((item) => (
        <div key={`${item.name}-${item.document}-${item.dueDate}`} className="flex items-center justify-between gap-3 rounded-lg bg-muted/25 px-3 py-2">
          <div className="min-w-0"><div className="truncate text-sm font-medium">{item.name}</div><div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Phone className="h-3 w-3" />{item.phone || "Sem telefone"}</div></div>
          <div className="shrink-0 text-sm font-semibold">{formatMoney(item.current)}</div>
        </div>
      ))}{items.length > 4 && <div className="text-xs text-muted-foreground">+ {items.length - 4} paciente(s)</div>}</div> : <div className="py-5 text-center text-sm text-muted-foreground">{empty}</div>}
    </div>
  );
}

function Shortcut({ label, helper, icon, onClick }: { label: string; helper: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-between rounded-xl border bg-background p-3 text-left transition hover:bg-muted/40">
      <div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-muted p-2">{icon}</div><div className="min-w-0"><div className="font-medium">{label}</div><div className="truncate text-xs text-muted-foreground">{helper}</div></div></div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
