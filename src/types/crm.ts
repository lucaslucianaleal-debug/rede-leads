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
  | "Fora da região"
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
  // Data em que o último follow-up foi efetuado (registro de execução)
  lastFollowUpDone?: string;
  // Índice da variação usada no último follow-up (para FU 1-3 com múltiplas opções)
  lastFollowUpVariation?: number;
  // Data em que o agendamento foi CRIADO/registrado no sistema (dd/MM/yyyy)
  dataAgendamentoCriado?: string;
  // Data em que o agendamento foi ALTERADO (reagendamento) pela última vez
  dataAgendamentoAlterado?: string;
  dataAgendamento: string;
  // Histórico de todos os agendamentos anteriores (reagendamentos)
  historicoAgendamentos?: { data: string; registradoEm: string; motivo?: string }[];
  dataRetornoLigacao: string;
  observacao: string;
  // Briefing específico para recepção, exibido na Agenda do Dia
  briefingRecepcao?: string;
  followUpCount: number;
  lembretes: ReminderStatus;
  // Coordenadas do cliente para navegação e rastreamento
  coordenadas?: { lat?: number; lng?: number };
  // Campanha Meta Ads de origem
  metaCampanhaId?: string;
  metaCampanhaNome?: string;
  // Soft-delete fields
  _deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
}

export interface ReminderStatus {
  h24: boolean;
  today: boolean;
  disabled?: boolean;
  sent?: {
    "24h": string | null;
    "12h": string | null;
    "3h": string | null;
    "1h": string | null;
  };
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
  reagendamentosHoje?: number; // quantidade de reagendamentos registrados hoje
  followUpsPendentes: number;
  followUpsOverdue?: number;
  compareceram: number;
  lembretesPendentes: number;
}

export const WHATSAPP_CLINIC_NUMBER = "5517991154763";
