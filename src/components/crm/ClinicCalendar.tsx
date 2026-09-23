import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, FileUp, Filter, RefreshCw, Stethoscope, UserRound } from "lucide-react";

type ClinicAppointment = {
  id: string;
  name: string;
  phone: string;
  phoneKey?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  professional: string;
  sourceFile?: string;
  active?: boolean;
  confirmationStatus?: "pending" | "queued" | "sent" | "failed" | "replied" | "confirmed" | "wont_attend" | "reschedule" | "cancelled";
  remindersSent?: Record<string, string>;
  lastReminderSentAt?: string;
  lastReminderError?: string | null;
  lastReplyAt?: string;
  lastReplyText?: string;
  importedAt?: string;
  updatedAt?: string;
};

type PdfRow = {
  time: string;
  name: string;
  phone: string;
  professional: string;
  date: string;
};

type PdfTextItem = { str?: string; transform?: number[] };
type PositionedText = { text: string; x: number; y: number };

const DOCTOR_COLORS = [
  { bg: "#E8F0FE", border: "#6B8FDB", text: "#2E4A7D" },
  { bg: "#F3E8FF", border: "#9B72CF", text: "#5B347B" },
  { bg: "#E7F7EF", border: "#57A97C", text: "#286243" },
  { bg: "#FFF0E2", border: "#D9924E", text: "#7B4A1F" },
  { bg: "#FCE9EE", border: "#CC7187", text: "#7F3B4D" },
  { bg: "#E8F7F7", border: "#56A7A7", text: "#2F6666" },
  { bg: "#FFF8D9", border: "#C6A844", text: "#756119" },
  { bg: "#ECEAFB", border: "#7770BD", text: "#48437E" },
];

const stripAccents = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeKey = (value: string) => stripAccents(String(value || "")).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const digitsOnly = (value: string) => String(value || "").replace(/\D/g, "");

const canonicalPhoneKey = (value: string) => {
  let digits = digitsOnly(value);
  if (!digits) return null;
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === "9") digits = `${digits.slice(0, 2)}${digits.slice(3)}`;
  return digits.length === 10 ? `55${digits}` : null;
};

const validPhone = (value: string) => Boolean(canonicalPhoneKey(value));

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const timeToMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
};

const dateToSortable = (value: string) => {
  const [d, m, y] = value.split("/");
  return `${y || "0000"}-${m || "00"}-${d || "00"}`;
};

const sortableToBr = (value: string) => {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
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

function colorForDoctor(value: string) {
  return DOCTOR_COLORS[hashString(normalizeKey(value)) % DOCTOR_COLORS.length];
}

function groupPageItems(items: PdfTextItem[]) {
  const positioned: PositionedText[] = items
    .filter((item) => String(item?.str || "").trim() && Array.isArray(item.transform))
    .map((item) => ({ text: String(item.str || "").trim(), x: Number(item.transform?.[4] || 0), y: Number(item.transform?.[5] || 0) }));

  const rows: { y: number; items: PositionedText[] }[] = [];
  positioned
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .forEach((item) => {
      let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.2);
      if (!row) {
        row = { y: item.y, items: [] };
        rows.push(row);
      }
      row.items.push(item);
    });

  rows.forEach((row) => row.items.sort((a, b) => a.x - b.x));
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

async function extractRowsFromPdf(file: File): Promise<PdfRow[]> {
  const pdfJsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdfjs: any = await import(/* @vite-ignore */ pdfJsUrl);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parsed: PdfRow[] = [];
  let headerXs: { label: string; x: number }[] | null = null;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const rows = groupPageItems(textContent.items as PdfTextItem[]);

    for (const row of rows) {
      const normalizedItems = row.items.map((item) => ({ ...item, normalized: normalizeKey(item.text) }));
      const headerCandidates = normalizedItems.filter((item) => ["HORA", "NOME", "FONE", "FICHA", "RESPONSAVEL", "USUARIO", "DATA"].includes(item.normalized));
      if (headerCandidates.length >= 5) {
        headerXs = headerCandidates.map((item) => ({ label: item.normalized, x: item.x })).sort((a, b) => a.x - b.x);
        continue;
      }

      const hourItem = row.items.find((item) => /^\d{2}:\d{2}$/.test(item.text));
      if (!hourItem || !headerXs || headerXs.length < 5) continue;

      const boundaries = headerXs.slice(0, -1).map((item, index) => (item.x + headerXs![index + 1].x) / 2);
      const columns = new Map<string, string[]>();
      headerXs.forEach((header) => columns.set(header.label, []));

      row.items.forEach((item) => {
        let index = boundaries.findIndex((boundary) => item.x < boundary);
        if (index < 0) index = headerXs!.length - 1;
        const label = headerXs![index]?.label;
        if (label) columns.get(label)?.push(item.text);
      });

      const time = (columns.get("HORA") || []).join(" ").match(/\d{2}:\d{2}/)?.[0] || hourItem.text;
      const name = (columns.get("NOME") || []).join(" ").trim();
      const phone = (columns.get("FONE") || []).join(" ").trim();
      const professional = (columns.get("RESPONSAVEL") || []).join(" ").trim();
      const joined = row.items.map((item) => item.text).join(" ");
      const date = ((columns.get("DATA") || []).join(" ").match(/\d{2}\/\d{2}\/\d{4}/)?.[0]) || joined.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || "";

      if (time && name && professional && date) parsed.push({ time, name, phone, professional, date });
    }
  }

  if (!parsed.length) throw new Error("Não consegui ler as linhas da agenda deste PDF.");
  return parsed;
}

