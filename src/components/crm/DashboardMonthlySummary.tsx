import { useMemo } from "react";
import { CalendarCheck, Clock3, UserCheck, Users } from "lucide-react";
import { Lead } from "@/types/crm";
import { calculateDashboardMonthlyMetrics } from "@/lib/dashboardMetrics";

interface DashboardMonthlySummaryProps {
  leads: Lead[];
}

const MONTHLY_GOALS = {
  leads: 200,
  appointments: 80,
  attendance: 40,
};

export function DashboardMonthlySummary({ leads }: DashboardMonthlySummaryProps) {
  const summary = useMemo(() => {
    const now = new Date();
    const metrics = calculateDashboardMonthlyMetrics(leads, now);

    return {
      ...metrics,
      monthLabel: now.toLocaleDateString("pt-BR", { month: "long" }),
      dayOfMonth: now.getDate(),
      daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    };
  }, [leads]);

  const goalStatus = (value: number, goal: number) => {
    const progress = Math.min(Math.round((value / goal) * 100), 100);
    const expectedByToday = Math.ceil((goal * summary.dayOfMonth) / summary.daysInMonth);
    return {
      progress,
      onTrack: value >= expectedByToday,
      expectedByToday,
    };
  };

  const leadsGoal = goalStatus(summary.leadsThisMonth, MONTHLY_GOALS.leads);
  const appointmentsGoal = goalStatus(summary.appointmentsCreatedThisMonth, MONTHLY_GOALS.appointments);
  const attendanceGoal = goalStatus(summary.attendedThisMonth, MONTHLY_GOALS.attendance);

  const cards = [
    {
      label: "Leads no mês",
      value: summary.leadsThisMonth,
      detail: `Meta do mês: ${MONTHLY_GOALS.leads}`,
      expected: `Esperado hoje: ${leadsGoal.expectedByToday}`,
      status: leadsGoal.onTrack
        ? `${summary.leadsThisMonth - leadsGoal.expectedByToday} acima do ritmo`
        : `${leadsGoal.expectedByToday - summary.leadsThisMonth} abaixo do ritmo`,
      onTrack: leadsGoal.onTrack,
      progress: Math.min(Math.round((summary.leadsThisMonth / leadsGoal.expectedByToday) * 100), 100),
      icon: Users,
      iconClass: "bg-primary/10 text-primary",
    },
    {
      label: "Agendamentos no mês",
      value: summary.appointmentsCreatedThisMonth,
      detail: `Meta do mês: ${MONTHLY_GOALS.appointments}`,
      expected: `Esperado hoje: ${appointmentsGoal.expectedByToday}`,
      status: appointmentsGoal.onTrack
        ? `${summary.appointmentsCreatedThisMonth - appointmentsGoal.expectedByToday} acima do ritmo`
        : `${appointmentsGoal.expectedByToday - summary.appointmentsCreatedThisMonth} abaixo do ritmo`,
      onTrack: appointmentsGoal.onTrack,
      progress: Math.min(Math.round((summary.appointmentsCreatedThisMonth / appointmentsGoal.expectedByToday) * 100), 100),
      icon: CalendarCheck,
      iconClass: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "Pendências vencidas",
      value: summary.overdueFollowUps,
      detail: summary.overdueFollowUps === 0 ? "Nenhum contato atrasado" : "Meta: deixar zerado",
      expected: "Esperado: 0",
      status: summary.overdueFollowUps === 0 ? "Em dia" : "Atenção",
      onTrack: summary.overdueFollowUps === 0,
      progress: summary.overdueFollowUps === 0 ? 100 : 0,
      icon: Clock3,
      iconClass: summary.overdueFollowUps === 0
        ? "bg-emerald-500/10 text-emerald-600"
        : "bg-amber-500/10 text-amber-600",
    },
    {
      label: "Comparecimentos no mês",
      value: summary.attendedThisMonth,
      detail: `Meta do mês: ${MONTHLY_GOALS.attendance}`,
      expected: `Esperado hoje: ${attendanceGoal.expectedByToday}`,
      status: attendanceGoal.onTrack
        ? `${summary.attendedThisMonth - attendanceGoal.expectedByToday} acima do ritmo`
        : `${attendanceGoal.expectedByToday - summary.attendedThisMonth} abaixo do ritmo`,
      onTrack: attendanceGoal.onTrack,
      progress: Math.min(Math.round((summary.attendedThisMonth / attendanceGoal.expectedByToday) * 100), 100),
      icon: UserCheck,
      iconClass: "bg-emerald-500/10 text-emerald-600",
    },
  ];

  return (
    <section aria-label={`Resumo de ${summary.monthLabel}`}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(({ label, value, detail, expected, status, onTrack, progress, icon: Icon, iconClass }) => (
          <div key={label} className="min-h-[76px] rounded-xl border border-border/70 bg-card/70 px-3 py-2.5 shadow-sm">
            <div className="flex items-center gap-2">
              <div className={`inline-flex shrink-0 rounded-md p-1.5 ${iconClass}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
                  <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{expected}</span>
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
                </div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${onTrack ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={`shrink-0 text-[10px] font-semibold ${onTrack ? "text-emerald-600" : "text-amber-600"}`}>
                {status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
