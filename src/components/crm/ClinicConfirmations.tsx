import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDocs, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useWhatsAppAgent } from "@/hooks/useWhatsAppAgent";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2, Clock3, FileUp, MessageCircle, RefreshCw, Send, UserRound, XCircle } from "lucide-react";

type ClinicAppointment = {
  id: string;
  name: string;
  phone: string;
  date: string;
  startTime: string;
  endTime: string;
  professional: string;
  sourceFile?: string;
  active?: boolean;
  confirmationStatus?: "pending" | "queued" | "confirmed" | "reschedule" | "cancelled";
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

const dateToSortable = (value: string) => {
  const [d, m, y] = value.split("/");
  return `${y || "0000"}-${m || "00"}-${d || "00"}`;
};

const todayBr = () => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
};

const tomorrowBr = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};

const firstName = (name: string) => {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
};

const prettyProfessional = (value: string) => {
  const clean = String(value || "")
    .replace(/\s+-\s+(ORTO|ENDO|ORC|ORÇ).*$/i, "")
    .replace(/\s+-\s*$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return clean.replace(/^Dra\.?\s*/i, "Dra. ");
};

const validPhone = (phone: string) => {
  const digits = digitsOnly(phone);
  return (digits.length === 10 || digits.length === 11) && !/^0+$/.test(digits);
};

function clinicLabel(clinicId: string | null) {
  const id = String(clinicId || "").toLowerCase();
  if (id.includes("olimpia")) return "OdontoCompany Olímpia";
  if (id.includes("bady")) return "OdontoCompany Bady Bassitt";
  if (id.includes("novo")) return "OdontoCompany Novo Horizonte";
  return "OdontoCompany";
}

function buildMessage(appointment: ClinicAppointment, clinicId: string | null) {
  const when = appointment.date === todayBr()
    ? "hoje"
    : appointment.date === tomorrowBr()
      ? "amanhã"
      : `no dia ${appointment.date}`;
  return `Olá, ${firstName(appointment.name)}! 💚 Passando para lembrar da sua consulta ${when}, às ${appointment.startTime}, com a ${prettyProfessional(appointment.professional)}, na ${clinicLabel(clinicId)}. Podemos confirmar sua presença?`;
}

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

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
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
        headerXs = headerCandidates
          .map((item) => ({ label: item.normalized, x: item.x }))
          .sort((a, b) => a.x - b.x);
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
      const dateColumn = (columns.get("DATA") || []).join(" ").trim();
      const joined = row.items.map((item) => item.text).join(" ");
      const date = dateColumn.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || joined.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || "";

      if (time && name && professional && date) {
        parsed.push({ time, name, phone, professional, date });
      }
    }
  }

  if (!parsed.length) {
    throw new Error("Não consegui ler as linhas da agenda. Confirme se este é o PDF de 'Agenda - Relatórios - Marcados'.");
  }

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
      if (!current) {
        segments.push([row]);
        return;
      }
      const last = current[current.length - 1];
      if (timeToMinutes(row.time) - timeToMinutes(last.time) <= 16) current.push(row);
      else segments.push([row]);
    });

    segments.forEach((segment, segmentIndex) => {
      const first = segment[0];
      const last = segment[segment.length - 1];
      const stableId = `clinic_${dateToSortable(first.date).replace(/-/g, "")}_${hashString(groupKey)}_${segmentIndex + 1}`;
      appointments.push({
        id: stableId,
        name: first.name,
        phone: first.phone,
        date: first.date,
        startTime: first.time,
        endTime: minutesToTime(timeToMinutes(last.time) + 15),
        professional: first.professional,
        active: true,
        confirmationStatus: "pending",
      });
    });
  });

  return appointments.sort((a, b) => dateToSortable(a.date).localeCompare(dateToSortable(b.date)) || a.startTime.localeCompare(b.startTime));
}