function consolidateRows(rows: PdfRow[]) {
  const byPatient = new Map<string, PdfRow[]>();
  rows.forEach((row) => {
    const key = [row.date, normalizeKey(row.name), digitsOnly(row.phone), normalizeKey(row.professional)].join("|");
    const group = byPatient.get(key) || [];
    if (!group.some((item) => item.time === row.time)) group.push(row);
    byPatient.set(key, group);
  });

  const appointments: ClinicAppointment[] = [];
  byPatient.forEach((group, groupKey) => {
    const sorted = [...group].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    const segments: PdfRow[][] = [];

    sorted.forEach((row) => {
      const current = segments[segments.length - 1];
      if (!current) return void segments.push([row]);
      const last = current[current.length - 1];
      if (timeToMinutes(row.time) - timeToMinutes(last.time) <= 16) current.push(row);
      else segments.push([row]);
    });

    segments.forEach((segment, segmentIndex) => {
      const first = segment[0];
      const last = segment[segment.length - 1];
      appointments.push({
        id: `clinic_${dateToSortable(first.date).replace(/-/g, "")}_${hashString(groupKey).toString(36)}_${segmentIndex + 1}`,
        name: first.name,
        phone: first.phone,
        phoneKey: canonicalPhoneKey(first.phone),
        date: first.date,
        startTime: first.time,
        endTime: minutesToTime(timeToMinutes(last.time) + 15),
        professional: first.professional,
        active: true,
        confirmationStatus: "pending",
      });
    });
  });

  return appointments.sort((a, b) => dateToSortable(a.date).localeCompare(dateToSortable(b.date)) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

function monthTitle(date: Date) {
  const value = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sameMonth(dateValue: string, month: Date) {
  const [d, m, y] = dateValue.split("/").map(Number);
  return y === month.getFullYear() && m === month.getMonth() + 1 && Boolean(d);
}

function statusLabel(appointment: ClinicAppointment) {
  if (appointment.confirmationStatus === "replied" || appointment.lastReplyAt) return "Respondeu";
  if (appointment.confirmationStatus === "failed" || appointment.lastReminderError) return "Erro";
  if (appointment.confirmationStatus === "sent" || appointment.lastReminderSentAt || appointment.remindersSent?.manual) return "Enviado";
  if (appointment.confirmationStatus === "queued") return "Na fila";
  return "Pendente";
}

export function ClinicCalendar() {
  const { currentClinic } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [importing, setImporting] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState("all");
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!currentClinic) return;
    const ref = collection(db, "clinics", currentClinic, "clinicAgenda");
    return onSnapshot(ref, (snapshot) => {
      const list = snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<ClinicAppointment, "id">) }))
        .filter((item) => item.active !== false)
        .sort((a, b) => dateToSortable(a.date).localeCompare(dateToSortable(b.date)) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      setAppointments(list);
    });
  }, [currentClinic]);

  const professionals = useMemo(() => {
    return Array.from(new Set(appointments.map((item) => prettyProfessional(item.professional)))).sort();
  }, [appointments]);

  const monthAppointments = useMemo(() => appointments.filter((item) => sameMonth(item.date, currentMonth)), [appointments, currentMonth]);
  const filteredAppointments = useMemo(() => monthAppointments.filter((item) => selectedProfessional === "all" || prettyProfessional(item.professional) === selectedProfessional), [monthAppointments, selectedProfessional]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, ClinicAppointment[]>();
    filteredAppointments.forEach((appointment) => {
      const list = map.get(appointment.date) || [];
      list.push(appointment);
      map.set(appointment.date, list);
    });
    map.forEach((list) => list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)));
    return map;
  }, [filteredAppointments]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startOffset = first.getDay();
    const days: Array<{ date: Date; inMonth: boolean }> = [];

    for (let i = startOffset; i > 0; i -= 1) {
      days.push({ date: new Date(year, month, 1 - i), inMonth: false });
    }
    for (let day = 1; day <= last.getDate(); day += 1) {
      days.push({ date: new Date(year, month, day), inMonth: true });
    }
    while (days.length % 7 !== 0) {
      const offset = days.length - startOffset - last.getDate() + 1;
      days.push({ date: new Date(year, month + 1, offset), inMonth: false });
    }
    return days;
  }, [currentMonth]);

  const importPeriod = async (file: File) => {
    if (!currentClinic) return;
    setImporting(true);
    try {
      const rows = await extractRowsFromPdf(file);
      const consolidated = consolidateRows(rows);
      const sortableDates = consolidated.map((item) => dateToSortable(item.date)).sort();
      const minDate = sortableDates[0];
      const maxDate = sortableDates[sortableDates.length - 1];
      if (!minDate || !maxDate) throw new Error("Não consegui identificar o período deste PDF.");

      const agendaRef = collection(db, "clinics", currentClinic, "clinicAgenda");
      const existing = await getDocs(agendaRef);
      const existingById = new Map(existing.docs.map((item) => [item.id, item.data() as ClinicAppointment]));
      const now = new Date().toISOString();
      const importedIds = new Set(consolidated.map((item) => item.id));

      await Promise.all(consolidated.map((item) => {
        const previous = existingById.get(item.id);
        return setDoc(doc(agendaRef, item.id), {
          ...item,
          confirmationStatus: previous?.confirmationStatus || "pending",
          remindersSent: previous?.remindersSent || {},
          lastReminderSentAt: previous?.lastReminderSentAt || null,
          lastReminderError: previous?.lastReminderError || null,
          lastReplyAt: previous?.lastReplyAt || null,
          lastReplyText: previous?.lastReplyText || null,
          sourceFile: file.name,
          importedAt: previous?.importedAt || now,
          updatedAt: now,
          active: true,
        }, { merge: true });
      }));

      const obsolete = existing.docs.filter((snapshotDoc) => {
        const data = snapshotDoc.data() as ClinicAppointment;
        const key = dateToSortable(data.date || "");
        return data.active !== false && key >= minDate && key <= maxDate && !importedIds.has(snapshotDoc.id);
      });
      await Promise.all(obsolete.map((snapshotDoc) => updateDoc(snapshotDoc.ref, { active: false, updatedAt: now })));

      const firstDate = sortableToBr(minDate);
      const [day, month, year] = firstDate.split("/").map(Number);
      if (month && year) setCurrentMonth(new Date(year, month - 1, day || 1));

      const doctorCount = new Set(consolidated.map((item) => prettyProfessional(item.professional))).size;
      toast.success(`${consolidated.length} consultas importadas • ${doctorCount} profissional(is) • ${sortableToBr(minDate)} a ${sortableToBr(maxDate)}.`);
    } catch (error) {
      console.error("[clinic-calendar-import]", error);
      toast.error(error instanceof Error ? error.message : "Erro ao importar a agenda.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const selectedDayAppointments = selectedDate ? (appointmentsByDate.get(selectedDate) || []) : [];

  if (!currentClinic) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-heading font-bold">Calendário da clínica</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Importe o PDF do período e acompanhe a agenda completa separada por profissional.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importPeriod(file);
          }} />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={importing} className="gap-2">
            {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {importing ? "Lendo período..." : "Importar PDF do período"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Consultas no mês</div><div className="mt-1 text-2xl font-bold">{monthAppointments.length}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Profissionais</div><div className="mt-1 text-2xl font-bold">{new Set(monthAppointments.map((item) => prettyProfessional(item.professional))).size}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Enviados / respondidos</div><div className="mt-1 text-2xl font-bold">{monthAppointments.filter((item) => item.lastReminderSentAt || item.remindersSent?.manual || item.lastReplyAt).length}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Sem telefone válido</div><div className="mt-1 text-2xl font-bold">{monthAppointments.filter((item) => !validPhone(item.phone)).length}</div></div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-[190px] text-center text-lg font-semibold">{monthTitle(currentMonth)}</div>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select value={selectedProfessional} onChange={(event) => setSelectedProfessional(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">Todas as profissionais</option>
              {professionals.map((professional) => <option key={professional} value={professional}>{professional}</option>)}
            </select>
          </div>
        </div>

        {professionals.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
            {professionals.map((professional) => {
              const color = colorForDoctor(professional);
              return (
                <button key={professional} onClick={() => setSelectedProfessional(selectedProfessional === professional ? "all" : professional)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-opacity ${selectedProfessional !== "all" && selectedProfessional !== professional ? "opacity-40" : "opacity-100"}`} style={{ borderColor: color.border, backgroundColor: color.bg, color: color.text }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color.border }} />
                  {professional}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/30 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <div key={day} className="px-2 py-3">{day}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map(({ date, inMonth }, index) => {
            const dateKey = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
            const dayAppointments = appointmentsByDate.get(dateKey) || [];
            const today = new Date();
            const isToday = date.toDateString() === today.toDateString();
            const visible = dayAppointments.slice(0, 4);
            const remaining = dayAppointments.length - visible.length;

            return (
              <button key={`${dateKey}-${index}`} onClick={() => dayAppointments.length && setSelectedDate(dateKey)} className={`min-h-[145px] border-b border-r p-2 text-left align-top transition-colors hover:bg-muted/20 ${!inMonth ? "bg-muted/10 text-muted-foreground/50" : ""}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-primary text-primary-foreground" : ""}`}>{date.getDate()}</span>
                  {dayAppointments.length > 0 && <span className="text-[11px] text-muted-foreground">{dayAppointments.length}</span>}
                </div>
                <div className="space-y-1">
                  {visible.map((appointment) => {
                    const doctor = prettyProfessional(appointment.professional);
                    const color = colorForDoctor(doctor);
                    return (
                      <div key={appointment.id} className="truncate rounded-md border-l-4 px-2 py-1.5 text-[11px] leading-tight" style={{ borderLeftColor: color.border, backgroundColor: color.bg, color: color.text }} title={`${appointment.startTime} • ${appointment.name} • ${doctor}`}>
                        <span className="font-bold">{appointment.startTime}</span> · {appointment.name}
                      </div>
                    );
                  })}
                  {remaining > 0 && <div className="px-1 text-[11px] font-medium text-muted-foreground">+ {remaining} consulta(s)</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={Boolean(selectedDate)} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Agenda de {selectedDate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {selectedDayAppointments.map((appointment) => {
              const doctor = prettyProfessional(appointment.professional);
              const color = colorForDoctor(doctor);
              return (
                <div key={appointment.id} className="rounded-lg border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md px-2 py-1 text-sm font-bold" style={{ backgroundColor: color.bg, color: color.text }}>{appointment.startTime}</div>
                      <div>
                        <div className="flex items-center gap-1.5 font-medium"><UserRound className="h-4 w-4" />{appointment.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Stethoscope className="h-3.5 w-3.5" />{doctor}<span>•</span><span>{appointment.phone || "Sem telefone"}</span></div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold">{statusLabel(appointment)}</div>
                      {appointment.lastReplyText && <div className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground">“{appointment.lastReplyText}”</div>}
                      {appointment.lastReminderError && <div className="mt-1 max-w-[260px] truncate text-xs text-red-600">{appointment.lastReminderError}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
