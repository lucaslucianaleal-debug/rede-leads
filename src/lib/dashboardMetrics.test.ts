import { describe, expect, it } from "vitest";
import { Lead } from "@/types/crm";
import { calculateDashboardMonthlyMetrics } from "./dashboardMetrics";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    dataCriacao: "01/09/2026",
    dataContato: "01/09/2026",
    nome: "Paciente",
    telefone: "5517999999999",
    servicoProcurado: "Implante",
    captador: "Lucas",
    fonteLead: "Meta",
    etapaLead: "Follow-Up 2",
    status: "MORNO",
    respostaLead: "NÃO RESPONDEU",
    comparecimento: "",
    dataFollowUp: "04/09/2026",
    dataAgendamento: "",
    dataRetornoLigacao: "",
    observacao: "",
    followUpCount: 2,
    lembretes: { h24: false, today: false },
    ...overrides,
  };
}

describe("calculateDashboardMonthlyMetrics", () => {
  const referenceDate = new Date(2026, 8, 5, 12);

  it("calcula os indicadores do mês usando períodos explícitos", () => {
    const metrics = calculateDashboardMonthlyMetrics([
      lead({ id: "1", dataAgendamentoCriado: "02/09/2026", dataAgendamento: "05/09/2026 09:30", comparecimento: "COMPARECEU" }),
      lead({ id: "2", dataAgendamentoCriado: "03/09/2026", dataAgendamento: "08/09/2026 11:00" }),
      lead({ id: "3", dataCriacao: "20/08/2026", dataContato: "20/08/2026", dataFollowUp: "10/09/2026" }),
    ], referenceDate);

    expect(metrics.leadsThisMonth).toBe(2);
    expect(metrics.appointmentsCreatedThisMonth).toBe(2);
    expect(metrics.appointmentsForThisMonth).toBe(2);
    expect(metrics.attendedThisMonth).toBe(1);
    expect(metrics.appointmentRate).toBe(100);
    expect(metrics.attendanceRate).toBe(50);
  });

  it("conta somente follow-ups realmente vencidos", () => {
    const metrics = calculateDashboardMonthlyMetrics([
      lead({ id: "overdue", dataFollowUp: "04/09/2026" }),
      lead({ id: "today", dataFollowUp: "05/09/2026" }),
      lead({ id: "future", dataFollowUp: "06/09/2026" }),
      lead({ id: "finished", dataFollowUp: "01/09/2026", etapaLead: "Finalizado" }),
      lead({ id: "scheduled", dataFollowUp: "01/09/2026", dataAgendamento: "10/09/2026 09:00" }),
      lead({ id: "deleted", dataFollowUp: "01/09/2026", _deleted: true }),
    ], referenceDate);

    expect(metrics.overdueFollowUps).toBe(1);
  });
});
