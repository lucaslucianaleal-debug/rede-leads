import { Lead } from "@/types/crm";

const FINAL_STAGES = new Set([
  "FINALIZADO",
  "FINALIZADA",
  "DESISTÊNCIA",
  "DESISTENCIA",
  "FORA DA REGIÃO",
  "FORA DA REGIAO",
]);

function datePart(value?: string): string {
  return String(value || "").split(" ")[0];
}

function isInMonth(value: string | undefined, month: number, year: number): boolean {
  const [dayText, monthText, yearText] = datePart(value).split("/");
  const day = Number(dayText);
  return Number.isInteger(day)
    && day >= 1
    && day <= 31
    && Number(monthText) === month
    && Number(yearText) === year;
}

function parseBrazilianDate(value?: string): Date | null {
  const [dayText, monthText, yearText] = datePart(value).split("/");
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (!day || !month || !year) return null;

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type DashboardMonthlyMetrics = {
  leadsThisMonth: number;
  appointmentsCreatedThisMonth: number;
  appointmentsForThisMonth: number;
  attendedThisMonth: number;
  overdueFollowUps: number;
  appointmentRate: number;
  attendanceRate: number;
};

export function calculateDashboardMonthlyMetrics(
  leads: Lead[],
  referenceDate = new Date(),
): DashboardMonthlyMetrics {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const month = referenceDate.getMonth() + 1;
  const year = referenceDate.getFullYear();

  let leadsThisMonth = 0;
  let appointmentsCreatedThisMonth = 0;
  let appointmentsForThisMonth = 0;
  let attendedThisMonth = 0;
  let overdueFollowUps = 0;

  for (const lead of leads) {
    if (lead._deleted) continue;

    if (isInMonth(lead.dataCriacao || lead.dataContato, month, year)) {
      leadsThisMonth += 1;
    }
    if (isInMonth(lead.dataAgendamentoCriado, month, year)) {
      appointmentsCreatedThisMonth += 1;
    }
    if (isInMonth(lead.dataAgendamento, month, year)) {
      appointmentsForThisMonth += 1;
      if (lead.comparecimento === "COMPARECEU") attendedThisMonth += 1;
    }

    if (!lead.dataFollowUp || lead.followUpCadenceCompletedAt) continue;
    if (FINAL_STAGES.has(String(lead.etapaLead || "").toUpperCase())) continue;
    if (lead.dataAgendamento && lead.comparecimento !== "NÃO COMPARECEU") continue;

    const dueDate = parseBrazilianDate(lead.dataFollowUp);
    if (dueDate && dueDate.getTime() < today.getTime()) overdueFollowUps += 1;
  }

  return {
    leadsThisMonth,
    appointmentsCreatedThisMonth,
    appointmentsForThisMonth,
    attendedThisMonth,
    overdueFollowUps,
    appointmentRate: leadsThisMonth > 0
      ? Math.round((appointmentsCreatedThisMonth / leadsThisMonth) * 100)
      : 0,
    attendanceRate: appointmentsForThisMonth > 0
      ? Math.round((attendedThisMonth / appointmentsForThisMonth) * 100)
      : 0,
  };
}
