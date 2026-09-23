import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ClinicConfirmations } from "@/components/crm/ClinicConfirmations";
import { AlertCircle, CheckCircle2, Clock3, Filter, MessageCircle, RotateCcw, Send, UserRound, XCircle } from "lucide-react";

type ClinicAppointment = {
  id: string;
  name: string;
  phone: string;
  date: string;
  startTime: string;
  endTime: string;
  professional: string;
  active?: boolean;
  confirmationStatus?: string;
  lastReminderSentAt?: string;
  lastReminderError?: string | null;
  lastReplyAt?: string;
  lastReplyText?: string;
  confirmationDeadlineAt?: string;
  vacancyReleasedAt?: string;
};

type RangeKey = "today" | "tomorrow" | "48h" | "7d" | "pending" | "rebook";

const DOCTOR_COLORS = [
  { bg: "#E8F0FE", border: "#6B8FDB", text: "#2E4A7D" },
  { bg: "#F3E8FF", border: "#9B72CF", text: "#5B347B" },
  { bg: "#E7F7EF", border: "#57A97C", text: "#286243" },
  { bg: "#FFF0E2", border: "#D9924E", text: "#7B4A1F" },
  { bg: "#FCE9EE", border: "#CC7187", text: "#7F3B4D" },
  { bg: "#E8F7F7", border: "#56A7A7", text: "#2F6666" },
];

