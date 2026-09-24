import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, MessageCircle, Phone, RotateCcw, UserRound } from "lucide-react";
import { toast } from "sonner";

type MatrixSyncStatus = "synced" | "manual_pending" | "divergent" | "reconciled_archived";

type ScheduleSnapshot = {
  date: string;
  startTime: string;
  endTime: string;
  professional: string;
};

type RebookingHistoryItem = {
  changedAt: string;
  source: string;
  from: ScheduleSnapshot;
  to: ScheduleSnapshot;
};

type ClinicAppointment = {
  id: string;
  name: string;
  phone: string;
  phoneKey?: string | null;
  date: string;
  startTime: string;
  endTime?: string;
  professional: string;
  active?: boolean;
  confirmationStatus?: string;
  lastReplyText?: string;
  lastReplyAt?: string;
  vacancyReleasedAt?: string;
  remindersSent?: Record<string, string>;
  lastReminderSentAt?: string | null;
  lastReminderError?: string | null;
  confirmationDeadlineAt?: string | null;
  manuallyEditedAt?: string;
  matrixSyncStatus?: MatrixSyncStatus;
  matrixSyncNote?: string | null;
  manualRebookedAt?: string;
  manualExpectedSchedule?: ScheduleSnapshot;
  matrixSchedule?: ScheduleSnapshot;
  rebookingHistory?: RebookingHistoryItem[];
};

const stripAccents = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeKey = (value: string) => stripAccents(String(value || "")).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

const prettyProfessional = (value: string) => {
  const clean = String(value || "").replace(/\s+-\s+(ORTO|ENDO|ORC|ORÇ).*$/i, "").replace(/\s+-\s*$/g, "").trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return clean.replace(/^Dra\.?\s*/i, "Dra. ") || "Profissional não identificado";
};

const dateSortKey = (value: string) => {
  const [d, m, y] = value.split("/");
  return `${y}-${m}-${d}`;
};

const brToIso = (value: string) => {
  const [d, m, y] = String(value || "").split("/");
  return y && m && d ? `${y}-${m}-${d}` : "";
};

