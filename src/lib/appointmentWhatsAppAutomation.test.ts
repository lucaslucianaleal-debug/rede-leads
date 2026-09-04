import { afterEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/types/crm";
import { scheduleAppointmentWhatsAppAutomation } from "@/lib/appointmentWhatsAppAutomation";

describe("scheduleAppointmentWhatsAppAutomation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envia a mensagem revisada e mantém os lembretes automáticos", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        confirmationQueued: true,
        scheduled: ["appointment_reminder_24h", "appointment_reminder_today"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await scheduleAppointmentWhatsAppAutomation({
      user: { getIdToken: vi.fn().mockResolvedValue("token") },
      clinicId: "clinica-1",
      clinicMeta: { id: "clinica-1", name: "Clínica Teste" },
      lead: {
        id: "lead-1",
        nome: "Maria Silva",
        telefone: "11999999999",
        servicoProcurado: "Implante",
      } as Lead,
      dataAgendamento: "10/09/2026 14:30",
      confirmationMessage: "Mensagem revisada pela atendente",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request.body));

    expect(body.action).toBe("schedule_appointment");
    expect(body.messages.confirmation).toBe("Mensagem revisada pela atendente");
    expect(body.messages.h24).toBeTruthy();
    expect(body.messages.today).toBeTruthy();
  });
});
