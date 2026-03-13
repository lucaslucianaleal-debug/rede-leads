import { WHATSAPP_CLINIC_NUMBER } from "@/types/crm";

export function generateWhatsAppLink(
  leadPhone: string,
  leadName: string,
  servicoProcurado: string,
  dataAgendamento: string,
  reminderType: "h24" | "today"
): string {
  const [datePart, timePart] = (dataAgendamento || "").split(" ");
  const date = datePart || "[Data]";
  const time = timePart || "[Horário]";
  const isTomorrow = reminderType === "h24";

  const message = isTomorrow
    ? `Olá, ${leadName}! Tudo bem? Passando para lembrar da sua consulta aqui na OdontoCompany amanhã, dia ${date}, às ${time}. Já deixamos tudo reservado para o seu atendimento. Até amanhã! 🦷💚`
    : `Bom dia, ${leadName}! Tudo certo para o seu horário hoje às ${time} aqui na OdontoCompany? Já estamos com sua sala preparada e te aguardando. Até logo! 💚✨`;

  const phone = leadPhone.replace(/[^0-9]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function generateAppointmentConfirmationMessage(leadPhone: string, dataAgendamento: string): string {
  const message = `Confirmação de Consulta na Odontocompany💚\n\nSua consulta está agendada para:\n\nData e Horario: ${dataAgendamento}\n\n📍 Endereço : R. Bernardino de Campos, 840 - Centro, Olímpia - SP, 15400-079\n\n⏰ Pedimos que chegue 15 minutinhos antes do horário combinado, tá bem?\n\nPode me confirmar as informações, por favor? 😊`;
  const phone = leadPhone.replace(/[^0-9]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function generateReminderText(
  dataAgendamento: string,
  type: "h24" | "today",
  name?: string
): string {
  const [datePart, timePart] = (dataAgendamento || "").split(" ");
  const date = datePart || "[Data]";
  const time = timePart || "[Horário]";

  if (type === "h24") {
    // Amanhã
    return `Olá, ${name || "!"} Tudo bem? Passando para lembrar da sua consulta aqui na OdontoCompany amanhã, dia ${date}, às ${time}. Já deixamos tudo reservado para o seu atendimento. Até amanhã! 🦷💚`;
  } else {
    // Hoje
    return `Bom dia, ${name || "!"} Tudo certo para o seu horário hoje às ${time} aqui na OdontoCompany? Já estamos com sua sala preparada e te aguardando. Até logo! 💚✨`;
  }
}

export function generateAppointmentConfirmationText(dataAgendamento: string): string {
  return `Confirmação de Consulta na Odontocompany💚\n\nSua consulta está agendada para:\n\nData e Horario: ${dataAgendamento}\n\n📍 Endereço : R. Bernardino de Campos, 840 - Centro, Olímpia - SP, 15400-079\n\n⏰ Pedimos que chegue 15 minutinhos antes do horário combinado, tá bem?\n\nPode me confirmar as informações, por favor? 😊`;
}

const CLINIC_ADDRESS_FALLBACK: Record<string, string> = {
  "odontocompany-olimpia": "R. Bernardino de Campos, 840 - Centro, Olímpia - SP, 15400-079",
  "odontocompany-badybassit": "SP-355, 1160 - Distrito Urbano, Bady Bassitt - SP, 15115-000",
  "odontocompany-novohorizonte": "Rua Coronel Carvalho Leme, 427 - Centro, Novo Horizonte - SP, 14960-000",
};

export function generateAppointmentConfirmationTextForClinic(clinicMeta: any | undefined, dataAgendamento: string): string {
  const clinicName = clinicMeta?.name || "Odontocompany";
  const clinicId = clinicMeta?.id;
  const address = clinicMeta?.address || (clinicId ? CLINIC_ADDRESS_FALLBACK[clinicId] : undefined) || CLINIC_ADDRESS_FALLBACK["odontocompany-olimpia"];
  return `Confirmação de Consulta na ${clinicName}💚\n\nSua consulta está agendada para:\n\nData e Horario: ${dataAgendamento}\n\n📍 Endereço : ${address}\n\n⏰ Pedimos que chegue 15 minutinhos antes do horário combinado, tá bem?\n\nPode me confirmar as informações, por favor? 😊`;
}

export function generateAppointmentConfirmationLinkForClinic(leadPhone: string, clinicMeta: any | undefined, dataAgendamento: string): string {
  const message = generateAppointmentConfirmationTextForClinic(clinicMeta, dataAgendamento);
  const phone = leadPhone.replace(/[^0-9]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
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