export function ClinicConfirmations() {
  const { currentClinic } = useAuth();
  const { queueMessages, status: agentStatus } = useWhatsAppAgent();
  const inputRef = useRef<HTMLInputElement>(null);
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentClinic) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = collection(db, "clinics", currentClinic, "clinicAgenda");
    return onSnapshot(ref, (snapshot) => {
      const list = snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<ClinicAppointment, "id">) }))
        .filter((item) => item.active !== false)
        .sort((a, b) => dateToSortable(a.date).localeCompare(dateToSortable(b.date)) || a.startTime.localeCompare(b.startTime));
      setAppointments(list);
      setLoading(false);
    }, (error) => {
      console.error("[clinic-agenda]", error);
      toast.error("Não foi possível carregar a agenda da clínica.");
      setLoading(false);
    });
  }, [currentClinic]);

  const dates = useMemo(() => Array.from(new Set(appointments.map((item) => item.date))).sort((a, b) => dateToSortable(a).localeCompare(dateToSortable(b))), [appointments]);

  useEffect(() => {
    if (!dates.length) {
      setSelectedDate("");
      return;
    }
    if (dates.includes(selectedDate)) return;
    const today = todayBr();
    const tomorrow = tomorrowBr();
    setSelectedDate(dates.includes(today) ? today : dates.includes(tomorrow) ? tomorrow : dates[0]);
  }, [dates, selectedDate]);

  const visibleAppointments = useMemo(() => appointments.filter((item) => item.date === selectedDate), [appointments, selectedDate]);
  const selectableAppointments = useMemo(() => visibleAppointments.filter((item) => validPhone(item.phone) && item.confirmationStatus !== "queued"), [visibleAppointments]);

  useEffect(() => {
    setSelectedIds(selectableAppointments.map((item) => item.id));
  }, [selectedDate]);

  const stats = useMemo(() => ({
    total: visibleAppointments.length,
    valid: visibleAppointments.filter((item) => validPhone(item.phone)).length,
    queued: visibleAppointments.filter((item) => item.confirmationStatus === "queued").length,
    invalid: visibleAppointments.filter((item) => !validPhone(item.phone)).length,
  }), [visibleAppointments]);

  const importAgenda = async (file: File) => {
    if (!currentClinic) return;
    setImporting(true);
    try {
      const rawRows = await extractRowsFromPdf(file);
      const consolidated = consolidateRows(rawRows);
      const now = new Date().toISOString();
      const importedDates = new Set(consolidated.map((item) => item.date));
      const importedIds = new Set(consolidated.map((item) => item.id));
      const agendaRef = collection(db, "clinics", currentClinic, "clinicAgenda");

      await Promise.all(consolidated.map((item) => setDoc(doc(agendaRef, item.id), {
        ...item,
        sourceFile: file.name,
        active: true,
        importedAt: now,
        updatedAt: now,
      }, { merge: true })));

      const existing = await getDocs(agendaRef);
      const obsolete = existing.docs.filter((item) => {
        const data = item.data() as ClinicAppointment;
        return importedDates.has(data.date) && !importedIds.has(item.id) && data.active !== false;
      });
      await Promise.all(obsolete.map((item) => updateDoc(item.ref, { active: false, updatedAt: now })));

      const valid = consolidated.filter((item) => validPhone(item.phone)).length;
      const invalid = consolidated.length - valid;
      toast.success(`${consolidated.length} consultas importadas. ${valid} prontas para WhatsApp${invalid ? ` e ${invalid} sem telefone válido` : ""}.`);
      const firstImportedDate = Array.from(importedDates).sort((a, b) => dateToSortable(a).localeCompare(dateToSortable(b)))[0];
      if (firstImportedDate) setSelectedDate(firstImportedDate);
    } catch (error) {
      console.error("[clinic-import]", error);
      toast.error(error instanceof Error ? error.message : "Erro ao importar a agenda.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggleAll = () => {
    const ids = selectableAppointments.map((item) => item.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : ids);
  };

  const toggleOne = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const sendSelected = async () => {
    if (!currentClinic) return;
    const selected = visibleAppointments.filter((item) => selectedIds.includes(item.id) && validPhone(item.phone));
    if (!selected.length) {
      toast.error("Selecione pelo menos uma consulta com telefone válido.");
      return;
    }
    if (!window.confirm(`Disparar ${selected.length} lembrete(s) agora pelo agente do WhatsApp?`)) return;

    setSending(true);
    try {
      let queuedTotal = 0;
      let skippedTotal = 0;
      for (let index = 0; index < selected.length; index += 50) {
        const chunk = selected.slice(index, index + 50);
        const result = await queueMessages(chunk.map((appointment) => ({
          leadId: appointment.id,
          phone: appointment.phone,
          name: appointment.name,
          message: buildMessage(appointment, currentClinic),
          kind: "manual" as const,
          clientRequestId: `clinic_reminder_${appointment.id}`,
        })));
        queuedTotal += result.queued;
        skippedTotal += result.skipped;

        const queuedIds = new Set(result.queuedIds);
        await Promise.all(chunk
          .filter((appointment) => queuedIds.has(appointment.id))
          .map((appointment) => updateDoc(doc(db, "clinics", currentClinic, "clinicAgenda", appointment.id), {
            confirmationStatus: "queued",
            reminderQueuedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })));
      }
      toast.success(`${queuedTotal} lembrete(s) colocado(s) na fila${skippedTotal ? ` • ${skippedTotal} já estavam na fila/enviados` : ""}.`);
      setSelectedIds([]);
    } catch (error) {
      console.error("[clinic-send]", error);
      toast.error(error instanceof Error ? error.message : "Erro ao disparar os lembretes.");
    } finally {
      setSending(false);
    }
  };

  if (!currentClinic) {
    return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Selecione a clínica para usar as confirmações.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-heading font-bold">Clínica • Confirmações</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Importe o PDF da agenda, confira os pacientes e dispare os lembretes pelo mesmo agente do Rede Leads.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`rounded-full border px-3 py-1.5 text-xs font-medium ${agentStatus.connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            Agente {agentStatus.connected ? "conectado" : "desconectado"}
          </div>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importAgenda(file);
          }} />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={importing} className="gap-2">
            {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {importing ? "Lendo agenda..." : "Importar agenda PDF"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Consultas</div><div className="mt-1 text-2xl font-bold">{stats.total}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Prontas para WhatsApp</div><div className="mt-1 text-2xl font-bold">{stats.valid}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Na fila</div><div className="mt-1 text-2xl font-bold">{stats.queued}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Sem telefone válido</div><div className="mt-1 text-2xl font-bold">{stats.invalid}</div></div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium">Dia</label>
            <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              {dates.length === 0 && <option value="">Sem agenda importada</option>}
              {dates.map((date) => <option key={date} value={date}>{date}</option>)}
            </select>
            {visibleAppointments.length > 0 && <span className="text-xs text-muted-foreground">{visibleAppointments.length} consulta(s)</span>}
          </div>
          <Button onClick={sendSelected} disabled={sending || selectedIds.length === 0 || !agentStatus.connected} className="gap-2">
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Colocando na fila..." : `Disparar selecionados (${selectedIds.length})`}
          </Button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando agenda...</div>
        ) : visibleAppointments.length === 0 ? (
          <div className="p-10 text-center">
            <FileUp className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">Importe a agenda da clínica</h3>
            <p className="mt-1 text-sm text-muted-foreground">Use o relatório “Agenda - Relatórios - Marcados”. O sistema junta automaticamente os blocos de 15 minutos do mesmo paciente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3"><input type="checkbox" checked={selectableAppointments.length > 0 && selectableAppointments.every((item) => selectedIds.includes(item.id))} onChange={toggleAll} /></th>
                  <th className="px-3 py-3">Horário</th>
                  <th className="px-3 py-3">Paciente</th>
                  <th className="px-3 py-3">Telefone</th>
                  <th className="px-3 py-3">Profissional</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Mensagem</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleAppointments.map((appointment) => {
                  const phoneOk = validPhone(appointment.phone);
                  const queued = appointment.confirmationStatus === "queued";
                  return (
                    <tr key={appointment.id} className="align-top hover:bg-muted/20">
                      <td className="px-4 py-3"><input type="checkbox" disabled={!phoneOk || queued} checked={selectedIds.includes(appointment.id)} onChange={() => toggleOne(appointment.id)} /></td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium"><div className="flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-muted-foreground" />{appointment.startTime}<span className="text-xs font-normal text-muted-foreground">– {appointment.endTime}</span></div></td>
                      <td className="px-3 py-3"><div className="flex items-center gap-1.5 font-medium"><UserRound className="h-4 w-4 text-muted-foreground" />{appointment.name}</div></td>
                      <td className="whitespace-nowrap px-3 py-3">{appointment.phone || <span className="text-destructive">Sem telefone</span>}</td>
                      <td className="px-3 py-3">{prettyProfessional(appointment.professional)}</td>
                      <td className="px-3 py-3">
                        {queued ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Na fila</span>
                        ) : phoneOk ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"><MessageCircle className="h-3.5 w-3.5" />Pendente</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700"><XCircle className="h-3.5 w-3.5" />Telefone inválido</span>
                        )}
                      </td>
                      <td className="max-w-[420px] px-3 py-3 text-xs leading-relaxed text-muted-foreground">{phoneOk ? buildMessage(appointment, currentClinic) : "—"}</td>
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
