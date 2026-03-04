import { WHATSAPP_CLINIC_NUMBER } from "@/types/crm";

export function generateWhatsAppLink(
  leadPhone: string,
  leadName: string,
  servicoProcurado: string,
  dataAgendamento: string,
  reminderType: "h24" | "today"
): string {
  const timeLabel = reminderType === "h24" ? "amanhã" : "HOJE";
  const message = `Olá!\nPassando só pra lembrar que sua avaliação está marcada para *${timeLabel}*.\n\nData e Horário: ${dataAgendamento}\n\nQualquer imprevisto me avise por aqui.\nTe esperamos!`;

  const phone = leadPhone.replace(/[^0-9]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function generateAppointmentConfirmationMessage(leadPhone: string, dataAgendamento: string): string {
  const message = `Confirmação de Consulta na Odontocompany Olimpia💚\nSua consulta está agendada para\n📍 Endereço : R. Bernardino de Campos, 840 - Centro, Olímpia - SP, 15400-079\n\nData e Horario: ${dataAgendamento}\n\n⏰ Pedimos que chegue 15 minutinhos antes do horário combinado, tá bem?\n\nPode me confirmar as informações, por favor? 😊`;
  const phone = leadPhone.replace(/[^0-9]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function generateAppointmentConfirmationText(dataAgendamento: string): string {
  return `Confirmação de Consulta na Odontocompany Olimpia💚\nSua consulta está agendada para\n📍 Endereço : R. Bernardino de Campos, 840 - Centro, Olímpia - SP, 15400-079\n\nData e Horario: ${dataAgendamento}\n\n⏰ Pedimos que chegue 15 minutinhos antes do horário combinado, tá bem?\n\nPode me confirmar as informações, por favor? 😊`;
}

export function generateFollowUpWhatsAppLink(
  leadPhone: string,
  leadName: string,
  servicoProcuradoOrMessage: string,
  followUpNumberOrUndefined?: number | undefined
): string {
  // Support both old API (servicoProcurado, followUpNumber) and new API (customMessage as 3rd param)
  const isFreeTextMessage = typeof followUpNumberOrUndefined === "undefined" || 
    (typeof servicoProcuradoOrMessage === "string" && servicoProcuradoOrMessage.length > 50);
  
  let message: string;
  
  if (isFreeTextMessage) {
    // New API: message is provided directly
    message = servicoProcuradoOrMessage;
  } else {
    // Old API: generate default message
    const servicoProcurado = servicoProcuradoOrMessage;
    message = `Olá ${leadName}! 😊\n\nTudo bem? Estamos entrando em contato sobre o seu interesse em *${servicoProcurado}*.\n\nGostaríamos de agendar uma avaliação gratuita para você. Temos horários disponíveis esta semana!\n\nPosso agendar para você? 📅\n\n_Central de Conversão de Leads • WhatsApp: (17) 99115-4763_`;
  }

  const phone = leadPhone.replace(/[^0-9]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
