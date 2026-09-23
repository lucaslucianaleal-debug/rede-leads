import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useWhatsAppAgent } from "@/hooks/useWhatsAppAgent";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2, Clock3, FileUp, RefreshCw, Send, Stethoscope, UserRound, XCircle } from "lucide-react";

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
  confirmationStatus?: "pending" | "queued" | "confirmed" | "wont_attend" | "reschedule" | "cancelled";
  remindersSent?: Record<string, string>;
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
  return (hash >>> 0).toString(36);
};

const timeToMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
};

const todayBr = () => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
};

const dateToSortable = (value: string) => {
  const [d, m, y] = value.split("/");
  return `${y || "0000"}-${m || "00"}-${d || "00"}`;
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

const appointmentDate = (appointment: ClinicAppointment) => {
  const match = `${appointment.date} ${appointment.startTime}`.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isPast = (appointment: ClinicAppointment) => {
  const date = appointmentDate(appointment);
  return !date || date.getTime() <= Date.now();
};

function groupPageItems(items: PdfTextItem[]) {
  const positioned: PositionedText[] = items
    .filter((item) => String(item?.str || "").trim() && Array.isArray(item.transform))
    .map((item) => ({
      text: String(item.str || "").trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
    }));

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

  if (!parsed.length) throw new Error("Não consegui ler as linhas da agenda.");
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
        id: `clinic_${dateToSortable(first.date).replace(/-/g, "")}_${hashString(groupKey)}_${segmentIndex + 1}`,
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

  return appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function ClinicConfirmations() {
  const { currentClinic, user } = useAuth();
  const { status: agentStatus } = useWhatsAppAgent();
  const inputRef = useRef<HTMLInputElement>(null);
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentClinic) return;
    setLoading(true);
    const ref = collection(db, "clinics", currentClinic, "clinicAgenda");
    return onSnapshot(ref, (snapshot) => {
      const list = snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<ClinicAppointment, "id">) }))
        .filter((item) => item.active !== false && item.date === todayBr())
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      setAppointments(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [currentClinic]);

  const professionals = useMemo(() => {
    return Array.from(new Set(appointments.map((item) => prettyProfessional(item.professional)))).sort();
  }, [appointments]);

  useEffect(() => {
    if (!professionals.length) {
      setSelectedProfessional("");
      return;
    }
    if (!professionals.includes(selectedProfessional)) setSelectedProfessional(professionals[0]);
  }, [professionals, selectedProfessional]);

  const doctorAppointments = useMemo(() => {
    return appointments.filter((item) => prettyProfessional(item.professional) === selectedProfessional);
  }, [appointments, selectedProfessional]);

  const upcomingAppointments = useMemo(() => doctorAppointments.filter((item) => !isPast(item)), [doctorAppointments]);
  const pastAppointments = useMemo(() => doctorAppointments.filter((item) => isPast(item)), [doctorAppointments]);
  const selectable = useMemo(() => upcomingAppointments.filter((item) => validPhone(item.phone) && item.confirmationStatus !== "queued"), [upcomingAppointments]);

  useEffect(() => {
    setSelectedIds(selectable.map((item) => item.id));
  }, [selectedProfessional, appointments.length]);

  const importAgenda = async (file: File) => {
    if (!currentClinic) return;
    setImporting(true);
    try {
      const rows = await extractRowsFromPdf(file);
      const todayRows = rows.filter((row) => row.date === todayBr());
      if (!todayRows.length) throw new Error(`O PDF não possui agenda de hoje (${todayBr()}).`);

      const consolidated = consolidateRows(todayRows);
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
          sourceFile: file.name,
          importedAt: previous?.importedAt || now,
          updatedAt: now,
        }, { merge: true });
      }));

      const obsolete = existing.docs.filter((item) => {
        const data = item.data() as ClinicAppointment;
        return data.date === todayBr() && !importedIds.has(item.id) && data.active !== false;
      });
      await Promise.all(obsolete.map((item) => updateDoc(item.ref, { active: false, updatedAt: now })));

      const dras = new Set(consolidated.map((item) => prettyProfessional(item.professional))).size;
      toast.success(`${consolidated.length} consultas de hoje importadas • ${dras} profissional(is).`);
    } catch (error) {
      console.error("[clinic-import]", error);
      toast.error(error instanceof Error ? error.message : "Erro ao importar a agenda.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const sendSelected = async () => {
    if (!currentClinic || !user) return;
    const selected = selectable.filter((item) => selectedIds.includes(item.id));
    if (!selected.length) {
      toast.error("Não há pacientes selecionados para envio.");
      return;
    }

    if (!window.confirm(`Enviar lembrete agora para ${selected.length} paciente(s) da ${selectedProfessional}?`)) return;

    setSending(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/whatsapp/clinic-appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clinicId: currentClinic,
          action: "send_now",
          appointmentIds: selected.map((item) => item.id),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Erro ao enviar lembretes");

      await Promise.all(selected.map((item) => updateDoc(doc(db, "clinics", currentClinic, "clinicAgenda", item.id), {
        confirmationStatus: "queued",
        updatedAt: new Date().toISOString(),
      })));

      toast.success(`${data.queued || 0} lembrete(s) colocado(s) na fila para ${selectedProfessional}.`);
      setSelectedIds([]);
    } catch (error) {
      console.error("[clinic-send]", error);
      toast.error(error instanceof Error ? error.message : "Erro ao disparar os lembretes.");
    } finally {
      setSending(false);
    }
  };

  if (!currentClinic) {
    return <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Selecione a clínica.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-heading font-bold">Confirmações de hoje</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Escolha a Dra., confira a agenda e dispare os lembretes. Só os horários de hoje entram aqui.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`rounded-full border px-3 py-1.5 text-xs font-medium ${agentStatus.connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            Agente {agentStatus.connected ? "conectado" : "desconectado"}
          </div>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importAgenda(file);
          }} />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={importing} className="gap-2">
            {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {importing ? "Lendo..." : "Importar agenda de hoje"}
          </Button>
        </div>
      </div>

      {professionals.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Stethoscope className="h-4 w-4" />Escolha a profissional</div>
          <div className="flex flex-wrap gap-2">
            {professionals.map((professional) => {
              const count = appointments.filter((item) => prettyProfessional(item.professional) === professional).length;
              return (
                <Button
                  key={professional}
                  variant={selectedProfessional === professional ? "default" : "outline"}
                  onClick={() => setSelectedProfessional(professional)}
                >
                  {professional} · {count}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold">{selectedProfessional || "Agenda de hoje"}</div>
            <div className="text-xs text-muted-foreground">
              {upcomingAppointments.length} ainda vão acontecer • {pastAppointments.length} já passaram
            </div>
          </div>
          <Button onClick={sendSelected} disabled={sending || selectedIds.length === 0 || !agentStatus.connected} className="gap-2">
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Enviando..." : `Enviar para selecionados (${selectedIds.length})`}
          </Button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando agenda...</div>
        ) : !doctorAppointments.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Importe a agenda de hoje para começar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectable.length > 0 && selectable.every((item) => selectedIds.includes(item.id))}
                      onChange={() => {
                        const ids = selectable.map((item) => item.id);
                        const all = ids.every((id) => selectedIds.includes(id));
                        setSelectedIds(all ? [] : ids);
                      }}
                    />
                  </th>
                  <th className="px-3 py-3">Horário</th>
                  <th className="px-3 py-3">Paciente</th>
                  <th className="px-3 py-3">Telefone</th>
                  <th className="px-3 py-3">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...upcomingAppointments, ...pastAppointments].map((appointment) => {
                  const past = isPast(appointment);
                  const phoneOk = validPhone(appointment.phone);
                  const queued = appointment.confirmationStatus === "queued";
                  const sent = Boolean(appointment.remindersSent?.manual);
                  return (
                    <tr key={appointment.id} className={past ? "bg-muted/20 text-muted-foreground" : "hover:bg-muted/20"}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          disabled={past || !phoneOk || queued || sent}
                          checked={selectedIds.includes(appointment.id)}
                          onChange={() => setSelectedIds((current) => current.includes(appointment.id) ? current.filter((id) => id !== appointment.id) : [...current, appointment.id])}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        <div className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{appointment.startTime} <span className="text-xs font-normal opacity-60">– {appointment.endTime}</span></div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5"><UserRound className="h-4 w-4" />{appointment.name}</div>
                      </td>
                      <td className="px-3 py-3">{appointment.phone || "—"}</td>
                      <td className="px-3 py-3">
                        {past ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs"><Clock3 className="h-3.5 w-3.5" />Horário passou</span>
                        ) : sent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Enviado</span>
                        ) : queued ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700"><Send className="h-3.5 w-3.5" />Na fila</span>
                        ) : !phoneOk ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs text-red-700"><XCircle className="h-3.5 w-3.5" />Telefone inválido</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">Pronto para enviar</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
