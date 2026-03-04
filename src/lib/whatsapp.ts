import { WHATSAPP_CLINIC_NUMBER } from "@/types/crm";

type ReminderType = "24h" | "12h" | "3h" | "1h";

export function generateWhatsAppLink(
  leadPhone: string,
  leadName: string,
  servicoProcurado: string,
  dataAgendamento: string,
  reminderType: ReminderType
): string {
  const message = `⏰ Lembrete da sua avaliação | OdontoCompany Olimpia\n\nOlá! \nPassando só pra lembrar que sua avaliação está marcada para *HOJE*. 😊\n\n📅 Data e Horário: ${dataAgendamento}\n\nQualquer imprevisto me avise por aqui.\nTe esperamos! 💚`;

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
    message = `Olá ${leadName}! 😊\n\nTudo bem? Estamos entrando em contato sobre o seu interesse em *${servicoProcurado}*.\n\nGostaríamos de agendar uma avaliação gratuita para você. Temos horários disponíveis esta semana!\n\nPosso agendar para você? 📅\n\n_Ninety Assessoria de Marketing e Vendas_`;
  }

  const phone = leadPhone.replace(/[^0-9]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