const isoToBr = (value: string) => {
  const [y, m, d] = String(value || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};

const timeToMinutes = (value: string) => {
  const [h, m] = String(value || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

const minutesToTime = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
};

function durationMinutes(item: ClinicAppointment) {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime || item.startTime);
  const duration = end - start;
  return duration > 0 ? duration : 30;
}

function syncMeta(item: ClinicAppointment) {
  if (item.matrixSyncStatus === "manual_pending") {
    return { label: "Aguardando matriz", cls: "bg-amber-50 text-amber-800", icon: Clock3 };
  }
  if (item.matrixSyncStatus === "divergent") {
    return { label: "Divergência com a matriz", cls: "bg-red-50 text-red-700", icon: AlertTriangle };
  }
  if (item.matrixSyncStatus === "synced") {
    return { label: "Sincronizado", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
  }
  return null;
}

export function ClinicRebookings() {
  const { currentClinic } = useAuth();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [rebookItem, setRebookItem] = useState<ClinicAppointment | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newProfessional, setNewProfessional] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentClinic) return;
    return onSnapshot(collection(db, "clinics", currentClinic, "clinicAgenda"), (snapshot) => {
      setAppointments(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...(snapshotDoc.data() as Omit<ClinicAppointment, "id">) })));
    });
  }, [currentClinic]);

  const professionals = useMemo(() => {
    const map = new Map<string, string>();
    appointments.filter((item) => item.active !== false).forEach((item) => {
      const pretty = prettyProfessional(item.professional);
      if (!map.has(pretty)) map.set(pretty, item.professional);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [appointments]);

  const items = useMemo(() => appointments
    .filter((item) => {
      const actionStatus = ["reschedule", "wont_attend", "cancelled", "released_unconfirmed"].includes(String(item.confirmationStatus || ""));
      const syncIssue = ["manual_pending", "divergent"].includes(String(item.matrixSyncStatus || ""));
      return (item.active !== false && actionStatus) || syncIssue;
    })
    .sort((a, b) => dateSortKey(a.date).localeCompare(dateSortKey(b.date)) || a.startTime.localeCompare(b.startTime)), [appointments]);

  const openRebooking = (item: ClinicAppointment) => {
    setRebookItem(item);
    setNewDate(brToIso(item.date));
    setNewTime(item.startTime || "");
    setNewProfessional(item.professional || "");
  };

  const saveRebooking = async () => {
    if (!currentClinic || !rebookItem) return;
    if (!newDate || !newTime || !newProfessional) {
      toast.error("Informe nova data, horário e profissional.");
      return;
    }

    const targetDate = isoToBr(newDate);
    if (!targetDate) {
      toast.error("Data inválida.");
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const duration = durationMinutes(rebookItem);
      const targetEnd = minutesToTime(timeToMinutes(newTime) + duration);
      const previousSchedule: ScheduleSnapshot = {
        date: rebookItem.date,
        startTime: rebookItem.startTime,
        endTime: rebookItem.endTime || rebookItem.startTime,
        professional: rebookItem.professional,
      };
      const nextSchedule: ScheduleSnapshot = {
        date: targetDate,
        startTime: newTime,
        endTime: targetEnd,
        professional: newProfessional,
      };

      const batch = writeBatch(db);
      const appointmentRef = doc(db, "clinics", currentClinic, "clinicAgenda", rebookItem.id);
      const history: RebookingHistoryItem[] = [
        ...(Array.isArray(rebookItem.rebookingHistory) ? rebookItem.rebookingHistory : []),
        { changedAt: nowIso, source: "manual_matrix_rebooking", from: previousSchedule, to: nextSchedule },
      ];

      batch.set(appointmentRef, {
        ...nextSchedule,
        active: true,
        confirmationStatus: "pending",
        replyClassification: null,
        manualReviewedAt: null,
        manualReviewDecision: null,
        manualActionSource: "matrix_rebooking_manual_sync",
        vacancyReleasedAt: null,
        vacancyReleaseReason: null,
        confirmationDeadlineAt: null,
        remindersSent: {},
        lastReminderSentAt: null,
        lastReminderError: null,
        lastReplyAt: null,
        lastReplyText: null,
        matrixSyncStatus: "manual_pending",
        matrixSyncNote: "Alteração feita manualmente no Rede Leads. Aguardando próximo PDF da matriz para conferência.",
        manualRebookedAt: nowIso,
        manualExpectedSchedule: nextSchedule,
        matrixSchedule: null,
        rebookingHistory: history,
        updatedAt: nowIso,
      }, { merge: true });

      const [queueSnapshot, scheduleSnapshot] = await Promise.all([
        getDocs(query(collection(db, "clinics", currentClinic, "whatsappQueue"), where("clinicAppointmentId", "==", rebookItem.id))),
        getDocs(query(collection(db, "clinics", currentClinic, "whatsappSchedule"), where("clinicAppointmentId", "==", rebookItem.id))),
      ]);

      queueSnapshot.docs.forEach((queueDoc) => {
        const data = queueDoc.data() || {};
        if (!["pending", "leased"].includes(String(data.status || ""))) return;
        batch.set(queueDoc.ref, {
          status: "cancelled",
          cancelReason: "clinic_rebooked_new_schedule",
          cancelledAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true });
      });

      scheduleSnapshot.docs.forEach((scheduleDoc) => {
        const data = scheduleDoc.data() || {};
        if (["sent", "failed", "cancelled"].includes(String(data.status || ""))) return;
        batch.set(scheduleDoc.ref, {
          status: "cancelled",
          cancelReason: "clinic_rebooked_new_schedule",
          cancelledAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true });
      });

      await batch.commit();
      toast.success(`Reagendado para ${targetDate} às ${newTime}. Agora aguardamos a próxima conferência com a matriz.`);
      setRebookItem(null);
    } catch (error) {
      console.error("[clinic-rebooking-save]", error);
      toast.error("Não foi possível salvar o novo horário.");
    } finally {
      setSaving(false);
    }
  };

  if (!currentClinic) return null;

  const pendingMatrix = items.filter((item) => item.matrixSyncStatus === "manual_pending").length;
  const divergences = items.filter((item) => item.matrixSyncStatus === "divergent").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-bold">Reagendamentos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Reagende na matriz e replique aqui em segundos. O próximo PDF apenas confere se os dois lados ficaram iguais.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Para reagendar" value={items.filter((item) => item.active !== false && item.confirmationStatus === "reschedule").length} />
        <Card label="Aguardando matriz" value={pendingMatrix} />
        <Card label="Divergências" value={divergences} />
        <Card label="Vagas liberadas" value={items.filter((item) => item.active !== false && item.confirmationStatus === "released_unconfirmed").length} />
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        <strong>Novo fluxo:</strong> faça a alteração no sistema da clínica → clique em <strong>Definir novo horário</strong> aqui → continue trabalhando normalmente. Quando importar o próximo PDF, a conferência acontece automaticamente.
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/30 px-4 py-3 font-semibold">Fila de ação e sincronização • {items.length}</div>
        {items.length ? <div className="divide-y">{items.map((item) => {
          const sync = syncMeta(item);
          const SyncIcon = sync?.icon;
          const canRebook = item.active !== false && ["reschedule", "wont_attend", "cancelled", "released_unconfirmed"].includes(String(item.confirmationStatus || ""));
          return (
            <div key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[150px_1fr_300px] md:items-center">
              <div>
                <div className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />{item.date}</div>
                <div className="mt-1 text-sm text-muted-foreground">{item.startTime}{item.endTime ? `–${item.endTime}` : ""}</div>
              </div>
              <div>
                <div className="flex items-center gap-2 font-medium"><UserRound className="h-4 w-4" />{item.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{prettyProfessional(item.professional)}</div>
                {item.lastReplyText && <div className="mt-2 flex items-center gap-1.5 text-xs"><MessageCircle className="h-3.5 w-3.5" />“{item.lastReplyText}”</div>}
                {item.matrixSyncNote && <div className={`mt-2 text-xs ${item.matrixSyncStatus === "divergent" ? "text-red-700" : "text-amber-700"}`}>{item.matrixSyncNote}</div>}
                {item.matrixSyncStatus === "divergent" && item.manualExpectedSchedule && item.matrixSchedule && (
                  <div className="mt-2 rounded-md border border-red-100 bg-red-50 p-2 text-xs text-red-800">
                    Esperado: {item.manualExpectedSchedule.date} {item.manualExpectedSchedule.startTime} • {prettyProfessional(item.manualExpectedSchedule.professional)}<br />
                    Matriz: {item.matrixSchedule.date} {item.matrixSchedule.startTime} • {prettyProfessional(item.matrixSchedule.professional)}
                  </div>
                )}
              </div>
              <div className="space-y-2 md:text-right">
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {sync && SyncIcon && <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${sync.cls}`}><SyncIcon className="h-3.5 w-3.5" />{sync.label}</span>}
                  {!sync && <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"><RotateCcw className="h-3.5 w-3.5" />{item.confirmationStatus === "released_unconfirmed" ? "Vaga liberada" : item.confirmationStatus === "reschedule" ? "Reagendar" : "Não vai"}</span>}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground md:justify-end"><Phone className="h-3.5 w-3.5" />{item.phone || "Sem telefone"}</div>
                {canRebook && <Button size="sm" onClick={() => openRebooking(item)} className="gap-2"><CalendarClock className="h-4 w-4" />Definir novo horário</Button>}
              </div>
            </div>
          );
        })}</div> : <div className="p-10 text-center text-sm text-muted-foreground">Nenhum paciente aguardando reagendamento ou conferência.</div>}
      </div>

      <Dialog open={Boolean(rebookItem)} onOpenChange={(open) => !open && !saving && setRebookItem(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Definir novo horário</DialogTitle>
          </DialogHeader>
          {rebookItem && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="font-semibold">{rebookItem.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">Atual: {rebookItem.date} • {rebookItem.startTime}{rebookItem.endTime ? `–${rebookItem.endTime}` : ""} • {prettyProfessional(rebookItem.professional)}</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nova data</label>
                  <Input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Novo horário</label>
                  <Input type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} step={900} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Profissional</label>
                <select value={newProfessional} onChange={(event) => setNewProfessional(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {professionals.map(([pretty, raw]) => <option key={`${pretty}-${raw}`} value={raw}>{pretty}</option>)}
                </select>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Ao salvar, qualquer lembrete ainda pendente do horário antigo será cancelado. A nova consulta volta para <strong>Programado</strong> e entra novamente na régua correta.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRebookItem(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void saveRebooking()} disabled={saving}>{saving ? "Salvando..." : "Salvar novo horário"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>;
}
