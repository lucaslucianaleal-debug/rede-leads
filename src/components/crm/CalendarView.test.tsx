import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarView } from "@/components/crm/CalendarView";
import type { Lead } from "@/types/crm";

const makeLead = (overrides: Partial<Lead>): Lead => ({
  id: "lead-1",
  dataCriacao: "04/09/2026",
  dataContato: "04/09/2026",
  nome: "Maria Silva",
  telefone: "17999999999",
  servicoProcurado: "Implante",
  captador: "Online",
  fonteLead: "Online",
  etapaLead: "Avaliação agendada",
  status: "QUENTE",
  respostaLead: "RESPONDEU",
  comparecimento: "",
  dataFollowUp: "",
  dataAgendamento: "05/09/2026 16:00",
  dataRetornoLigacao: "",
  observacao: "",
  followUpCount: 0,
  lembretes: {
    h24: false,
    today: false,
    sent: { "24h": null, "12h": null, "3h": null, "1h": null, today: null },
  },
  ...overrides,
});

describe("CalendarView", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra separadamente lembretes enviados e programados", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4, 12, 0, 0));

    render(
      <CalendarView
        leads={[
          makeLead({
            id: "sent",
            dataAgendamento: "04/09/2026 16:00",
            lembretes: {
              h24: true,
              today: false,
              sent: {
                "24h": "2026-09-03T16:01:00-03:00",
                "12h": null,
                "3h": null,
                "1h": null,
                today: null,
              },
            },
          }),
          makeLead({ id: "scheduled", nome: "João Souza" }),
        ]}
        onMarkReminder={vi.fn()}
      />,
    );

    expect(screen.getByText("Enviado")).toBeInTheDocument();
    expect(screen.getByTitle(/24h antes: Enviado/)).toBeInTheDocument();
    expect(screen.getAllByText("Programado")).toHaveLength(2);
    expect(screen.getAllByText("24h antes")).toHaveLength(2);
    expect(screen.getAllByText("No dia")).toHaveLength(2);
  });
});
