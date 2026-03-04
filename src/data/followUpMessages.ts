import { LeadStage } from "@/types/crm";

export interface FollowUpMessage {
  stage: LeadStage;
  template: string | null; // null means free text (Follow-Up 1-2)
}

export const followUpMessages: FollowUpMessage[] = [
  {
    stage: "Novo",
    template: null,
  },
  {
    stage: "Em contato",
    template: null,
  },
  {
    stage: "Follow-Up 1",
    template: null, // Livre
  },
  {
    stage: "Follow-Up 2",
    template: null, // Livre
  },
  {
    stage: "Follow-Up 3",
    template:
      "Oi [nome]! Aqui é [clínica]. Só queria confirmar se você recebeu nossas mensagens anteriores. Qualquer dúvida sobre [serviço], só chamar!",
  },
  {
    stage: "Follow-Up 4",
    template:
      "[nome], temos poucos horários disponíveis essa semana para consulta. Você gostaria de garantir um horário conosco?",
  },
  {
    stage: "Follow-Up 5",
    template:
      "Oi [nome]! 🎉 Como você se interessou, consegui um desconto especial pra você na avaliação. Quer aproveitar? Manda um ✅",
  },
  {
    stage: "Follow-Up 6",
    template:
      "[nome], você sabe que implante e prótese melhoram muito a auto-estima e qualidade de vida? A gente quer te ajudar nessa transformação. Vamos conversar?",
  },
  {
    stage: "Follow-Up 7",
    template:
      "[nome], esse mês muita gente da sua região veio fazer consulta com a gente e gostou demais! Que tal você também? 😉",
  },
  {
    stage: "Follow-Up 8",
    template:
      "Oi [nome]! Agendamento não dói nem custa nada — é só pra gente conhecer melhor o seu caso. Topa uma hora essa semana?",
  },
  {
    stage: "Follow-Up 9",
    template:
      "[nome], temos promoção especial em implante/prótese/facetas esse mês. Quer saber os valores? Posso enviar um orçamento sem compromisso pra você.",
  },
  {
    stage: "Follow-Up 10",
    template:
      "[nome]! Última semana da promoção! Desconto em implante, prótese e facetas. Quer conhecer os valores? 💰",
  },
  {
    stage: "Follow-Up 11",
    template:
      "Oi [nome], esse é meu último contato sobre nossa promoção especial! Se em algum momento você quiser nos visitar, é só enviar uma mensagem. A gente adora te receber! 😊",
  },
  {
    stage: "Follow-Up 12",
    template:
      "[nome], ficou tudo bem com você? Qualquer hora que precisar de um tratamento odontológico, a gente tá aqui. Abraços! 🫂",
  },
  {
    stage: "Avaliação agendada",
    template: null,
  },
  {
    stage: "Desistência",
    template: null,
  },
  {
    stage: "Finalizado",
    template: null,
  },
];

export function getFollowUpMessage(stage: LeadStage): string | null {
  const msg = followUpMessages.find((m) => m.stage === stage);
  return msg?.template || null;
}

/**
 * Replace placeholders in follow-up message
 * [nome] → lead name
 * [serviço] → service
 * [clínica] → clinic name (OdontoCompany)
 */
export function formatFollowUpMessage(
  template: string,
  leaderName: string,
  service: string = "nossos serviços",
  clinicName: string = "OdontoCompany"
): string {
  return template
    .replace(/\[nome\]/g, leaderName)
    .replace(/\[serviço\]/g, service)
    .replace(/\[clínica\]/g, clinicName);
}
