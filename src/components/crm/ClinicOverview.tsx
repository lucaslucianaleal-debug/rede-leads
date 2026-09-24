import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Landmark, MessageCircle, RotateCcw, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ClinicAppointment = {
  id: string;
  date: string;
  active?: boolean;
  confirmationStatus?: string;
};

type AgendaDestination = "calendar" | "confirmations" | "vacancies" | "rebookings";

type ClinicOverviewProps = {
  onOpenAgenda: (view: AgendaDestination) => void;
  onOpenFinance: () => void;
};

const todayKey = () => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date());

export function ClinicOverview({ onOpenAgenda, onOpenFinance }: ClinicOverviewProps) {
  const { currentClinic } = useAuth();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);

  useEffect(() => {
    if (!currentClinic) return;
    return onSnapshot(collection(db, "clinics", currentClinic, "clinicAgenda"), (snapshot) => {
      setAppointments(snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<ClinicAppointment, "id">) }))
        .filter((item) => item.active !== false));
    });
  }, [currentClinic]);

  const stats = useMemo(() => {
    const today = todayKey();
    const todaysAppointments = appointments.filter((item) => item.date === today);
    const confirmed = todaysAppointments.filter((item) => item.confirmationStatus === "confirmed").length;
    const waiting = todaysAppointments.filter((item) => ![
      "confirmed", "wont_attend", "cancelled", "reschedule", "released_unconfirmed",
    ].includes(String(item.confirmationStatus || "pending"))).length;
    const rebookings = appointments.filter((item) => [
      "reschedule", "wont_attend", "cancelled", "released_unconfirmed",
    ].includes(String(item.confirmationStatus || ""))).length;
    const released = appointments.filter((item) => item.confirmationStatus === "released_unconfirmed").length;

    return {
      today: todaysAppointments.length,
      confirmed,
      waiting,
      rebookings,
      released,
    };
  }, [appointments]);

  return (
    <div className="space-y-5">
      <section>
        <h2 className="font-heading text-2xl font-bold">Visão geral da clínica</h2>
        <p className="mt-1 text-sm text-muted-foreground">Entre pelo que precisa resolver agora. Agenda e financeiro ficam separados para não misturar a operação.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Consultas hoje" value={stats.today} icon={<CalendarDays className="h-5 w-5" />} />
        <SummaryCard label="Confirmados hoje" value={stats.confirmed} icon={<CheckCircle2 className="h-5 w-5" />} />
        <SummaryCard label="Aguardando confirmação" value={stats.waiting} icon={<Clock3 className="h-5 w-5" />} />
        <SummaryCard label="Precisam ação" value={stats.rebookings} icon={<RotateCcw className="h-5 w-5" />} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="border-b bg-emerald-50/50 p-5">
              <div className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="h-5 w-5 text-emerald-700" />Agenda</div>
              <p className="mt-1 text-sm text-muted-foreground">Calendário, confirmações, vagas e reagendamentos em um único lugar.</p>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              <Shortcut label="Calendário" helper={`${stats.today} consulta(s) hoje`} icon={<CalendarDays className="h-4 w-4" />} onClick={() => onOpenAgenda("calendar")} />
              <Shortcut label="Confirmações" helper={`${stats.waiting} aguardando`} icon={<MessageCircle className="h-4 w-4" />} onClick={() => onOpenAgenda("confirmations")} />
              <Shortcut label="Vagas" helper={`${stats.released} liberada(s)`} icon={<Search className="h-4 w-4" />} onClick={() => onOpenAgenda("vacancies")} />
              <Shortcut label="Reagendamentos" helper={`${stats.rebookings} precisam ação`} icon={<RotateCcw className="h-4 w-4" />} onClick={() => onOpenAgenda("rebookings")} />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="border-b bg-blue-50/50 p-5">
              <div className="flex items-center gap-2 text-lg font-semibold"><Landmark className="h-5 w-5 text-blue-700" />Financeiro</div>
              <p className="mt-1 text-sm text-muted-foreground">Cobrança, inadimplência, vendas e conciliação ficam isolados da agenda.</p>
            </div>
            <div className="p-4">
              <Button className="w-full justify-between" variant="outline" onClick={onOpenFinance}>
                Abrir Financeiro
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold">{value}</div>
        </div>
        <div className="rounded-xl border bg-muted/30 p-2.5 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}

function Shortcut({ label, helper, icon, onClick }: { label: string; helper: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-between rounded-xl border bg-background p-3 text-left transition hover:bg-muted/40">
      <div className="flex min-w-0 items-center gap-3">
        <div className="rounded-lg bg-muted p-2">{icon}</div>
        <div className="min-w-0">
          <div className="font-medium">{label}</div>
          <div className="truncate text-xs text-muted-foreground">{helper}</div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
