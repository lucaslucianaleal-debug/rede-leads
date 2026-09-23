import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { AlertCircle, Clock3, Stethoscope, Utensils } from "lucide-react";

type ClinicAppointment = {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  professional: string;
  active?: boolean;
  confirmationStatus?: string;
  vacancyReleasedAt?: string;
};

type Vacancy = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  professional: string;
  minutes: number;
  source: "released" | "gap";
  originalPatient?: string;
};

type ProtectedBreak = { start: number; end: number; label: string };

const timeToMinutes = (value: string) => {
  const [h, m] = String(value || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};
const minutesToTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const prettyProfessional = (value: string) => {
  const clean = String(value || "").replace(/\s+-\s+(ORTO|ENDO|ORC|ORÇ).*$/i, "").replace(/\s+-\s*$/g, "").trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return clean.replace(/^Dra\.?\s*/i, "Dra. ") || "Profissional não identificada";
};
const dateSortKey = (value: string) => {
  const [d, m, y] = value.split("/");
  return `${y}-${m}-${d}`;
};

function slotMinutes(professional: string) {
  const key = prettyProfessional(professional).toLowerCase();
  if (key.includes("tailuene")) return 30;
  if (key.includes("lucas") || key.includes("gabriela") || key.includes("manuela")) return 60;
  return 60;
}

function protectedBreaks(professional: string): ProtectedBreak[] {
  const key = prettyProfessional(professional).toLowerCase();

  if (key.includes("tailuene")) {
    return [{ start: timeToMinutes("12:00"), end: timeToMinutes("14:00"), label: "Almoço" }];
  }
  if (key.includes("lucas") || key.includes("gabriela") || key.includes("manuela")) {
    return [{ start: timeToMinutes("12:00"), end: timeToMinutes("13:00"), label: "Almoço" }];
  }

  return [];
}

function overlapsBreak(start: number, end: number, professional: string) {
  return protectedBreaks(professional).some((pause) => start < pause.end && end > pause.start);
}

function splitGapAroundBreaks(start: number, end: number, professional: string) {
  let segments = [{ start, end }];
  protectedBreaks(professional).forEach((pause) => {
    const next: Array<{ start: number; end: number }> = [];
    segments.forEach((segment) => {
      if (segment.end <= pause.start || segment.start >= pause.end) {
        next.push(segment);
        return;
      }
      if (segment.start < pause.start) next.push({ start: segment.start, end: pause.start });
      if (segment.end > pause.end) next.push({ start: pause.end, end: segment.end });
    });
    segments = next;
  });
  return segments;
}

function isFreeStatus(status?: string) {
  return ["released_unconfirmed", "wont_attend", "cancelled", "reschedule"].includes(String(status || ""));
}

export function ClinicVacancies() {
  const { currentClinic } = useAuth();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [selectedProfessional, setSelectedProfessional] = useState("Todas");

  useEffect(() => {
    if (!currentClinic) return;
    return onSnapshot(collection(db, "clinics", currentClinic, "clinicAgenda"), (snapshot) => {
      setAppointments(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ClinicAppointment, "id">) })).filter((item) => item.active !== false));
    });
  }, [currentClinic]);

  const vacancies = useMemo(() => {
    const todayKey = dateSortKey(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()));
    const future = appointments.filter((item) => dateSortKey(item.date) >= todayKey);
    const result: Vacancy[] = [];

    future.filter((item) => isFreeStatus(item.confirmationStatus)).forEach((item) => {
      const start = timeToMinutes(item.startTime);
      const end = Math.max(start + slotMinutes(item.professional), timeToMinutes(item.endTime));
      if (overlapsBreak(start, end, item.professional)) return;
      result.push({
        id: `released_${item.id}`,
        date: item.date,
        startTime: item.startTime,
        endTime: minutesToTime(end),
        professional: prettyProfessional(item.professional),
        minutes: end - start,
        source: "released",
        originalPatient: item.name,
      });
    });

    const groups = new Map<string, ClinicAppointment[]>();
    future.filter((item) => !isFreeStatus(item.confirmationStatus)).forEach((item) => {
      const professional = prettyProfessional(item.professional);
      const key = `${item.date}|${professional}`;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });

    groups.forEach((items, key) => {
      const [date, professional] = key.split("|");
      const required = slotMinutes(professional);
      const sorted = [...items].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const currentEnd = timeToMinutes(sorted[i].endTime);
        const nextStart = timeToMinutes(sorted[i + 1].startTime);

        splitGapAroundBreaks(currentEnd, nextStart, professional).forEach((segment) => {
          const gap = segment.end - segment.start;
          if (gap < required) return;
          let cursor = segment.start;
          while (cursor + required <= segment.end) {
            result.push({
              id: `gap_${date}_${professional}_${cursor}`,
              date,
              startTime: minutesToTime(cursor),
              endTime: minutesToTime(cursor + required),
              professional,
              minutes: required,
              source: "gap",
            });
            cursor += required;
          }
        });
      }
    });

    return result.sort((a, b) => dateSortKey(a.date).localeCompare(dateSortKey(b.date)) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [appointments]);

  const professionals = useMemo(() => {
    return Array.from(new Set(vacancies.map((item) => item.professional))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [vacancies]);

  useEffect(() => {
    if (selectedProfessional !== "Todas" && !professionals.includes(selectedProfessional)) {
      setSelectedProfessional("Todas");
    }
  }, [professionals, selectedProfessional]);

  const filteredVacancies = useMemo(() => {
    if (selectedProfessional === "Todas") return vacancies;
    return vacancies.filter((item) => item.professional === selectedProfessional);
  }, [vacancies, selectedProfessional]);

  const countByProfessional = useMemo(() => {
    const map = new Map<string, number>();
    vacancies.forEach((item) => map.set(item.professional, (map.get(item.professional) || 0) + 1));
    return map;
  }, [vacancies]);

  const grouped = useMemo(() => {
    const map = new Map<string, Vacancy[]>();
    filteredVacancies.forEach((item) => {
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    });
    return map;
  }, [filteredVacancies]);

  if (!currentClinic) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-bold">Vagas para preencher</h2>
        <p className="mt-1 text-sm text-muted-foreground">Enxerga buracos utilizáveis entre consultas e vagas liberadas por falta de confirmação, respeitando pausas protegidas.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtrar por Dra.</span>
        <button
          type="button"
          onClick={() => setSelectedProfessional("Todas")}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${selectedProfessional === "Todas" ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
        >
          Todas · {vacancies.length}
        </button>
        {professionals.map((professional) => (
          <button
            key={professional}
            type="button"
            onClick={() => setSelectedProfessional(professional)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${selectedProfessional === professional ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            {professional} · {countByProfessional.get(professional) || 0}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Rule title="Dra. Tailuene" detail="30 min por atendimento" extra="Almoço 12:00–14:00 • vaga de 30 min pode receber avaliação" />
        <Rule title="Dr. Lucas" detail="mínimo 60 min" extra="Almoço 12:00–13:00" />
        <Rule title="Dra. Gabriela" detail="mínimo 60 min" extra="Almoço 12:00–13:00" />
        <Rule title="Dra. Manuela" detail="mínimo 60 min" extra="Almoço 12:00–13:00" />
      </div>

      <div className="rounded-xl border bg-violet-50/40 p-4 text-sm text-violet-900">
        <div className="flex gap-2"><Utensils className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Pausas protegidas:</strong> Tailuene 12:00–14:00; Lucas, Gabriela e Manuela 12:00–13:00. Esses períodos nunca entram como vagas disponíveis.</div></div>
      </div>

      <div className="rounded-xl border bg-amber-50/40 p-4 text-sm text-amber-900">
        <div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>V1:</strong> estamos detectando vagas dentro do intervalo já ocupado do profissional. Os horários antes do primeiro e depois do último paciente entram quando cadastrarmos a jornada oficial de cada dentista.</div></div>
      </div>

      {[...grouped.entries()].slice(0, 14).map(([date, items]) => (
        <div key={date} className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b bg-muted/30 px-4 py-3 font-semibold">{date} • {items.length} vaga(s)</div>
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="grid gap-2 px-4 py-3 md:grid-cols-[130px_1fr_220px] md:items-center">
                <div className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4" />{item.startTime}–{item.endTime}</div>
                <div>
                  <div className="flex items-center gap-2 font-medium"><Stethoscope className="h-4 w-4" />{item.professional}</div>
                  {item.originalPatient && <div className="mt-1 text-xs text-muted-foreground">Liberada de: {item.originalPatient}</div>}
                </div>
                <div className="md:text-right">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.source === "released" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {item.source === "released" ? "Vaga liberada" : `${item.minutes} min disponíveis`}
                  </span>
                  {item.professional.toLowerCase().includes("tailuene") && <div className="mt-1 text-[11px] text-violet-700">Pode receber avaliação</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!filteredVacancies.length && <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">Nenhuma vaga utilizável para o filtro selecionado.</div>}
    </div>
  );
}

function Rule({ title, detail, extra }: { title: string; detail: string; extra?: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="font-semibold">{title}</div><div className="mt-1 text-sm text-muted-foreground">{detail}</div>{extra && <div className="mt-2 text-xs font-medium text-violet-700">{extra}</div>}</div>;
}
