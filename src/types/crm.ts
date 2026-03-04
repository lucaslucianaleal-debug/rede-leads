export type LeadStage =
  | "Novo"
  | "Em contato"
  | "Follow-Up 1"
  | "Follow-Up 2"
  | "Follow-Up 3"
  | "Follow-Up 4"
  | "Follow-Up 5"
  | "Follow-Up 6"
  | "Follow-Up 7"
  | "Follow-Up 8"
  | "Follow-Up 9"
  | "Follow-Up 10"
  | "Follow-Up 11"
  | "Follow-Up 12"
  | "Avaliação agendada"
  | "Desistência"
  | "Finalizado";

export type LeadStatus = "QUENTE" | "MORNO" | "FRIO" | "";

export type LeadResposta = "RESPONDEU" | "NÃO RESPONDEU" | "";

export type LeadComparecimento = "COMPARECEU" | "NÃO COMPARECEU" | "AGUARDANDO DATA" | "";

export type LeadSource =
  | "Online"
  | "Google"
  | "Sorteio Radio"
  | "Site"
  | "Indicação"
  | string;

export interface Lead {
  id: string;
  dataCriacao: string;
  dataContato: string;
  nome: string;
  telefone: string;
  servicoProcurado: string;
  captador: string;
  fonteLead: string;
  etapaLead: LeadStage;
  status: LeadStatus;
  respostaLead: LeadResposta;
  comparecimento: LeadComparecimento;
  dataFollowUp: string;
  dataAgendamento: string;
  observacao: string;
  followUpCount: number;
  lembretes: ReminderStatus;
}

export interface ReminderStatus {
  h24: boolean;
  today: boolean;
}

export interface ClinicFilter {
  etapa: LeadStage | "Todas";
  status: LeadStatus | "Todos";
  resposta: LeadResposta | "Todas";
  busca: string;
}

export interface DashboardStats {
  totalLeads: number;
  quentes: number;
  mornos: number;
  frios: number;
  agendados: number; // leads com dataAgendamento preenchida
  agendadosHoje?: number; // quantidade de leads com dataAgendamento hoje
  followUpsPendentes: number;
  compareceram: number;
  lembretesPendentes: number;
}

export const WHATSAPP_CLINIC_NUMBER = "5517991154763";
