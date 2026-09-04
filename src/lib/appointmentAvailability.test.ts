import { describe, expect, it } from "vitest";
import type { Lead } from "@/types/crm";
import { appointmentConflicts, suggestAvailableTimes } from "./appointmentAvailability";

function lead(id: string, appointment: string, stage: Lead["etapaLead"] = "Avaliação agendada") {
  return {
    id,
    dataAgendamento: appointment,
    etapaLead: stage,
  } as Lead;
}

describe("appointment availability", () => {
  it("finds active appointments at the same date and time", () => {
    const leads = [
      lead("one", "05/09/2026 09:30"),
      lead("two", "05/09/2026 10:00"),
      lead("closed", "05/09/2026 09:30", "Desistência"),
    ];

    expect(appointmentConflicts(leads, "05/09/2026 09:30", "current").map((item) => item.id)).toEqual(["one"]);
  });

  it("does not flag the lead being rescheduled", () => {
    const leads = [lead("same", "05/09/2026 09:30")];
    expect(appointmentConflicts(leads, "05/09/2026 09:30", "same")).toEqual([]);
  });

  it("suggests nearby free half-hour slots", () => {
    const leads = [
      lead("one", "05/09/2026 10:00"),
      lead("two", "05/09/2026 10:30"),
    ];

    expect(suggestAvailableTimes(leads, "05/09/2026", "09:30", "current", 3)).toEqual(["11:00", "11:30", "12:00"]);
  });
});
