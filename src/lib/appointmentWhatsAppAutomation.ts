import type { Lead } from "@/types/crm";
import { generateAppointmentConfirmationTextForClinic, generateReminderText } from "@/lib/whatsapp";

type FirebaseUserLike = {
  getIdToken: () => Promise<string>;
};

type ScheduleArgs = {
  user: FirebaseUserLike | null | undefined;
  clinicId: string;
  clinicMeta?: any;
  lead: Lead;
  dataAgendamento: string;
};

export type AppointmentAutomationResult = {
  ok: boolean;
  confirmationQueued?: boolean;
  scheduled?: string[];
  skipped?: string[];
};

export async function scheduleAppointmentWhatsAppAutomation({
  user,
  clinicId,
  clinicMeta,
  lead,
  dataAgendamento,
}: ScheduleArgs): Promise<AppointmentAutomationResult> {
  if (!user) throw new Error("Usuário não autenticado");
  if (!clinicId) throw new Error("Clínica não selecionada");
  if (!lead?.id || !lead?.telefone) throw new Error("Lead sem telefone válido");
  if (!dataAgendamento) throw new Error("Data de agendamento não informada");

  const firstName = (lead.nome || "").trim().split(/\s+/)[0] || "";
  const services = lead.servicoProcurado ? [lead.servicoProcurado] : [];
  const messages = {
    confirmation: generateAppointmentConfirmationTextForClinic(
      clinicMeta,
      dataAgendamento,
      firstName,
      services,
    ),
    h24: generateReminderText(dataAgendamento, "h24", firstName),
    today: generateReminderText(dataAgendamento, "today", firstName),
  };

  const token = await user.getIdToken();
  const response = await fetch("/api/whatsapp/queue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "schedule_appointment",
      clinicId,
      leadId: lead.id,
      appointment: dataAgendamento,
      messages,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Não foi possível programar as mensagens do agendamento");
  }
  return data as AppointmentAutomationResult;
}
