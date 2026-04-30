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
      "Olá [primeiro_nome], tudo bem? \n\nPercebi que você entrou em contato conosco e gostaríamos de ajudá-lo. \n\nPoderia enviar-me um áudio explicando o que mais o incomoda no seu sorriso atualmente? \n\nSerá um prazer enorme ouvi-lo. 😊 \n\nFico no aguardo do seu retorno.",
      "Olá [primeiro_nome]! \n\nPercebi que você se interessou pelos nossos tratamentos. \n\nPoderia contar-me um pouco sobre o que mais o incomoda no seu sorriso atualmente? \n\nUm áudio é bem prático. Aguardo seu contato.",
      "Olá [primeiro_nome]! \n\nPercebi que você entrou em contato. Antes de tudo, gostaria de entender melhor o seu caso. \n\nO que o incomoda no sorriso? \n\nPoderia enviar-me um áudio quando tiver disponibilidade? Fico no aguardo."
    ],
  },
  {
    stage: "Em contato",
    template: null,
    variations: [
      "Olá [primeiro_nome], tudo bem? \n\nPercebi que nossa comunicação ficou pausada. \n\nPoderia enviar-me um áudio explicando o que mais o incomoda no seu sorriso atualmente? \n\nSerá um prazer enorme ouvi-lo e entender como podemos ajudá-lo. 😊 \n\nQuando poderia me enviar esse áudio?",
      "Olá [primeiro_nome], como você está? \n\nFique à vontade para me enviar um áudio explicando o que o incomoda no seu sorriso atualmente. \n\nSerá um prazer enorme ouvi-lo para buscarmos a melhor solução para você. \n\nPoderia responder-me hoje?",
      "Olá [primeiro_nome]. \n\nGostaria de verificar se ficou alguma dúvida. \n\nSe preferir, pode me enviar um áudio explicando o que o incomoda no seu sorriso. \n\nEstarei aqui para orientá-lo. Quando poderia entrar em contato?"
    ],
    variationsNoShow: [
      "Olá [primeiro_nome]. \n\nPercebi que você não conseguiu comparecer à sua consulta programada para as [horário]. Aconteceu algum imprevisto? \n\nTemos disponibilidade em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nQual desses horários funcionaria melhor para você?"
    ],
  },
  {
    stage: "Follow-Up 1",
    template: null,
    variations: [
      "Olá [primeiro_nome], tudo bem? \n\nPercebi que nossa comunicação ficou pausada. \n\nPoderia enviar-me um áudio explicando o que mais o incomoda no seu sorriso atualmente? \n\nSerá um prazer enorme ouvi-lo e entender como podemos ajudá-lo. 😊 \n\nQuando poderia me enviar esse áudio?",
      "Olá [primeiro_nome], como você está? \n\nPercebi que não demos continuidade no seu atendimento. \n\nFique à vontade para me enviar um áudio explicando o que o incomoda no seu sorriso atualmente. \n\nSerá um prazer enorme ouvi-lo para buscarmos a melhor solução para você. \n\nPoderia responder-me hoje?",
      "Olá [primeiro_nome]. \n\nGostaria de verificar se ficou alguma dúvida. \n\nSe preferir, pode me enviar um áudio explicando o que o incomoda no seu sorriso. \n\nEstarei aqui para orientá-lo. \n\nQuando poderia entrar em contato?"
    ],
    templateWithAppointment: null,
    variationsNoShow: [
      "Olá [primeiro_nome]. \n\nPercebi que você não conseguiu comparecer à sua consulta programada para as [horário]. Aconteceu algum imprevisto? \n\nTemos disponibilidade em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nQual desses horários funcionaria melhor para você?",
    ],
  },
  {
    stage: "Follow-Up 2",
    template: null,
    variations: [
      "Olá [primeiro_nome]. \n\nRetornei à nossa conversa e percebi que não a finalizamos adequadamente. \n\nFrequentemente adiar o tratamento dental se torna um hábito. \n\nPoderia me informar qual seria seu próximo passo? Gostaria de entender melhor como ajudá-lo. \n\nQuando podemos conversar?",
      "[primeiro_nome], como você está? \n\nAguardei alguns dias para não o incomodar, porém gostaria de ter a oportunidade de ajudá-lo com seu sorriso. \n\nO que ficou faltando esclarecer? \n\nPoderia enviar-me um áudio quando tiver disponibilidade? Fico no aguardo."
    ],
    templateWithAppointment: null,
    variationsNoShow: [
      "[primeiro_nome], gostaria de saber se você gostaria que eu reservasse um novo horário para essa semana. \n\nTemos disponibilidade em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nQual desses dias funcionaria melhor para você?",
    ],
  },
  {
    stage: "Follow-Up 3",
    template: null,
    variations: [
      "Olá [primeiro_nome]. \n\nComo estão as coisas? Compreendo que a rotina muitas vezes nos afasta da prioridade de cuidar do sorriso. \n\nAquele incômodo que você mencionou no seu sorriso continua o incomodando? \n\nSe desejar, poderia me enviar um áudio? Estou disponível para ajudá-lo.",
      "[primeiro_nome]. \n\nGostaria de reforçar que continuo disponível. \n\nSe o horário ou a logística são obstáculos, podemos explorar alternativas. Podemos encontrar um horário que se adeque melhor à sua rotina. \n\nQual seria sua preferência? Poderia me enviar um áudio com sua sugestão hoje?"
    ],
    templateWithAppointment: null,
    variationsNoShow: [
      "Olá [primeiro_nome]! \n\nPercebo que havia interesse genuíno em resolver a questão do seu sorriso. O que aconteceu? \n\nTemos horários disponíveis em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nQual funcionaria melhor para você?",
    ],
  },
  {
    stage: "Follow-Up 4",
    template:
      "[primeiro_nome], gostaria de informar que a agenda do Dr(a). para [serviço] está bem concorrida essa semana. \n\nSe você deseja resolver aquele incômodo que mencionamos, poderia me informar sua preferência entre [data_sugerida_1] ou [data_sugerida_2]? \n\nPoderia ser por áudio. Aguardo seu retorno.",
    variationsNoShow: [
      "[primeiro_nome], a agenda do Dr(a). para [serviço] está bem preenchida, mas como você já tinha uma consulta agendada, posso priorizar seu atendimento. \n\nTemos disponibilidade em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nPoderia me confirmar qual melhor funcionaria para você? Fico no aguardo.",
    ],
  },
  {
    stage: "Follow-Up 5",
    template:
      "Olá [primeiro_nome]! 🎉 \n\nConsegui uma condição diferenciada com o pessoal do financeiro para sua avaliação, considerando seu interesse demonstrado. \n\nGostaria que você soubesse como ficou. \n\nTemos horários disponíveis em [data_sugerida_1] ou [data_sugerida_2]. Poderia me informar sua preferência? Fico no aguardo.",
    variationsNoShow: [
      "Olá [primeiro_nome]! 🎉 \n\nPercebi que você ainda não conseguiu agendar. Para incentivá-lo a priorizar seu cuidado, consegui uma condição especial para sua avaliação. \n\nTemos disponibilidade em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nQual funcionaria melhor para você? Poderia me confirmar hoje?",
    ],
  },
  {
    stage: "Follow-Up 6",
    template:
      "[primeiro_nome], atendemos um caso de [serviço] e o paciente saiu muito satisfeito. Isso me lembrou do seu caso. \n\nÉ outra qualidade de vida, verdade? \n\nTemos disponibilidade em [data_sugerida_1] ou [data_sugerida_2]. Qual dia funciona melhor para você agendar sua avaliação?",
    variationsNoShow: [
      "[primeiro_nome], vi um resultado de [serviço] e seu caso veio à minha mente. \n\nÉ uma pena que você não tenha comparecido, pois os resultados são transformadores! \n\nTemos horários em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nGostaria de tentar novamente? Poderia me confirmar?",
    ],
  },
  {
    stage: "Follow-Up 7",
    template:
      "[primeiro_nome], muitas pessoas da sua região visitaram-nos essa semana e estão muito satisfeitas com nosso atendimento. \n\nO que o impede de vir nos conhecer também? \n\nTemos disponibilidade em [data_sugerida_1] ou [data_sugerida_2]. Qual dia funciona melhor para você? Fico no aguardo.",
    variationsNoShow: [
      "[primeiro_nome], muitas pessoas da sua região estão vindo e saindo satisfeitas. \n\nNão deixe o medo ou a rotina o impedir de ter o sorriso que você deseja. \n\nTemos horários em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nPoderia me informar qual horário funciona melhor para você?",
    ],
  },
  {
    stage: "Follow-Up 8",
    template:
      "Olá [primeiro_nome]! \n\nApenas para reforçar: a avaliação inicial é simples e sem desconforto. Nos permite compreender seu caso em detalhes. \n\nTeria disponibilidade para um horário breve essa semana? Temos datas em [data_sugerida_1] ou [data_sugerida_2].",
    variationsNoShow: [
      "Olá [primeiro_nome]! \n\nApenas para lembrá-lo: a avaliação é rápida e o ambiente é acolhedor. \n\nTemos disponibilidade em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nQual horário funciona melhor para você? Poderia me confirmar?",
    ],
  },
  {
    stage: "Follow-Up 9",
    template:
      "[primeiro_nome], temos uma condição especial para implante/prótese/facetas em vigor atualmente. \n\nGostaria que você recebesse uma tabela de valores para ter uma ideia de investimento? \n\nTemos horários disponíveis em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. Qual funciona melhor para você?",
    variationsNoShow: [
      "[primeiro_nome], temos uma promoção disponível para quem agendar essa semana. \n\nComo você já conhece nosso atendimento, gostaria que aproveitasse essa oportunidade. \n\nDisponibilidade em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nQual funciona para você? Fico no aguardo.",
    ],
  },
  {
    stage: "Follow-Up 10",
    template:
      "[primeiro_nome]! \n\nEstou finalizando os pacotes especiais desse mês. Como você já havia demonstrado interesse, não gostaria que perdesse essa oportunidade. \n\nDisponibilidade em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nQual prefere? Fico no aguardo. 💰",
    variationsNoShow: [
      "[primeiro_nome]! \n\nÚltimos horários disponíveis com a condição especial. \n\nTemos datas em [data_sugerida_1] às [hora_sugerida_1] ou [data_sugerida_2] às [hora_sugerida_2]. \n\nSe ainda tem interesse em cuidar do seu sorriso, poderia me confirmar hoje? 💰",
    ],
  },
  {
    stage: "Follow-Up 11",
    template:
      "Olá [primeiro_nome], este é meu último contato sobre a condição que consegui para você. \n\nSe em algum momento decidir que é hora de cuidar do seu sorriso, continuarei disponível. \n\nTeremos prazer em recebê-lo! 😊 \n\nFique livre para me contactar quando precisar.",
    variationsNoShow: [
      "Olá [primeiro_nome], este é meu último contato. \n\nCompreendo que nem sempre é o momento ideal. Deixarei seu prontuário ativo, porém não estarei enviando mais mensagens. \n\nSe decidir retomar, estarei aqui para ajudá-lo. 😊 \n\nEntre em contato quando estiver pronto!",
    ],
  },
  {
    stage: "Follow-Up 12",
    template:
      "[primeiro_nome], desejo que tudo esteja bem com você. \n\nEstarei deixando seu atendimento em aberto, mas não enviarei mais comunicações. \n\nSe o incômodo no sorriso se tornar mais urgente, poderei ajudá-lo. \n\nAbraços! 🫂 Fico no aguardo.",
    variationsNoShow: [
      "[primeiro_nome], espero que tudo esteja bem com você. \n\nSe o incômodo no sorriso se intensificar ou se decidir priorizar sua saúde bucal, estarei à sua disposição. \n\nPoderia entrar em contato quando precisar? \n\nAbraços! 🫂",
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
  horario: string = "",
  dataSugerida1: string = "",
  dataSugerida2: string = "",
  horaSugerida1: string = "",
  horaSugerida2: string = ""
): string {
  const primeiroNome = leaderName.split(" ")[0]; // Extract first name
  return template
    .replace(/\[nome\]/g, leaderName)
    .replace(/\[primeiro_nome\]/g, primeiroNome)
    .replace(/\[serviço\]/g, service)
    .replace(/\[clínica\]/g, clinicName)
    .replace(/\[horário\]/g, horario || "horário marcado")
    .replace(/\[data_sugerida_1\]/g, dataSugerida1 || "segunda-feira")
    .replace(/\[data_sugerida_2\]/g, dataSugerida2 || "quarta-feira")
    .replace(/\[hora_sugerida_1\]/g, horaSugerida1 || "14:00")
    .replace(/\[hora_sugerida_2\]/g, horaSugerida2 || "16:00");
}
