import { LeadStage } from "@/types/crm";

export interface FollowUpMessage {
  stage: LeadStage;
  template: string | null; // null means free text or variations
  variations?: string[]; // Para Follow-Up 1-3 (sem agendamento, round-robin)
  templateWithAppointment?: string | null; // Para leads com agendamento (montar depois)
  variationsNoShow?: string[]; // Para leads que não compareceram (round-robin)
}

export const followUpMessages: FollowUpMessage[] = [
  {
    stage: "Novo",
    template: null,
    variations: [
      "Oi [nome], tudo bem? Vi que você entrou em contato conosco e adoraria te ajudar! Se preferir, pode me mandar um áudio contando o que mais te incomoda no seu sorriso hoje. Será um prazer enorme te ouvir! 😊",
      "Olá [nome]! Vi aqui que você se interessou pelos nossos tratamentos. Me conta um pouquinho: o que mais te incomoda no seu sorriso hoje? Pode ser por áudio, fica mais fácil!",
      "Oi [nome]! Vi que você entrou em contato. Antes de tudo, quero entender melhor o seu caso. O que te incomoda no sorriso hoje? Me manda um áudio quando puder! 😊"
    ],
  },
  {
    stage: "Em contato",
    template: null,
    variations: [
      "Oi [nome], tudo bem? Notei que nossa conversa deu uma paradinha... Se preferir, pode me enviar um áudio explicando o que mais te incomoda no seu sorriso hoje. Será um prazer enorme te ouvir e entender como podemos te ajudar! 😊",
      "Olá [nome], como você está? Fique à vontade para me mandar um áudio contando o que te incomoda no seu sorriso hoje; será um prazer enorme te ouvir para buscarmos a melhor solução juntos!",
      "Tudo certo, [nome]? Passando para saber se ficou alguma dúvida. Se ficar mais fácil, pode me mandar um áudio explicando o que hoje te incomoda no seu sorriso. Será um prazer enorme te ouvir e te orientar por aqui!"
    ],
    variationsNoShow: [
      "Oi [nome], tudo bem? Notei que você não conseguiu vir na sua consulta das [horário]. Aconteceu algum imprevisto? Fique à vontade para me mandar um áudio contando se está tudo bem, tá? Se quiser, podemos reagendar."
    ],
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
    variationsNoShow: [
      "Oi [nome], tudo bem? Notei que você não conseguiu vir na sua consulta das [horário]. Aconteceu algum imprevisto? Fique à vontade para me mandar um áudio contando se está tudo bem, tá? Se quiser, podemos reagendar.",
    ],
  },
  {
    stage: "Follow-Up 2",
    template: null,
    variations: [
      "Oi [nome], tudo bem? Voltei aqui na nossa conversa e vi que não terminamos... Às vezes a gente deixa o dente de lado e vai empurrando, né? Mas me conta, o que você tinha planejado fazer primeiro? Só para eu entender como te ajudar melhor por aqui.",
      "[nome], como você está? Deixei passar uns dias para não te incomodar, mas não queria que você desistisse de cuidar do sorriso. O que ficou faltando eu te explicar? Me manda um áudio aqui rapidinho quando puder."
    ],
    templateWithAppointment: null,
    variationsNoShow: [
      "[nome], passando para saber se você quer que eu reserve um horário novo para essa semana. Muita gente acaba esquecendo ou surge um compromisso de última hora, acontece! Me conta aqui o que fica melhor para você.",
    ],
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
    variationsNoShow: [
      "Oi [nome]! Senti que você estava mesmo querendo resolver aquela questão do seu sorriso... o que houve? Se for medo de dentista ou dúvida sobre o tratamento, pode me falar por áudio. Será um prazer te ouvir!",
    ],
  },
  {
    stage: "Follow-Up 4",
    template:
      "[nome], passando para avisar que a agenda do Dr(a). para [serviço] está bem concorrida essa semana. Se você quiser resolver aquele incômodo que conversamos, me avisa se prefere quarta ou quinta. Pode ser por áudio!",
    variationsNoShow: [
      "[nome], a agenda do Dr(a). para [serviço] está bem cheia, mas como você já tinha agendado antes, consigo te colocar como prioridade se você me confirmar até amanhã. O que acha? 😉",
    ],
  },
  {
    stage: "Follow-Up 5",
    template:
      "Oi [nome]! 🎉 Consegui uma condição diferente aqui com o pessoal do financeiro para a sua avaliação, já que você tinha demonstrado bastante interesse. Quer que eu te conte como ficou? Manda um ✅",
    variationsNoShow: [
      "Oi [nome]! 🎉 Vi que você ainda não conseguiu vir. Para te dar um empurrãozinho e você não adiar mais seu cuidado, consegui uma condição especial na sua avaliação. Me manda um ✅ se quiser aproveitar.",
    ],
  },
  {
    stage: "Follow-Up 6",
    template:
      "[nome], hoje atendemos um caso aqui de [serviço] e o paciente saiu tão feliz que lembrei de você. É outra qualidade de vida, né? Quando estiver com um tempinho, me conta o que ainda te gera dúvida.",
    variationsNoShow: [
      "[nome], hoje vi um resultado de [serviço] e lembrei do seu caso. É uma pena você não ter vindo, porque o resultado é transformador! Se quiser tentar de novo, estou aqui para facilitar.",
    ],
  },
  {
    stage: "Follow-Up 7",
    template:
      "[nome], muita gente da sua região veio aqui essa semana e o pessoal está comentando muito sobre como o atendimento é rápido. O que te impede de vir nos conhecer também? Me manda um áudio!",
    variationsNoShow: [
      "[nome], muita gente da sua região está vindo e saindo feliz. Não deixa o medo ou a correria te impedir de ter o sorriso que você quer. Me manda um áudio e a gente alinha um horário que não te aperte!",
    ],
  },
  {
    stage: "Follow-Up 8",
    template:
      "Oi [nome]! Só para lembrar que o primeiro passo é só uma conversa técnica, tá? Não dói nada e serve para a gente entender seu caso a fundo. Topa um horário rápido essa semana?",
    variationsNoShow: [
      "Oi [nome]! Só passando para lembrar que a avaliação é rápida e o clima aqui é super leve. Se o problema foi o horário da última vez, me avisa! Podemos ver um horário mais cedo ou mais tarde.",
    ],
  },
  {
    stage: "Follow-Up 9",
    template:
      "[nome], temos uma condição especial para implante/prótese/facetas rodando agora. Quer que eu te envie uma base de valores para você ter uma ideia? Posso te explicar tudo por áudio se preferir.",
    variationsNoShow: [
      "[nome], temos uma promoção rodando agora para quem agendar esta semana. Como você já conhece nosso atendimento, queria que você aproveitasse. Quer que eu te mande os detalhes por áudio?",
    ],
  },
  {
    stage: "Follow-Up 10",
    template:
      "[nome]! Estou fechando os pacotes especiais desse mês aqui. Como você já tinha falado comigo, não queria que você perdesse o desconto. Quer saber os valores finais? 💰",
    variationsNoShow: [
      "[nome]! Últimos horários com a condição especial. Se você ainda tiver o interesse em cuidar do sorriso, me dá um sinal de vida hoje para eu não passar sua vaga para outra pessoa. 💰",
    ],
  },
  {
    stage: "Follow-Up 11",
    template:
      "Oi [nome], esse é meu último contato sobre aquela condição que consegui para você. Se em algum momento você decidir que é a hora de cuidar do seu sorriso, meu Whats está aqui. A gente adora te receber! 😊",
    variationsNoShow: [
      "Oi [nome], esse é meu último contato. Entendo que às vezes não é o momento certo. Vou deixar seu prontuário em aberto, mas não vou mais te mandar mensagens. Se decidir voltar, é só chamar! 😊",
    ],
  },
  {
    stage: "Follow-Up 12",
    template:
      "[nome], passando só para ver se ficou tudo bem. Vou deixar seu atendimento em aberto, mas não vou mais te mandar mensagens. Quando o incômodo no sorriso apertar, é só me chamar. Abraços! 🫂",
    variationsNoShow: [
      "[nome], espero que fique tudo bem com você. Se o incômodo no sorriso apertar ou se você decidir priorizar sua saúde, sinta-se à vontade para me mandar um áudio. Abraços! 🫂",
    ],
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
 * - noShow=true (comparecimento === "NÃO COMPARECEU"): usa variationsNoShow com round-robin
 * - hasAppointment=true (tem agendamento mas não é noShow): usa templateWithAppointment
 * - hasAppointment=false: usa variations (FU 1-3) com round-robin ou template padrão
 */
export function getFollowUpMessageForLead(
  stage: LeadStage,
  followUpCount: number = 0,
  hasAppointment: boolean = false,
  noShow: boolean = false
): string | null {
  const msg = followUpMessages.find((m) => m.stage === stage);
  if (!msg) return null;

  // No-show track: round-robin in variationsNoShow
  if (noShow && msg.variationsNoShow && msg.variationsNoShow.length > 0) {
    const idx = followUpCount % msg.variationsNoShow.length;
    return msg.variationsNoShow[idx];
  }

  // Has appointment (but not no-show yet): use appointment-specific template ONLY if it's a non-null string
  if (hasAppointment && !noShow && msg.templateWithAppointment) {
    return msg.templateWithAppointment;
  }

  // Use variations (round-robin) — applies regardless of hasAppointment when no specific appointment template
  if (msg.variations && msg.variations.length > 0) {
    const idx = followUpCount % msg.variations.length;
    return msg.variations[idx];
  }

  // Fall back to standard template
  if (msg.template) return msg.template;

  // Last resort: fall back to Follow-Up 1 variations
  const fu1 = followUpMessages.find((m) => m.stage === "Follow-Up 1");
  if (fu1?.variations && fu1.variations.length > 0) {
    const idx = followUpCount % fu1.variations.length;
    return fu1.variations[idx];
  }

  return null;
}

/**
 * Get which variation index was used for a lead
 * Useful for analytics/tracking
 */
export function getVariationIndex(
  stage: LeadStage,
  followUpCount: number = 0,
  noShow: boolean = false
): number | null {
  const msg = followUpMessages.find((m) => m.stage === stage);
  if (!msg) return null;
  if (noShow && msg.variationsNoShow && msg.variationsNoShow.length > 0) {
    return followUpCount % msg.variationsNoShow.length;
  }
  if (!msg.variations || msg.variations.length === 0) return null;
  return followUpCount % msg.variations.length;
}

/**
 * Replace placeholders in follow-up message
 * [nome]    → lead name
 * [serviço] → service
 * [clínica] → clinic name (OdontoCompany)
 * [horário] → appointment time (e.g. "14:30")
 */
export function formatFollowUpMessage(
  template: string,
  leaderName: string,
  service: string = "nossos serviços",
  clinicName: string = "OdontoCompany",
  horario: string = ""
): string {
  return template
    .replace(/\[nome\]/g, leaderName)
    .replace(/\[serviço\]/g, service)
    .replace(/\[clínica\]/g, clinicName)
    .replace(/\[horário\]/g, horario || "horário marcado");
}
