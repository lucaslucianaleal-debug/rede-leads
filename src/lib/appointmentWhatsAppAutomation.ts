import type { Lead } from "@/types/crm";
import { generateAppointmentConfirmationTextForClinic } from "@/lib/whatsapp";

type FirebaseUserLike = {
  getIdToken: () => Promise<string>;
};

type ClinicMeta = {
  id: string;
  name?: string;
  address?: string;
};

type ScheduleArgs = {
  user: FirebaseUserLike | null | undefined;
  clinicId: string;
  clinicMeta?: ClinicMeta | null;
  lead: Lead;
  dataAgendamento: string;
  confirmationMessage?: string;
};

export type AppointmentAutomationResult = {
  ok: boolean;
  confirmationQueued?: boolean;
  scheduled?: string[];
  skipped?: string[];
};

function buildReminderMessages(dataAgendamento: string, firstName: string) {
  const [date = "[Data]", time = "[Horário]"] = String(dataAgendamento || "").split(" ");

  return {
    h24:
      `Olá, ${firstName}! Tudo bem?\n\n` +
      `Passando para lembrar da sua consulta na OdontoCompany Olímpia, dia ${date}, às ${time}.\n\n` +
      `Já deixamos tudo reservado para o seu atendimento.\n\n` +
      `Te esperamos! 🦷💚`,
    h12:
      `Olá, ${firstName}! Tudo bem?\n\n` +
      `Só reforçando o seu horário na OdontoCompany Olímpia: dia ${date}, às ${time}.\n\n` +
      `Seu atendimento está reservado e estaremos te aguardando. 💚`,
    h1:
      `Olá, ${firstName}! 💚\n\n` +
      `Está chegando a hora do seu atendimento na OdontoCompany Olímpia. Seu horário é às ${time}.\n\n` +
      `Já estamos preparando sua sala e te aguardamos por aqui.\n\n` +
      `Até já! ✨`,
  };
}

export async function scheduleAppointmentWhatsAppAutomation({
  user,
  clinicId,
  clinicMeta,
  lead,
  dataAgendamento,
  confirmationMessage,
}: ScheduleArgs): Promise<AppointmentAutomationResult> {
  if (!user) throw new Error("Usuário não autenticado");
  if (!clinicId) throw new Error("Clínica não selecionada");
  if (!lead?.id || !lead?.telefone) throw new Error("Lead sem telefone válido");
  if (!dataAgendamento) throw new Error("Data de agendamento não informada");

  const firstName = (lead.nome || "").trim().split(/\s+/)[0] || "";
  const services = lead.servicoProcurado ? [lead.servicoProcurado] : [];
  const reminders = buildReminderMessages(dataAgendamento, firstName);
  const messages = {
    confirmation:
      confirmationMessage?.trim() ||
      generateAppointmentConfirmationTextForClinic(
        clinicMeta,
        dataAgendamento,
        firstName,
        services,
      ),
    ...reminders,
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
