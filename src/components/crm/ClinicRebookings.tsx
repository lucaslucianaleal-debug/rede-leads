import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { CalendarClock, MessageCircle, Phone, RotateCcw, UserRound } from "lucide-react";

type ClinicAppointment = {
  id: string;
  name: string;
  phone: string;
  date: string;
  startTime: string;
  professional: string;
  active?: boolean;
  confirmationStatus?: string;
  lastReplyText?: string;
  lastReplyAt?: string;
  vacancyReleasedAt?: string;
};

const prettyProfessional = (value: string) => {
  const clean = String(value || "").replace(/\s+-\s+(ORTO|ENDO|ORC|ORÇ).*$/i, "").replace(/\s+-\s*$/g, "").trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return clean.replace(/^Dra\.?\s*/i, "Dra. ") || "Profissional não identificada";
};
const dateSortKey = (value: string) => {
  const [d, m, y] = value.split("/");
  return `${y}-${m}-${d}`;
};

export function ClinicRebookings() {
  const { currentClinic } = useAuth();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);

  useEffect(() => {
    if (!currentClinic) return;
    return onSnapshot(collection(db, "clinics", currentClinic, "clinicAgenda"), (snapshot) => {
      setAppointments(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ClinicAppointment, "id">) })).filter((item) => item.active !== false));
    });
  }, [currentClinic]);

  const items = useMemo(() => appointments
    .filter((item) => ["reschedule", "wont_attend", "cancelled", "released_unconfirmed"].includes(String(item.confirmationStatus || "")))
    .sort((a, b) => dateSortKey(a.date).localeCompare(dateSortKey(b.date)) || a.startTime.localeCompare(b.startTime)), [appointments]);

  if (!currentClinic) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-bold">Reagendamentos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pacientes que pediram mudança, disseram que não vão ou responderam depois de a vaga ter sido liberada.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Para reagendar" value={items.filter((item) => item.confirmationStatus === "reschedule").length} />
        <Card label="Não vão" value={items.filter((item) => ["wont_attend", "cancelled"].includes(String(item.confirmationStatus || ""))).length} />
        <Card label="Vagas liberadas" value={items.filter((item) => item.confirmationStatus === "released_unconfirmed").length} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/30 px-4 py-3 font-semibold">Fila de ação • {items.length}</div>
        {items.length ? <div className="divide-y">{items.map((item) => (
          <div key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[150px_1fr_220px] md:items-center">
            <div>
              <div className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />{item.date}</div>
              <div className="mt-1 text-sm text-muted-foreground">{item.startTime}</div>
            </div>
            <div>
              <div className="flex items-center gap-2 font-medium"><UserRound className="h-4 w-4" />{item.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{prettyProfessional(item.professional)}</div>
              {item.lastReplyText && <div className="mt-2 flex items-center gap-1.5 text-xs"><MessageCircle className="h-3.5 w-3.5" />“{item.lastReplyText}”</div>}
            </div>
            <div className="md:text-right">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"><RotateCcw className="h-3.5 w-3.5" />{item.confirmationStatus === "released_unconfirmed" ? "Vaga liberada" : item.confirmationStatus === "reschedule" ? "Reagendar" : "Não vai"}</div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground md:justify-end"><Phone className="h-3.5 w-3.5" />{item.phone || "Sem telefone"}</div>
            </div>
          </div>
        ))}</div> : <div className="p-10 text-center text-sm text-muted-foreground">Nenhum paciente aguardando reagendamento.</div>}
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>;
}
