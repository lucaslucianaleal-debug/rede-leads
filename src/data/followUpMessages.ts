import { LeadStage } from "@/types/crm";

export interface FollowUpMessage {
  stage: LeadStage;
  template: string | null; // null means free text or variations
  variations?: string[]; // Para Follow-Up 1, 2, 3 (sem agendamento)
  templateWithAppointment?: string | null; // Para leads com agendamento (montar depois)
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
    template: null,
    variations: [
      "Oi [nome], tudo bem? Notei que nossa conversa deu uma paradinha... Se preferir, pode me enviar um áudio explicando o que mais te incomoda no seu sorriso hoje. Será um prazer enorme te ouvir e entender como podemos te ajudar! 😊",
      "Olá [nome], como você está? Vi que não demos continuidade no seu atendimento. Fique à vontade para me mandar um áudio contando o que te incomoda no seu sorriso hoje; será um prazer enorme te ouvir para buscarmos a melhor solução juntos!",
      "Tudo certo, [nome]? Passando para saber se ficou alguma dúvida. Se ficar mais fácil, pode me mandar um áudio explicando o que hoje te incomoda no seu sorriso. Será um prazer enorme te ouvir e te orientar por aqui! "
    ],
    templateWithAppointment: null,
  },
  {
    stage: "Follow-Up 2",
    template: null,
    variations: [
      "Oi [nome], tudo bem? Voltei aqui na nossa conversa e vi que não terminamos... Às vezes a gente deixa o dente de lado e vai empurrando, né? Mas me conta, o que você tinha planejado fazer primeiro? Só para eu entender como te ajudar melhor por aqui.",
      "[nome], como você está? Deixei passar uns dias para não te incomodar, mas não queria que você desistisse de cuidar do sorriso. O que ficou faltando eu te explicar? Me manda um áudio aqui rapidinho quando puder."
    ],
    templateWithAppointment: null,
  },
  {
    stage: "Follow-Up 3",
    template:
      "Olá [nome], como vão as coisas? Sei que a vida é uma correria e dente a gente acaba deixando por último, né? Mas me conta: aquele incômodo que você comentou no sorriso ainda está te chateando no dia a dia? Se quiser desabafar um pouco mais por áudio, estou aqui para te ouvir e ver como facilitar para você.",
    variations: [
      "Olá [nome], como vão as coisas? Sei que a vida é uma correria e dente a gente acaba deixando por último, né? Mas me conta: aquele incômodo que você comentou no sorriso ainda está te chateando no dia a dia? Se quiser desabafar um pouco mais por áudio, estou aqui para te ouvir e ver como facilitar para você.",
      "[nome], tudo certo? Passando só para dizer que continuo por aqui. Se o que te impede de vir é o horário ou a logística, me dá um grito! Podemos tentar um horário mais flexível que não atrapalhe seu trabalho. O que acha? Me manda um áudio com sua sugestão!"
    ],
    templateWithAppointment: null,
  },
  {
    stage: "Follow-Up 4",
    template:
      "[nome], passando para avisar que a agenda do Dr(a). para [serviço] está bem concorrida essa semana. Se você quiser resolver aquele incômodo que conversamos, me avisa se prefere quarta ou quinta. Pode ser por áudio!",
  },
  {
    stage: "Follow-Up 5",
    template:
      "Oi [nome]! 🎉 Consegui uma condição diferente aqui com o pessoal do financeiro para a sua avaliação, já que você tinha demonstrado bastante interesse. Quer que eu te conte como ficou? Manda um ✅",
  },
  {
    stage: "Follow-Up 6",
    template:
      "[nome], hoje atendemos um caso aqui de [serviço] e o paciente saiu tão feliz que lembrei de você. É outra qualidade de vida, né? Quando estiver com um tempinho, me conta o que ainda te gera dúvida.",
  },
  {
    stage: "Follow-Up 7",
    template:
      "[nome], muita gente da sua região veio aqui essa semana e o pessoal está comentando muito sobre como o atendimento é rápido. O que te impede de vir nos conhecer também? Me manda um áudio!",
  },
  {
    stage: "Follow-Up 8",
    template:
      "Oi [nome]! Só para lembrar que o primeiro passo é só uma conversa técnica, tá? Não dói nada e serve para a gente entender seu caso a fundo. Topa um horário rápido essa semana?",
  },
  {
    stage: "Follow-Up 9",
    template:
      "[nome], temos uma condição especial para implante/prótese/facetas rodando agora. Quer que eu te envie uma base de valores para você ter uma ideia? Posso te explicar tudo por áudio se preferir.",
  },
  {
    stage: "Follow-Up 10",
    template:
      "[nome]! Estou fechando os pacotes especiais desse mês aqui. Como você já tinha falado comigo, não queria que você perdesse o desconto. Quer saber os valores finais? 💰",
  },
  {
    stage: "Follow-Up 11",
    template:
      "Oi [nome], esse é meu último contato sobre aquela condição que consegui para você. Se em algum momento você decidir que é a hora de cuidar do seu sorriso, meu Whats está aqui. A gente adora te receber! 😊",
  },
  {
    stage: "Follow-Up 12",
    template:
      "[nome], passando só para ver se ficou tudo bem. Vou deixar seu atendimento em aberto, mas não vou mais te mandar mensagens. Quando o incômodo no sorriso apertar, é só me chamar. Abraços! 🫂",
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
 * Get follow-up message for a lead:
 * - If lead has appointments (dataAgendamentoCriado or dataAgendamentoAlterado),
 *   use templateWithAppointment (if available)
 * - If lead has no appointments AND stage has variations (FU 1-3),
 *   use round-robin variation based on followUpCount
 * - Otherwise use standard template
 */
export function getFollowUpMessageForLead(
  stage: LeadStage,
  followUpCount: number = 0,
  hasAppointment: boolean = false
): string | null {
  const msg = followUpMessages.find((m) => m.stage === stage);
  if (!msg) return null;

  // If lead has appointment, try to use appointment-specific template
  if (hasAppointment && msg.templateWithAppointment !== undefined) {
    return msg.templateWithAppointment;
  }

  // If lead has no appointment and there are variations, use round-robin
  if (!hasAppointment && msg.variations && msg.variations.length > 0) {
    const variationIndex = followUpCount % msg.variations.length;
    return msg.variations[variationIndex];
  }

  // Fall back to standard template
  return msg.template || null;
}

/**
 * Get which variation index was used for a lead
 * Useful for analytics/tracking
 */
export function getVariationIndex(
  stage: LeadStage,
  followUpCount: number = 0
): number | null {
  const msg = followUpMessages.find((m) => m.stage === stage);
  if (!msg || !msg.variations || msg.variations.length === 0) return null;
  return followUpCount % msg.variations.length;
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
