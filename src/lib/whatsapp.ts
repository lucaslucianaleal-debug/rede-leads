import { WHATSAPP_CLINIC_NUMBER } from "@/types/crm";

type ReminderType = "24h" | "12h" | "3h" | "1h";

export function generateWhatsAppLink(
  leadPhone: string,
  leadName: string,
  servicoProcurado: string,
  dataAgendamento: string,
  reminderType: ReminderType
): string {
  const timeLabel: Record<ReminderType, string> = {
    "24h": "24 horas",
    "12h": "12 horas",
    "3h": "3 horas",
    "1h": "1 hora",
  };

  const message = `Olá ${leadName}! 😊\n\nEste é um lembrete da sua consulta de *${servicoProcurado}* agendada para *${dataAgendamento}*.\n\n⏰ Faltam *${timeLabel[reminderType]}* para o seu atendimento.\n\nCaso precise reagendar, entre em contato conosco.\n\nAguardamos você! 🦷\n\n_Ninety Assessoria de Marketing e Vendas_`;

  const phone = leadPhone.replace(/[^0-9]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function generateFollowUpWhatsAppLink(
  leadPhone: string,
  leadName: string,
  servicoProcurado: string,
  followUpNumber: number
): string {
  const message = `Olá ${leadName}! 😊\n\nTudo bem? Estamos entrando em contato sobre o seu interesse em *${servicoProcurado}*.\n\nGostaríamos de agendar uma avaliação gratuita para você. Temos horários disponíveis esta semana!\n\nPosso agendar para você? 📅\n\n_Ninety Assessoria de Marketing e Vendas_`;

  const phone = leadPhone.replace(/[^0-9]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
