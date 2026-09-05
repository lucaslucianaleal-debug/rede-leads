import { useMemo } from "react";
import { CalendarCheck, Clock3, UserCheck, Users } from "lucide-react";
import { Lead } from "@/types/crm";
import { calculateDashboardMonthlyMetrics } from "@/lib/dashboardMetrics";

interface DashboardMonthlySummaryProps {
  leads: Lead[];
}

export function DashboardMonthlySummary({ leads }: DashboardMonthlySummaryProps) {
  const summary = useMemo(() => {
    const now = new Date();
    const metrics = calculateDashboardMonthlyMetrics(leads, now);

    return {
      ...metrics,
      monthLabel: now.toLocaleDateString("pt-BR", { month: "long" }),
    };
  }, [leads]);

  const cards = [
    {
      label: "Leads no mês",
      value: summary.leadsThisMonth,
      detail: `Recebidos em ${summary.monthLabel}`,
      icon: Users,
      iconClass: "bg-primary/10 text-primary",
    },
    {
      label: "Agendamentos no mês",
      value: summary.appointmentsCreatedThisMonth,
      detail: `${summary.appointmentRate}% dos leads do mês`,
      icon: CalendarCheck,
      iconClass: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "Pendências vencidas",
      value: summary.overdueFollowUps,
      detail: summary.overdueFollowUps === 0 ? "Operação em dia" : "Meta: deixar zerado",
      icon: Clock3,
      iconClass: summary.overdueFollowUps === 0
        ? "bg-emerald-500/10 text-emerald-600"
        : "bg-amber-500/10 text-amber-600",
    },
    {
      label: "Comparecimentos no mês",
      value: summary.attendedThisMonth,
      detail: `${summary.attendanceRate}% dos agendados do mês`,
      icon: UserCheck,
      iconClass: "bg-emerald-500/10 text-emerald-600",
    },
  ];

  return (
    <section aria-label={`Resumo de ${summary.monthLabel}`}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon, iconClass }) => (
          <div key={label} className="flex min-h-[86px] items-center gap-3 rounded-xl border border-border/70 bg-card/70 px-3.5 py-3 shadow-sm">
            <div className={`inline-flex shrink-0 rounded-lg p-2 ${iconClass}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
                <p className="truncate text-sm font-medium text-foreground">{label}</p>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
