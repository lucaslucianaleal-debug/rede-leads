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

type Props = {
  onOpenAgenda: (view: AgendaDestination) => void;
  onOpenFinance: () => void;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: number) => brl.format(value || 0);
const todayKey = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
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

export function ClinicOverviewV2({ onOpenAgenda, onOpenFinance }: Props) {
  const { currentClinic } = useAuth();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [finance, setFinance] = useState<ClinicFinanceSnapshot | null>(null);

  useEffect(() => {
    if (!currentClinic) return;
    return onSnapshot(collection(db, "clinics", currentClinic, "clinicAgenda"), (snapshot) => {
      setAppointments(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ClinicAppointment, "id">) })).filter((item) => item.active !== false));
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
    const updated = (event: Event) => {
      const custom = event as CustomEvent<ClinicFinanceSnapshot>;
      if (custom.detail) setFinance(custom.detail);
      else load();
    };
    load();
    window.addEventListener(FINANCE_SNAPSHOT_EVENT, updated);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(FINANCE_SNAPSHOT_EVENT, updated);
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

    const vacancies: Array<{ professional: string; interval: Interval }> = [];
    todays.filter((item) => isFreeStatus(item.confirmationStatus)).forEach((item) => {
      const professional = prettyProfessional(item.professional);
      const start = timeToMinutes(item.startTime);
      const end = Math.max(timeToMinutes(item.endTime), start + slotMinutes(professional));
      splitAroundBreaks(start, end, professional).forEach((interval) => vacancies.push({ professional, interval }));
    });
    occupiedByDoctor.forEach((intervals, professional) => {
      const required = slotMinutes(professional);
      const merged = mergeIntervals(intervals);
      for (let i = 0; i < merged.length - 1; i += 1) {
        splitAroundBreaks(merged[i].end, merged[i + 1].start, professional).forEach((gap) => {
          let cursor = gap.start;
          while (cursor + required <= gap.end) {
            vacancies.push({ professional, interval: { start: cursor, end: cursor + required } });
            cursor += required;
          }
        });
      }
    });
    const occupiedMinutes = [...occupiedByDoctor.values()].reduce((sum, intervals) => sum + intervalMinutes(intervals), 0);
    const vacancyMinutes = vacancies.reduce((sum, item) => sum + item.interval.end - item.interval.start, 0);
    const capacityMinutes = occupiedMinutes + vacancyMinutes;
    const occupancy = capacityMinutes ? Math.round((occupiedMinutes / capacityMinutes) * 100) : activeToday.length ? 100 : 0;
    return {
      total: todays.length,
      active: activeToday.length,
      confirmed,
      waiting,
      rebookings,
      vacancies: vacancies.length,
      occupiedMinutes,
      capacityMinutes,
      occupancy,
      occupancyLabel: occupancy >= 80 ? "Dentro" : occupancy >= 60 ? "Atenção" : "Abaixo",
    };
  }, [appointments]);

  const confirmationPct = agenda.active ? Math.round((agenda.confirmed / agenda.active) * 100) : 0;
  const dueTodayAmount = finance?.dueToday.reduce((sum, item) => sum + item.current, 0) || 0;
  const dueTomorrowAmount = finance?.dueTomorrow.reduce((sum, item) => sum + item.current, 0) || 0;

  return (
    <div className="space-y-5">
      <section><h2 className="font-heading text-2xl font-bold">Visão geral da clínica</h2><p className="mt-1 text-sm text-muted-foreground">O que exige decisão agora, separado entre Agenda e Financeiro.</p></section>

      <section className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden border-emerald-200/80">
          <CardContent className="p-0">
            <div className="border-b bg-emerald-50/55 p-5">
              <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xl font-bold"><CalendarDays className="h-5 w-5 text-emerald-700" />Agenda</div><p className="mt-1 text-sm text-muted-foreground">Ocupação, confirmação e espaços que ainda podem virar produção.</p></div><span className={`rounded-full border px-3 py-1 text-sm font-semibold ${agenda.occupancy >= 80 ? "border-emerald-200 bg-emerald-100 text-emerald-800" : agenda.occupancy >= 60 ? "border-amber-200 bg-amber-100 text-amber-800" : "border-red-200 bg-red-100 text-red-800"}`}>{agenda.occupancyLabel}</span></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <OverviewMetric label="Ocupação de hoje" value={`${agenda.occupancy}%`} helper={`${formatHours(agenda.occupiedMinutes)} de ${formatHours(agenda.capacityMinutes)} utilizáveis`} />
                <OverviewMetric label="Confirmação de hoje" value={`${confirmationPct}%`} helper={`${agenda.confirmed} confirmados • ${agenda.waiting} aguardando`} />
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-xl border bg-muted/20 p-4"><div className="mb-3 flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4" />Leitura de hoje</div><div className="grid gap-2 sm:grid-cols-3"><Question question="A agenda está dentro?" answer={agenda.occupancyLabel === "Dentro" ? "Sim, está dentro." : agenda.occupancyLabel === "Atenção" ? "Está em atenção." : "Está abaixo."} /><Question question="Onde ainda cabe paciente?" answer={`${agenda.vacancies} vaga(s) utilizável(is).`} /><Question question="Qual o risco imediato?" answer={agenda.waiting ? `${agenda.waiting} ainda sem confirmação.` : "Nenhuma confirmação pendente."} /></div></div>
              <div className="grid gap-2 sm:grid-cols-2"><Shortcut label="Calendário" helper={`${agenda.total} consulta(s) hoje`} icon={<CalendarDays className="h-4 w-4" />} onClick={() => onOpenAgenda("calendar")} /><Shortcut label="Confirmações" helper={`${agenda.waiting} aguardando`} icon={<MessageCircle className="h-4 w-4" />} onClick={() => onOpenAgenda("confirmations")} /><Shortcut label="Vagas" helper={`${agenda.vacancies} utilizável(is) hoje`} icon={<Search className="h-4 w-4" />} onClick={() => onOpenAgenda("vacancies")} /><Shortcut label="Reagendamentos" helper={`${agenda.rebookings} precisam ação`} icon={<RotateCcw className="h-4 w-4" />} onClick={() => onOpenAgenda("rebookings")} /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-red-200/80">
          <CardContent className="p-0">
            <div className="border-b bg-red-50/45 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-xl font-bold"><Landmark className="h-5 w-5 text-red-700" />Financeiro</div><p className="mt-1 text-sm text-muted-foreground">Primeiro recuperamos o que já venceu; depois prevenimos os próximos vencimentos.</p></div><Button size="sm" variant="outline" className="gap-2 bg-background" onClick={onOpenFinance}>Abrir Financeiro<ArrowRight className="h-4 w-4" /></Button></div>

              {!finance ? (
                <div className="mt-5 rounded-xl border border-dashed bg-background/70 p-5 text-center"><WalletCards className="mx-auto h-6 w-6 text-muted-foreground" /><div className="mt-2 font-semibold">Base financeira ainda não carregada</div><p className="mt-1 text-sm text-muted-foreground">Importe o relatório de cobrança para liberar recuperação e vencimentos.</p></div>
              ) : (
                <>
                  <button onClick={onOpenFinance} className="mt-5 w-full rounded-xl border border-red-200 bg-background p-4 text-left transition hover:bg-red-50/40">
                    <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-700"><AlertTriangle className="h-4 w-4" />Recuperação pendente</div><div className="mt-2 text-3xl font-bold">{money(finance.overdueAmount)}</div><div className="mt-1 text-sm text-muted-foreground">{finance.overdueCount} parcela(s) já vencida(s)</div></div><ArrowRight className="mt-2 h-5 w-5 text-red-700" /></div>
                  </button>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2"><DueMetric title="Vence hoje" count={finance.dueToday.length} amount={dueTodayAmount} icon={<Clock3 className="h-4 w-4" />} /><DueMetric title="Vence amanhã" count={finance.dueTomorrow.length} amount={dueTomorrowAmount} icon={<CalendarDays className="h-4 w-4" />} /></div>
                </>
              )}
            </div>

            <div className="p-4">
              {finance ? (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="font-semibold">Leitura financeira de agora</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Question question="Tem recuperação pendente?" answer={finance.overdueCount ? `Sim. ${finance.overdueCount} parcela(s).` : "Não há parcelas vencidas."} />
                    <Question question="Cobrar preventivamente hoje?" answer={finance.dueToday.length ? `${finance.dueToday.length} paciente(s).` : "Nenhum vencimento hoje."} />
                    <Question question="Preparar amanhã?" answer={finance.dueTomorrow.length ? `${finance.dueTomorrow.length} paciente(s).` : "Nenhum vencimento amanhã."} />
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">Atualizado {new Date(finance.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              ) : (
                <Button className="w-full" onClick={onOpenFinance}>Ir para o Financeiro</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function OverviewMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className="rounded-xl border bg-background/80 p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-3xl font-bold">{value}</div><div className="mt-2 text-xs text-muted-foreground">{helper}</div></div>;
}

function DueMetric({ title, count, amount, icon }: { title: string; count: number; amount: number; icon: React.ReactNode }) {
  return <div className="rounded-xl border bg-background/85 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div><div className="mt-1 text-2xl font-bold">{count}</div><div className="mt-1 text-sm font-medium">{money(amount)}</div></div><div className="rounded-lg border bg-muted/20 p-2 text-muted-foreground">{icon}</div></div></div>;
}

function Question({ question, answer }: { question: string; answer: string }) {
  return <div className="rounded-lg bg-background p-3"><div className="text-xs text-muted-foreground">{question}</div><div className="mt-1 font-semibold">{answer}</div></div>;
}

function Shortcut({ label, helper, icon, onClick }: { label: string; helper: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center justify-between rounded-xl border bg-background p-3 text-left transition hover:bg-muted/40"><div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-muted p-2">{icon}</div><div className="min-w-0"><div className="font-medium">{label}</div><div className="truncate text-xs text-muted-foreground">{helper}</div></div></div><ArrowRight className="h-4 w-4 text-muted-foreground" /></button>;
}
