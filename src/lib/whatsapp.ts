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
  // Garante só o primeiro nome
  const firstName = (name || "").split(" ")[0] || "!";

  if (type === "h24") {
    // Amanhã
    return (
      `Olá, ${firstName}! Tudo bem?\n\n` +
      `Passando para lembrar da sua consulta aqui na OdontoCompany amanhã, dia ${date}, às ${time}.\n\n` +
      `Já deixamos tudo reservado para o seu atendimento.\n\n` +
      `Até amanhã! 🦷💚`
    );
  } else {
    // Hoje
    return (
      `Bom dia, ${firstName}!\n\n` +
      `Tudo certo para o seu horário hoje às ${time} aqui na OdontoCompany?\n\n` +
      `Já estamos com sua sala preparada e te aguardando.\n\n` +
      `Até logo! 💚✨`
    );
  }
}

export function generateAppointmentConfirmationText(dataAgendamento: string): string {
  return `Confirmação de Consulta na Odontocompany💚\n\nSua consulta está agendada para:\n\nData e Horario: ${dataAgendamento}\n\n📍 Endereço : R. Bernardino de Campos, 840 - Centro, Olímpia - SP, 15400-079\n\n⏰ Pedimos que chegue 15 minutinhos antes do horário combinado, tá bem?\n\nPode me confirmar as informações, por favor? 😊`;
}

const CLINIC_ADDRESS_FALLBACK: Record<string, string> = {
  "odontocompany-olimpia": "R. Bernardino de Campos, 840 - Centro, Olímpia - SP, 15400-079",
  "odontocompany-badybassit": "Av. Camilo de Moraes, 1160 - Distrito Urbano, Bady Bassitt - SP",
  "odontocompany-novohorizonte": "Rua Coronel Carvalho Leme, 427 - Centro, Novo Horizonte - SP, 14960-000",
  // also allow shorter keys if clinics use different ids
  "olimpia": "R. Bernardino de Campos, 840 - Centro, Olímpia - SP, 15400-079",
  "badybassit": "Av. Camilo de Moraes, 1160 - Distrito Urbano, Bady Bassitt - SP",
  "novohorizonte": "Rua Coronel Carvalho Leme, 427 - Centro, Novo Horizonte - SP, 14960-000",
};

function normalizeKey(s: string | undefined) {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// build a normalized lookup map to avoid mismatches like "novo-horizonte" vs "novohorizonte"
const NORMALIZED_CLINIC_ADDRESS_FALLBACK: Record<string, string> = Object.keys(CLINIC_ADDRESS_FALLBACK).reduce((acc, k) => {
  acc[normalizeKey(k)] = CLINIC_ADDRESS_FALLBACK[k];
  return acc;
}, {} as Record<string, string>);

function slugify(s: string | undefined) {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getArticleForServico(servico: string): string {
  // Serviços femininos (usa "sua")
  const femininos = ["limpeza", "avaliação", "restauração"];
  const servicoLower = servico.toLowerCase();
  if (femininos.some((f) => servicoLower.includes(f))) {
    return "sua";
  }
  // Padrão: "seu" (clareamento, implante, etc)
  return "seu";
}

export function generateAppointmentConfirmationTextForClinic(
  clinicMeta: any | undefined,
  dataAgendamento: string,
  clientName?: string,
  servicos?: string[]
): string {
  const clinicName = clinicMeta?.name || "Odontocompany";
  const clinicId = clinicMeta?.id;
  const clinicAddressFromMeta = clinicMeta?.address;

  // Build services text with correct grammar
  let servicoText = "sua consulta";
  if (servicos && servicos.length > 0) {
    const servicoComArtigo = servicos
      .map((s) => `${getArticleForServico(s)} ${s}`)
      .join(", ");
    servicoText = servicoComArtigo;
  }

  const greeting = clientName ? `Oi ${clientName}!\n\n` : "";
  const msgHeader = `${greeting}Essa é a confirmação do ${servicoText} na ${clinicName}💚\n\nSeu agendamento está marcado para:\n\nData e Horário: ${dataAgendamento}`;

  // If clinic has explicit address, use it
  if (clinicAddressFromMeta) {
    return `${msgHeader}\n\n📍 Endereço : ${clinicAddressFromMeta}\n\n⏰ Pedimos que chegue 15 minutinhos antes do horário combinado, tá bem?\n\nPode me confirmar as informações, por favor? 😊`;
  }

  // Try multiple keys to find a fallback address (using normalized keys)
  const candidates: string[] = [];
  if (clinicId) candidates.push(String(clinicId));
  if (clinicId) candidates.push(`odontocompany-${clinicId}`);
  const nameSlug = slugify(clinicMeta?.name);
  if (nameSlug) candidates.push(nameSlug);
  if (nameSlug) candidates.push(`odontocompany-${nameSlug}`);

  let address: string | undefined;
  for (const c of candidates) {
    if (!c) continue;
    const nk = normalizeKey(c);
    if (NORMALIZED_CLINIC_ADDRESS_FALLBACK[nk]) {
      address = NORMALIZED_CLINIC_ADDRESS_FALLBACK[nk];
      break;
    }
  }

  // final fallback to olympia
  if (!address) address = CLINIC_ADDRESS_FALLBACK["odontocompany-olimpia"];

  return `${msgHeader}\n\n📍 Endereço : ${address}\n\n⏰ Pedimos que chegue 15 minutinhos antes do horário combinado, tá bem?\n\nPode me confirmar as informações, por favor? 😊`;
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