const stripAccents = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeKey = (value: string) => stripAccents(String(value || "")).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const prettyProfessional = (value: string) => {
  const clean = String(value || "")
    .replace(/\s+-\s+(ORTO|ENDO|ORC|ORÇ).*$/i, "")
    .replace(/\s+-\s*$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return clean.replace(/^Dra\.?\s*/i, "Dra. ") || "Profissional não identificada";
};
const colorForDoctor = (value: string) => DOCTOR_COLORS[hashString(normalizeKey(value)) % DOCTOR_COLORS.length];

function appointmentDate(item: ClinicAppointment) {
  const match = `${item.date} ${item.startTime}`.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, d, m, y, h, min] = match;
  const date = new Date(`${y}-${m}-${d}T${h}:${min}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function brDayKey(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function statusMeta(item: ClinicAppointment) {
  const status = String(item.confirmationStatus || "pending");
  if (status === "confirmed") return { label: "Confirmado", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
  if (status === "wont_attend" || status === "cancelled") return { label: "Não vai", cls: "bg-red-50 text-red-700", icon: XCircle };
  if (status === "reschedule") return { label: "Reagendar", cls: "bg-violet-50 text-violet-700", icon: RotateCcw };
  if (status === "released_unconfirmed") return { label: "Vaga liberada", cls: "bg-red-50 text-red-700", icon: AlertCircle };
  if (status === "replied" || item.lastReplyAt) return { label: "Resposta para revisar", cls: "bg-amber-50 text-amber-700", icon: MessageCircle };
  if (status === "failed" || item.lastReminderError) return { label: "Erro", cls: "bg-red-50 text-red-700", icon: AlertCircle };
  if (status === "sent") return { label: "Aguardando resposta", cls: "bg-blue-50 text-blue-700", icon: Send };
  if (status === "queued") return { label: "Na fila", cls: "bg-blue-50 text-blue-700", icon: Send };
  return { label: "Programado", cls: "bg-slate-100 text-slate-700", icon: Clock3 };
}

function formatDeadline(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

export function ClinicConfirmationCenter() {
  const { currentClinic } = useAuth();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [range, setRange] = useState<RangeKey>("48h");
  const [doctor, setDoctor] = useState("all");
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    if (!currentClinic) return;
    return onSnapshot(collection(db, "clinics", currentClinic, "clinicAgenda"), (snapshot) => {
      setAppointments(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ClinicAppointment, "id">) })).filter((item) => item.active !== false));
    });
  }, [currentClinic]);

  const doctors = useMemo(() => Array.from(new Set(appointments.map((item) => prettyProfessional(item.professional)))).sort(), [appointments]);
  const visible = useMemo(() => {
    const now = new Date();
    const today = brDayKey(now);
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrow = brDayKey(tomorrowDate);
    const plus48 = now.getTime() + 48 * 60 * 60 * 1000;
    const plus7d = now.getTime() + 7 * 24 * 60 * 60 * 1000;

    return appointments.filter((item) => {
      if (doctor !== "all" && prettyProfessional(item.professional) !== doctor) return false;
      const date = appointmentDate(item);
      if (!date || date.getTime() <= now.getTime()) return false;
      const status = String(item.confirmationStatus || "pending");
      if (range === "today") return item.date === today;
      if (range === "tomorrow") return item.date === tomorrow;
      if (range === "48h") return date.getTime() <= plus48;
      if (range === "7d") return date.getTime() <= plus7d;
      if (range === "pending") return !["confirmed", "wont_attend", "cancelled", "reschedule", "released_unconfirmed"].includes(status);
      if (range === "rebook") return ["reschedule", "wont_attend", "cancelled", "released_unconfirmed"].includes(status);
      return true;
    }).sort((a, b) => (appointmentDate(a)?.getTime() || 0) - (appointmentDate(b)?.getTime() || 0));
  }, [appointments, doctor, range]);

  const summary = useMemo(() => ({
    total: visible.length,
    confirmed: visible.filter((item) => item.confirmationStatus === "confirmed").length,
    waiting: visible.filter((item) => !["confirmed", "wont_attend", "cancelled", "reschedule", "released_unconfirmed"].includes(String(item.confirmationStatus || "pending"))).length,
    no: visible.filter((item) => ["wont_attend", "cancelled"].includes(String(item.confirmationStatus || ""))).length,
    rebook: visible.filter((item) => ["reschedule", "released_unconfirmed"].includes(String(item.confirmationStatus || ""))).length,
  }), [visible]);

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, ClinicAppointment[]>>();
    visible.forEach((item) => {
      const byDoctor = map.get(item.date) || new Map<string, ClinicAppointment[]>();
      const name = prettyProfessional(item.professional);
      const list = byDoctor.get(name) || [];
      list.push(item);
      byDoctor.set(name, list);
      map.set(item.date, byDoctor);
    });
    return map;
  }, [visible]);

  if (!currentClinic) return null;
  if (manualOpen) return (
    <div className="space-y-4">
      <Button variant="outline" onClick={() => setManualOpen(false)}>← Voltar para a Central de Confirmações</Button>
      <ClinicConfirmations />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-heading font-bold">Central de Confirmações</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe quem confirmou, quem ainda não respondeu e quais horários estão em risco antes da consulta.</p>
        </div>
        <Button variant="outline" onClick={() => setManualOpen(true)} className="gap-2"><Send className="h-4 w-4" />Envio manual de hoje</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["today", "Hoje"], ["tomorrow", "Amanhã"], ["48h", "Próximas 48h"], ["7d", "7 dias"], ["pending", "Sem confirmação"], ["rebook", "Precisa ação"],
        ] as Array<[RangeKey, string]>).map(([key, label]) => (
          <Button key={key} size="sm" variant={range === key ? "default" : "outline"} onClick={() => setRange(key)}>{label}</Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select value={doctor} onChange={(e) => setDoctor(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">Todos os profissionais</option>
            {doctors.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Consultas" value={summary.total} />
        <Stat label="Confirmados" value={summary.confirmed} />
        <Stat label="Aguardando" value={summary.waiting} />
        <Stat label="Não vão" value={summary.no} />
        <Stat label="Reagendar / liberadas" value={summary.rebook} />
      </div>

      <div className="rounded-xl border bg-card p-4 text-sm">
        <div className="font-semibold">Régua automática do teste</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1.5">24h • primeira confirmação</span>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">6h • aviso do prazo</span>
          <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700">3h • libera vaga se não confirmou</span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">1h • lembrete para confirmado</span>
        </div>
      </div>

      {[...grouped.entries()].map(([date, byDoctor]) => (
        <div key={date} className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b bg-muted/30 px-4 py-3 font-semibold">{date}</div>
          {[...byDoctor.entries()].map(([doctorName, items]) => {
            const color = colorForDoctor(doctorName);
            const confirmed = items.filter((item) => item.confirmationStatus === "confirmed").length;
            return (
              <div key={doctorName} className="border-b last:border-b-0">
                <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: color.bg }}>
                  <div className="font-semibold" style={{ color: color.text }}>{doctorName}</div>
                  <div className="text-xs" style={{ color: color.text }}>{confirmed}/{items.length} confirmados</div>
                </div>
                <div className="divide-y">
                  {items.map((item) => {
                    const meta = statusMeta(item);
                    const Icon = meta.icon;
                    return (
                      <div key={item.id} className="grid gap-2 px-4 py-3 md:grid-cols-[90px_1fr_220px] md:items-center">
                        <div className="font-semibold">{item.startTime}–{item.endTime}</div>
                        <div>
                          <div className="flex items-center gap-2 font-medium"><UserRound className="h-4 w-4" />{item.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.lastReplyText ? `Resposta: “${item.lastReplyText}”` : item.lastReminderError ? `Erro: ${item.lastReminderError}` : item.phone || "Sem telefone"}
                          </div>
                        </div>
                        <div className="md:text-right">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}><Icon className="h-3.5 w-3.5" />{meta.label}</span>
                          {item.confirmationDeadlineAt && !["confirmed", "wont_attend", "cancelled", "reschedule", "released_unconfirmed"].includes(String(item.confirmationStatus || "")) && (
                            <div className="mt-1 text-[11px] text-muted-foreground">Prazo: {formatDeadline(item.confirmationDeadlineAt)}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {!visible.length && <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Nenhuma consulta neste filtro.</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>;
}
