import { useState, useMemo } from "react";
import { Lead, LeadStage } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Play,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Phone,
  ExternalLink,
  Check,
  X,
  Search,
  CalendarCheck,
  MessageSquare,
  Info,
  TrendingUp,
  UserCheck,
  Globe,
  Gift,
  HelpCircle,
} from "lucide-react";
import { FollowUpDialog } from "./FollowUpDialog";
import { WhatsAppMessageDialog } from "./WhatsAppMessageDialog";
import { CallLogDialog } from "./CallLogDialog";
import { LeadDetailsDialog } from "./LeadDetailsDialog";
import { EditLeadDialog } from "./EditLeadDialog";
import { followUpMessages, getFollowUpMessageForLead, formatFollowUpMessage } from "@/data/followUpMessages";
import { useAuth } from "@/hooks/useAuth";
import { getAvailableSlots } from "@/lib/scheduleHelper";
import { generateAppointmentConfirmationTextForClinic, generateFollowUpWhatsAppLink } from "@/lib/whatsapp";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Scripts específicos para leads da Promotora
// Eles JÁ foram abordados pessoalmente — NÃO pedir áudio, focar em confirmar/agendar
// ---------------------------------------------------------------------------
const PROMOTORA_SCRIPTS: Partial<Record<LeadStage, string[]>> = {
  "Novo": [
    "Oi, [primeiro_nome]! 😊\nGostei muito de falar com você hoje!\nComo combinamos, separei alguns horários pra sua avaliação de [serviço].\n\nTenho [data_sugerida_1] ou [data_sugerida_2] — qual fica melhor?",
    "Opa, [primeiro_nome]!\nAchei legal demais nosso papo de hoje.\nSeguindo o que conversamos, tenho [data_sugerida_1] e [data_sugerida_2] pra sua avaliação.\n\nQual fica mais tranquilo pra você?",
    "[primeiro_nome], tudo certo?\nMuito bacana conversar com você hoje. Separei os horários que mencionei:\n[data_sugerida_1] ou [data_sugerida_2].\n\nQual te interessa?",
  ],
  "Em contato": [
    "Oi, [primeiro_nome]! 😊\nPassei aqui porque lembrei de você e da sua avaliação de [serviço].\n\nAinda tenho alguns horários livres — [data_sugerida_1] e [data_sugerida_2].\nQuer garantir algum deles?",
    "[primeiro_nome], e aí? Tudo bem?\nSeparei os horários que a gente conversou.\n[data_sugerida_1] ou [data_sugerida_2] — qual é?",
    "E aí, [primeiro_nome]! 😊\nFiquei te devendo esse retorno sobre os horários.\nConsegui encaixar você em [data_sugerida_1] — faz sentido pra você?",
  ],
  "Follow-Up 1": [
    "[primeiro_nome], tudo bem? 😊\nTentei te chamar mais cedo sobre sua avaliação.\n\nAinda consigo te encaixar em [data_sugerida_1] ou [data_sugerida_2].\nO que acha?",
    "Opa, [primeiro_nome]!\nSobre aquele horário que a gente conversou — consigo ainda sim encaixar você.\n[data_sugerida_1] funciona?",
    "[primeiro_nome], só confirmando:\nLembrei do que você comentou. Tenho [data_sugerida_1] ou, se preferir, [data_sugerida_2].\nQual é melhor?",
  ],
  "Follow-Up 2": [
    "[primeiro_nome], e aí?\nFiquei pensando no que você comentou quando passou aqui com a gente…\n\nSeparei um horário em [data_sugerida_1].\nSe fizer sentido pra você, me fala que já deixo reservado 😊",
    "[primeiro_nome]!\nTô com um horário bem legal em [data_sugerida_1].\nQuer que eu reserve pra você?",
    "Opa, [primeiro_nome]!\nNão quer deixar passar essa chance de cuidar do seu sorriso, né?\nTenho espaço em [data_sugerida_1] — bora confirmar?",
  ],
  "Follow-Up 3": [
    "[primeiro_nome], você tem 2 min? 😊\nTô com só um horário ainda livre pra sua avaliação: [data_sugerida_1].\n\nSe não puder, consigo mudar pra [data_sugerida_2] — mas não deixa passar muito tempo, tá?",
    "[primeiro_nome]!\nÚltima chance de garantir o horário antes que feche a agenda.\n[data_sugerida_1] — posso reservar?",
    "Opa, [primeiro_nome] — só pra não perder de vista:\nTenho espaço em [data_sugerida_1] (ou [data_sugerida_2] se preferir).\nBora garantir enquanto tem?",
  ],
};

// ---------------------------------------------------------------------------
// Scripts específicos para leads de Indicação
// Lead recebeu indicação de paciente — NÃO pedir áudio, oferecer clareamento (2 sessões) como benefício
// ---------------------------------------------------------------------------
const INDICACAO_SCRIPTS: Partial<Record<LeadStage, string[]>> = {
  "Novo": [
    "Bom dia, [primeiro_nome]! Como você está?\n\nAinda consigo te colocar na campanha das 2 sessões de clareamento como benefício da clínica sem custo para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso agendar para você?",
    "Boa tarde, [primeiro_nome]! Tudo bem?\n\nPassei aqui vendo a campanha de indicação das 2 sessões de clareamento.\nAinda dá pra te incluir para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso confirmar?",
    "[primeiro_nome], como você está?\n\nAinda consigo colocar você na campanha das 2 sessões de clareamento como benefício sem custo para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso agendar aí?",
  ],
  "Em contato": [
    "Bom dia, [primeiro_nome]! Como você está?\n\nAinda consigo te colocar na campanha das 2 sessões de clareamento como benefício da clínica sem custo para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso agendar para você?",
    "Boa tarde, [primeiro_nome]! Tudo bem?\n\nTô aqui vendo a campanha de indicação das 2 sessões de clareamento.\nAinda dá pra te incluir para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso confirmar?",
    "[primeiro_nome], como você está?\n\nAinda consigo colocar você na campanha das 2 sessões de clareamento como benefício sem custo para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso agendar aí?",
  ],
  "Follow-Up 1": [
    "Boa tarde, [primeiro_nome]! Tudo bem?\n\nAinda consigo te colocar na campanha das 2 sessões de clareamento (benefício da clínica sem custo) para [data_sugerida_1] às [hora_sugerida_1], mas a agenda está apertando.\n\nPosso agendar para você?",
    "[primeiro_nome], como você está?\n\nAinda tenho vaga pra você na campanha das 2 sessões de clareamento para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso agendar ou você prefere outro dia?",
  ],
  "Follow-Up 2": [
    "Bom dia, [primeiro_nome]! Tudo bem?\n\nAinda dá tempo de você fazer as 2 sessões de clareamento (benefício sem custo) para [data_sugerida_1] às [hora_sugerida_1], mas preciso saber se funciona.\n\nPosso agendar?",
    "[primeiro_nome], como você está?\n\nTenho espaço pra você na campanha das 2 sessões de clareamento para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso agendar você?",
  ],
  "Follow-Up 3": [
    "Bom dia, [primeiro_nome]! Tudo bem?\n\nPreciso liberar essa vaga amanhã.\n\nPosso agendar você para a campanha das 2 sessões de clareamento (benefício sem custo) para [data_sugerida_1] às [hora_sugerida_1]?",
    "[primeiro_nome], como você está?\n\nFiquei pensando aqui — consigo te colocar na campanha das 2 sessões de clareamento como benefício.\nPreciso confirmar se funciona para [data_sugerida_1] às [hora_sugerida_1].",
  ],
  "Follow-Up 4": [
    "Oi, [primeiro_nome], tudo bem?\n\nSei que a rotina é corrida, mas não quis sumir sem dar um retorno.\nAinda tenho uma vaga guardada pra você na campanha das 2 sessões de clareamento (sem custo), para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso confirmar?",
    "[primeiro_nome], como você está?\n\nQuis dar uma última chance antes de liberar a vaga.\nConsigo te colocar na campanha das 2 sessões de clareamento (benefício sem custo) para [data_sugerida_1] às [hora_sugerida_1].\n\nFaz sentido?",
  ],
  "Follow-Up 5": [
    "Oi, [primeiro_nome]! Tudo bem?\n\nAinda consigo te colocar na campanha das 2 sessões de clareamento, mas as vagas estão terminando.\n\nTenho para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso agendar?",
    "[primeiro_nome], como você está?\n\nAinda tenho uma vaga pra você na campanha das 2 sessões de clareamento (sem custo), mas tá acabando.\n\nTenho para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso agendar você?",
    "Bom dia, [primeiro_nome]! Tudo bem?\n\nAinda dá tempo de você fazer as 2 sessões de clareamento como benefício sem custo, mas as vagas estão terminando.\n\nTenho para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso confirmar?",
  ],
};

// ---------------------------------------------------------------------------
// Configuração completa do funil — inclui Novo, Em contato e Avaliação agendada
// ---------------------------------------------------------------------------
interface ReguaEntry {
  stage: LeadStage;
  label: string;
  cadencia: string;
  tipo: string;
  color: "green" | "teal" | "blue" | "amber" | "orange" | "rose" | "gray" | "purple";
  desc: string;
  descPromo?: string;     // descrição alternativa para leads da promotora
  descIndicacao?: string; // descrição alternativa para leads de indicação
}

const REGUA_CONFIG: ReguaEntry[] = [
  { stage: "Novo",          label: "NOVO",  cadencia: "Imediato",    tipo: "1º Contato",       color: "green",  desc: "Lead acabou de entrar — primeiro toque, perguntar sobre incômodo via áudio",        descPromo: "Lead abordado pela promotora — confirmar agendamento ou propor data" },
  { stage: "Em contato",    label: "EC",    cadencia: "+1 dia",      tipo: "Nutrição",          color: "teal",   desc: "Já respondeu mas não agendou — manter conversa e colher informações",               descPromo: "Ainda não agendou — oferecer data concreta e fechar horário",            descIndicacao: "Oferecer data para as 2 sessões de clareamento (benefício da clínica)" },
  { stage: "Follow-Up 1",   label: "D1",    cadencia: "Mesmo dia",   tipo: "Primeiro Follow-Up",color: "blue",   desc: "Abordagem inicial suave — perguntar sobre dor/incômodo via áudio",                 descPromo: "Não agendou ainda — oferecer data direta, sem pedir áudio",              descIndicacao: "Ainda tenho vaga — agenda apertando" },
  { stage: "Follow-Up 2",   label: "D2",    cadencia: "+1 dia",      tipo: "Primeiro Contato",  color: "blue",   desc: "Reengajar sem pressão — perguntar qual é o próximo passo",                         descPromo: "Insistir com data alternativa — tom leve",                               descIndicacao: "Campanha de indicação — tenho espaço para o dia X" },
  { stage: "Follow-Up 3",   label: "D3",    cadencia: "+1 dia",      tipo: "Primeiro Contato",  color: "blue",   desc: "Empatia com a rotina — reforçar disponibilidade",                                  descPromo: "Flexibilizar horário — manhã ou tarde",                                  descIndicacao: "Vaga prestes a ser liberada — confirmar interesse" },
  { stage: "Follow-Up 4",   label: "D4",    cadencia: "+1 dia",      tipo: "Urgência",          color: "amber",  desc: "Criar urgência — agenda concorrida, limitar vagas percebidas",                                                                                                             descIndicacao: "Vaga prestes a ser liberada — última tentativa" },
  { stage: "Follow-Up 5",   label: "D5",    cadencia: "+2 dias",     tipo: "Oferta",            color: "amber",  desc: "Condição diferenciada / oferta especial do financeiro",                                                                                                                    descIndicacao: "Última chance — vagas da campanha terminando" },
  { stage: "Follow-Up 6",   label: "D6",    cadencia: "+2 dias",     tipo: "Prova Social",      color: "orange", desc: "Case de sucesso de paciente similar ao lead" },
  { stage: "Follow-Up 7",   label: "D7",    cadencia: "+2 dias",     tipo: "Prova Social",      color: "orange", desc: "Pacientes da região satisfeitos — gerar FOMO" },
  { stage: "Follow-Up 8",   label: "D8",    cadencia: "+2 dias",     tipo: "Reengajamento",     color: "rose",   desc: "Reposicionar — avaliação rápida e sem desconforto" },
  { stage: "Follow-Up 9",   label: "D9",    cadencia: "+2 dias",     tipo: "Reengajamento",     color: "rose",   desc: "Tabela de valores + condição especial vigente" },
  { stage: "Follow-Up 10",  label: "D10",   cadencia: "+2 dias",     tipo: "Reengajamento",     color: "rose",   desc: "Urgência final — pacotes especiais do mês encerrando" },
  { stage: "Follow-Up 11",  label: "D11",   cadencia: "+2 dias",     tipo: "Encerramento",      color: "gray",   desc: "Último contato ativo — canal aberto sem pressão" },
  { stage: "Follow-Up 12",  label: "D12",   cadencia: "+2 dias",     tipo: "Encerramento",      color: "gray",   desc: "Mensagem final — manter relacionamento latente" },
  { stage: "Avaliação agendada", label: "AGEND", cadencia: "Antes da consulta", tipo: "Confirmação", color: "purple", desc: "Confirmar presença — enviar informações da clínica e horário" },
];

const COLOR_BADGE: Record<string, string> = {
  green:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  teal:   "bg-teal-100 text-teal-700 border-teal-200",
  blue:   "bg-blue-100 text-blue-700 border-blue-200",
  amber:  "bg-amber-100 text-amber-700 border-amber-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  rose:   "bg-rose-100 text-rose-700 border-rose-200",
  gray:   "bg-slate-100 text-slate-600 border-slate-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
};

const COLOR_ROW: Record<string, string> = {
  green:  "border-emerald-200/60",
  teal:   "border-teal-200/60",
  blue:   "border-blue-200/60",
  amber:  "border-amber-200/60",
  orange: "border-orange-200/60",
  rose:   "border-rose-200/60",
  gray:   "border-slate-200/40",
  purple: "border-purple-200/60",
};

// ---------------------------------------------------------------------------

const getDaysSince = (dateString: string): number => {
  if (!dateString) return 0;
  const [day, month, year] = dateString.split("/");
  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
};

const todayStr = () => {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear()}`;
};

// Calcula o valor automático do cupom baseado no tempo que o lead está "parado"
const getCupomAmount = (lead: Lead): number => {
  const allowedServices = ["implante", "implantes", "faceta", "facetas", "protocolo", "protocolos", "prótese", "próteses", "protese", "proteses"];
  const servico = (lead.servicoProcurado || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const isAllowed = allowedServices.some(s => {
    const sNorm = s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    return servico.includes(sNorm);
  });
  
  if (!isAllowed) return 0;
  
  const days = getDaysSince(lead.lastFollowUpDone || lead.dataFollowUp);
  if (days >= 90) return 500;
  if (days >= 60) return 300;
  if (days >= 30) return 200;
  return 0;
};

// ---------------------------------------------------------------------------

interface FollowUpRulerProps {
  leads: Lead[];
  allLeads?: Lead[];
  onSendFollowUp: (leadId: string, observacao?: string, etapa?: LeadStage) => void;
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string, nextStage?: LeadStage) => void;
  onDeleteLead?: (leadId: string) => void;
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
}

type InnerTab    = "rotina" | "regua" | "metricas";
type RotinaView  = "vencidos" | "hoje" | "todos";
type FonteFilter = "todos" | "organico" | "promotora" | "indicacao";

const isPromotor  = (lead: Lead) =>
  (lead.fonteLead || "").toLowerCase().trim() === "promotora";

const isIndicacao = (lead: Lead) => {
  const f = (lead.fonteLead || "").toLowerCase().trim();
  return f === "indicação" || f === "indicacao";
};

// ---------------------------------------------------------------------------

export function FollowUpRuler({
  leads,
  allLeads,
  onSendFollowUp,
  onRegisterCall,
  onDeleteLead,
  onUpdateLead,
}: FollowUpRulerProps) {
  const [innerTab, setInnerTab] = useState<InnerTab>("rotina");
  const [selectedStage, setSelectedStage] = useState<string>("Novo");
  const [rotinaView, setRotinaView] = useState<RotinaView>("vencidos");
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fonteFilter, setFonteFilter] = useState<FonteFilter>("todos");

  // dialogs
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [callLead, setCallLead]         = useState<Lead | null>(null);
  const [whatsLead, setWhatsLead]       = useState<Lead | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [suggestedMsg, setSuggestedMsg] = useState<string>("");
  const [detailLead, setDetailLead]     = useState<Lead | null>(null);
  const [editingLead, setEditingLead]   = useState<Lead | null>(null);

  // edição de scripts na cadência
  const [editingStage, setEditingStage]   = useState<string | null>(null);
  const [editingScript, setEditingScript] = useState<string>("");

  // modo campanha (envio em lote)
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [showCampaignTypeModal, setShowCampaignTypeModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignCurrentIndex, setCampaignCurrentIndex] = useState(0);
  const [campaignOfferType, setCampaignOfferType] = useState<"clareamento" | "cupom">("clareamento");

  const { clinicMeta, currentClinic } = useAuth();
  const today = todayStr();
  const base = allLeads || leads;
  const active = base.filter(l => !(l as any)._deleted);

  // ── filtragem por fonte ───────────────────────────────────────────────────
  const activeFiltered = useMemo(() => {
    if (fonteFilter === "promotora")  return active.filter(isPromotor);
    if (fonteFilter === "indicacao")  return active.filter(isIndicacao);
    if (fonteFilter === "organico")   return active.filter(l => !isPromotor(l) && !isIndicacao(l));
    return active;
  }, [active, fonteFilter]);

  // ── counts per stage (respeitando filtro de fonte) ────────────────────────
  const stageCount = useMemo<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    REGUA_CONFIG.forEach(r => { c[r.stage] = 0; });
    activeFiltered
      .filter(l => !["Finalizado", "Desistência", "Fora da região"].includes(l.etapaLead))
      .forEach(l => { if (c[l.etapaLead] !== undefined) c[l.etapaLead]++; });
    return c;
  }, [activeFiltered]);

  const totalEmFU = Object.values(stageCount).reduce((s, n) => s + n, 0);

  // ── metrics ───────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    return REGUA_CONFIG.map(r => {
      const num = parseInt(r.stage.replace("Follow-Up ", ""), 10);
      const pool = isNaN(num) ? activeFiltered : activeFiltered.filter(l => (l.followUpCount || 0) >= num);
      const total     = pool.length;
      const converted  = pool.filter(l =>
        l.etapaLead === "Finalizado" ||
        l.etapaLead === "Avaliação agendada" ||
        !!l.dataAgendamentoCriado
      ).length;
      const dropped    = pool.filter(l => l.etapaLead === "Desistência").length;
      const responded  = pool.filter(l => l.respostaLead === "RESPONDEU").length;
      const showed     = pool.filter(l => l.comparecimento === "COMPARECEU").length;
      const noShowed   = pool.filter(l => l.comparecimento === "NÃO COMPARECEU").length;
      const hadAppt    = pool.filter(l => !!l.dataAgendamentoCriado || !!l.dataAgendamentoAlterado).length;
      return {
        ...r,
        active:      stageCount[r.stage] || 0,
        total,
        convRate:    total > 0    ? Math.round((converted / total) * 100)   : 0,
        dropRate:    total > 0    ? Math.round((dropped   / total) * 100)   : 0,
        respondRate: total > 0    ? Math.round((responded / total) * 100)   : 0,
        showRate:    hadAppt > 0  ? Math.round((showed    / hadAppt) * 100) : null,
        noShowRate:  hadAppt > 0  ? Math.round((noShowed  / hadAppt) * 100) : null,
        showed, noShowed, hadAppt,
      };
    });
  }, [activeFiltered, stageCount]);

  // ── leads for rotina diária ───────────────────────────────────────────────
  const stageLeads = useMemo<Lead[]>(() => {
    let list = activeFiltered.filter(l => l.etapaLead === selectedStage);

    if (search.trim()) {
      const t = search.trim().toLowerCase();
      list = list.filter(l => l.nome.toLowerCase().includes(t) || l.telefone.includes(t));
    }

    if (rotinaView === "vencidos") {
      list = list.filter(l => (getDaysSince(l.dataFollowUp) >= 1 || !l.dataFollowUp) && l.lastFollowUpDone !== today);
    } else if (rotinaView === "hoje") {
      list = list.filter(l => l.dataFollowUp === today || l.lastFollowUpDone === today);
    }

    return list.sort((a, b) => {
      const da = getDaysSince(a.lastFollowUpDone || a.dataFollowUp);
      const db = getDaysSince(b.lastFollowUpDone || b.dataFollowUp);
      return db - da;
    });
  }, [activeFiltered, selectedStage, rotinaView, search, today]);

  // ── sub-tab counts ────────────────────────────────────────────────────────
  const subCounts = useMemo(() => {
    const base2 = activeFiltered.filter(l => l.etapaLead === selectedStage);
    return {
      vencidos: base2.filter(l => (getDaysSince(l.dataFollowUp) >= 1 || !l.dataFollowUp) && l.lastFollowUpDone !== today).length,
      hoje:     base2.filter(l => l.dataFollowUp === today || l.lastFollowUpDone === today).length,
      todos:    base2.length,
    };
  }, [activeFiltered, selectedStage, today]);

  // ── script for selected stage (varia conforme fonte selecionada) ──────────
  const selectedConfig = REGUA_CONFIG.find(r => r.stage === selectedStage);
  const selectedScript = useMemo(() => {
    if (fonteFilter === "indicacao") {
      const indic = INDICACAO_SCRIPTS[selectedStage as LeadStage];
      if (indic?.[0]) return indic[0];
    }
    if (fonteFilter === "promotora" || selectedStage === "Avaliação agendada") {
      const promo = PROMOTORA_SCRIPTS[selectedStage as LeadStage];
      if (promo?.[0]) return promo[0];
    }
    const msg = followUpMessages.find(m => m.stage === selectedStage);
    return msg?.variations?.[0] ?? msg?.template ?? null;
  }, [selectedStage, fonteFilter]);

  // helper: resolve mensagem WhatsApp respeitando fonte do lead
  const resolveWhatsAppMessage = (lead: Lead, data1 = "", hora1 = "", data2 = "", hora2 = "") => {
    const horario = lead.dataAgendamento?.split(" ")[1] ?? "";
    // Avaliação agendada → sempre usa confirmação de agendamento
    if (lead.etapaLead === "Avaliação agendada") return null; // sinaliza para usar confirmação
    // Lead de indicação: usa script de indicação se disponível
    if (isIndicacao(lead)) {
      const scripts = INDICACAO_SCRIPTS[lead.etapaLead as LeadStage];
      const tpl = scripts?.[lead.followUpCount ? lead.followUpCount % scripts.length : 0] ?? scripts?.[0];
      if (tpl) return formatFollowUpMessage(tpl, lead.nome, lead.servicoProcurado, "OdontoCompany", horario, data1, data2, hora1, hora2);
    }
    // Lead da promotora: usa script promotora se disponível
    if (isPromotor(lead)) {
      const scripts = PROMOTORA_SCRIPTS[lead.etapaLead as LeadStage];
      const tpl = scripts?.[lead.followUpCount ? lead.followUpCount % scripts.length : 0] ?? scripts?.[0];
      if (tpl) return formatFollowUpMessage(tpl, lead.nome, lead.servicoProcurado, "OdontoCompany", horario, data1, data2, hora1, hora2);
    }
    // Lead orgânico: usa sistema existente
    const hasAppt = !!(lead.dataAgendamentoCriado || lead.dataAgendamentoAlterado);
    const noShow  = lead.comparecimento === "NÃO COMPARECEU";
    const tpl     = getFollowUpMessageForLead(lead.etapaLead, lead.followUpCount || 0, hasAppt, noShow);
    if (!tpl) return "";
    return formatFollowUpMessage(tpl, lead.nome, lead.servicoProcurado, "OdontoCompany", horario, data1, data2, hora1, hora2);
  };

  // ── action handlers ───────────────────────────────────────────────────────
  const handleWhatsApp = async (lead: Lead) => {
    // Avaliação agendada → confirmação de presença
    if (lead.etapaLead === "Avaliação agendada") {
      handleConfirmAppt(lead);
      return;
    }
    let data1 = "", hora1 = "", data2 = "", hora2 = "";
    const noShow = lead.comparecimento === "NÃO COMPARECEU";
    if ((noShow || isPromotor(lead) || isIndicacao(lead)) && currentClinic) {
      try {
        const slots = await getAvailableSlots(currentClinic);
        if (slots.length > 0) { data1 = slots[0].dayLabel; hora1 = slots[0].hourLabel; }
        if (slots.length > 1) { data2 = slots[1].dayLabel; hora2 = slots[1].hourLabel; }
      } catch { /* silent */ }
    }
    const msg = resolveWhatsAppMessage(lead, data1, hora1, data2, hora2) ?? "";
    setSuggestedMsg(msg);
    setWhatsLead(lead);
    setShowWhatsApp(true);
  };

  const handleConfirmAppt = (lead: Lead) => {
    const clinic = clinicMeta ?? (currentClinic ? { id: currentClinic, name: currentClinic } : undefined);
    const msg = generateAppointmentConfirmationTextForClinic(clinic, lead.dataAgendamento ?? "");
    setSuggestedMsg(msg);
    setWhatsLead(lead);
    setShowWhatsApp(true);
  };

  const handleConfirmFU = (leadId: string, obs: string, etapa?: LeadStage) => {
    onSendFollowUp(leadId, obs, etapa);
    setSelectedLead(null);
  };

  const handleConfirmCall = (leadId: string, outcome: string, obs: string, returnDate?: string, nextStage?: LeadStage) => {
    onRegisterCall?.(leadId, outcome, obs, returnDate, nextStage);
    setCallLead(null);
  };

  // ── campaign helpers ───────────────────────────────────────────────────────
  const toggleLeadSelection = (leadId: string) => {
    const newSelected = new Set(selectedLeadIds);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeadIds(newSelected);
  };

  const campaignLeads = stageLeads.filter(l => selectedLeadIds.has(l.id));
  const currentCampaignLead = campaignLeads[campaignCurrentIndex];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 19) return "Boa tarde";
    return "Boa noite";
  };

  const getCampaignMessage = async (lead: Lead, offerType: "clareamento" | "cupom" = "clareamento") => {
    let data1 = "", hora1 = "";
    if (currentClinic) {
      try {
        const slots = await getAvailableSlots(currentClinic);
        if (slots.length > 0) { data1 = slots[0].dayLabel; hora1 = slots[0].hourLabel; }
      } catch { /* silent */ }
    }
    
    const greeting = getGreeting();
    
    let msgTemplate: string;
    if (offerType === "clareamento") {
      msgTemplate = `${greeting}, [primeiro_nome]! Como você está?\n\nAinda consigo te colocar na campanha das 2 sessões de clareamento como benefício da clínica sem custo para [data_sugerida_1] às [hora_sugerida_1].\n\nSó preciso do seu nome completo para agendar.\n\nPosso agendar para você?`;
    } else {
      // Calcular validade: 7 dias a partir de hoje
      const validade = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toLocaleDateString();
      })();
      const cupomAmount = getCupomAmount(lead);
      msgTemplate = `Olá [primeiro_nome], tudo bem? 💚✨\n\nVocê ganhou um cupom de desconto de R$${cupomAmount} para seu tratamento de [serviço].\n\nPara garantir, responda EUQUERO até ${validade}.\n\nSó preciso do seu nome completo para confirmar.\n\nAproveite essa oportunidade! 💚💚`;
    }
    
    return formatFollowUpMessage(msgTemplate, lead.nome, lead.servicoProcurado, "OdontoCompany", "", data1, "", hora1, "");
  };

  const handleOpenCampaignModal = () => {
    setCampaignCurrentIndex(0);
    setShowCampaignTypeModal(true);
  };

  const handleStartCampaign = () => {
    setShowCampaignTypeModal(false);
    setShowCampaignModal(true);
  };

  const handleCampaignNext = () => {
    if (campaignCurrentIndex < campaignLeads.length - 1) {
      setCampaignCurrentIndex(campaignCurrentIndex + 1);
    } else {
      toast.success(`Campanha enviada para ${campaignLeads.length} leads! ✓`);
      setShowCampaignModal(false);
      setSelectedLeadIds(new Set());
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Rotina de Contatos
        </h3>
        <span className="text-sm text-muted-foreground">{totalEmFU} em andamento</span>
      </div>

      {/* Filtro por fonte */}
      <div className="flex gap-1.5">
        {(
          [
            { id: "todos",     label: "Todos",      Icon: Globe,      cls: "bg-muted/60 text-foreground border-muted" },
            { id: "organico",  label: "Orgânicos",  Icon: Globe,      cls: "bg-blue-50 text-blue-700 border-blue-200" },
            { id: "promotora", label: "Promotora",  Icon: UserCheck,  cls: "bg-pink-50 text-pink-700 border-pink-200" },
            { id: "indicacao", label: "Indicação",  Icon: Gift,       cls: "bg-amber-50 text-amber-700 border-amber-200" },
          ] as { id: FonteFilter; label: string; Icon: React.ElementType; cls: string }[]
        ).map(({ id, label, Icon, cls }) => (
          <button
            key={id}
            onClick={() => setFonteFilter(id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
              fonteFilter === id ? `${cls} ring-2 ring-offset-1 ring-current shadow` : "bg-muted/40 text-muted-foreground border-muted hover:bg-muted"
            }`}
          >
            <Icon className="h-3 w-3 shrink-0" />
            {label}
          </button>
        ))}
        {fonteFilter === "promotora" && (
          <span className="ml-auto text-[11px] text-pink-600 italic self-center hidden sm:inline">
            Scripts adaptados — sem pedido de áudio
          </span>
        )}
        {fonteFilter === "indicacao" && (
          <span className="ml-auto text-[11px] text-amber-600 italic self-center hidden sm:inline">
            Scripts adaptados — campanha de indicação (2 sessões de clareamento)
          </span>
        )}
      </div>

      {/* Inner tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {(
          [
            { id: "rotina",   label: "Rotina Diária", Icon: Play      },
            { id: "regua",    label: "Cadência",       Icon: BookOpen  },
            { id: "metricas", label: "Métricas",       Icon: BarChart3 },
          ] as { id: InnerTab; label: string; Icon: React.ElementType }[]
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setInnerTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
              innerTab === id
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* TAB: ROTINA DIÁRIA                                                 */}
      {/* ================================================================== */}
      {innerTab === "rotina" && (
        <div className="space-y-4">
          {/* Stage chips */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Selecione a etapa para trabalhar hoje:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {REGUA_CONFIG.map(r => {
                const cnt = stageCount[r.stage] || 0;
                const isSel = selectedStage === r.stage;
                return (
                  <button
                    key={r.stage}
                    onClick={() => { setSelectedStage(r.stage); setRotinaView("vencidos"); }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                      isSel
                        ? `${COLOR_BADGE[r.color]} ring-2 ring-offset-1 ring-current shadow`
                        : "bg-muted/60 text-muted-foreground border-muted hover:bg-muted"
                    }`}
                  >
                    {r.label}
                    {cnt > 0 && (
                      <span className={`px-1 rounded-full text-[10px] font-bold ${isSel ? "bg-white/50" : "bg-muted-foreground/20"}`}>
                        {cnt}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Script card */}
          {selectedConfig && (
            <div className={`rounded-lg border p-3 ${COLOR_BADGE[selectedConfig.color]}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-bold">{selectedConfig.label}</span>
                  <span className="font-semibold">{selectedConfig.tipo}</span>
                  <span className="opacity-60">• {selectedConfig.cadencia}</span>
                  <span className="opacity-70 hidden sm:inline">
                    • {fonteFilter === "indicacao" && selectedConfig.descIndicacao
                        ? selectedConfig.descIndicacao
                        : fonteFilter === "promotora" && selectedConfig.descPromo
                        ? selectedConfig.descPromo
                        : selectedConfig.desc}
                  </span>
                </div>
                <button
                  onClick={() => setExpandedScript(expandedScript === selectedStage ? null : selectedStage)}
                  className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100 shrink-0 ml-2"
                >
                  <MessageSquare className="h-3 w-3" />
                  <span className="hidden sm:inline">{expandedScript === selectedStage ? "Recolher" : "Ver script"}</span>
                  {expandedScript === selectedStage ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>
              <p className="text-xs opacity-70 mt-0.5 sm:hidden">{selectedConfig.desc}</p>
              {expandedScript === selectedStage && selectedScript && (
                <div className="mt-3 p-3 bg-white/70 rounded-lg text-xs whitespace-pre-line leading-relaxed border border-current/20 font-mono">
                  {selectedScript}
                </div>
              )}
            </div>
          )}

          {/* Sub-view tabs: Vencidos / Hoje / Todos */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
                {(
                  [
                    { id: "vencidos", label: "Vencidos",  count: subCounts.vencidos, warn: true,  desc: "Atrasados — fazer agora" },
                    { id: "hoje",     label: "Hoje",       count: subCounts.hoje,     warn: false, desc: "Rotina de hoje" },
                    { id: "todos",    label: "Todos",      count: subCounts.todos,    warn: false, desc: "Todos os leads" },
                  ] as { id: RotinaView; label: string; count: number; warn: boolean; desc: string }[]
                ).map(v => (
                  <div key={v.id} className="group relative">
                    <button
                      onClick={() => setRotinaView(v.id)}
                      className={`flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                        rotinaView === v.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v.label}
                      {v.count > 0 && (
                        <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                          rotinaView === v.id
                            ? v.warn
                              ? "bg-destructive/15 text-destructive"
                              : "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}>{v.count}</span>
                      )}
                    </button>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 left-0 z-10 hidden group-hover:block px-2 py-1 bg-foreground text-background text-xs rounded whitespace-nowrap shadow-lg">
                      {v.desc}
                    </div>
                  </div>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground italic hidden sm:inline">Passe o mouse para saber mais</span>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone…"
              className="pl-9 pr-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Campaign button */}
          {selectedLeadIds.size > 0 && (
            <div className="flex gap-2">
              <Button
                onClick={() => setSelectedLeadIds(new Set())}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Cancelar seleção ({selectedLeadIds.size})
              </Button>
              <Button
                onClick={handleOpenCampaignModal}
                size="sm"
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                📤 Enviar Campanha ({selectedLeadIds.size})
              </Button>
            </div>
          )}

          {/* Lead list */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
            {stageLeads.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {rotinaView === "vencidos"
                  ? "✅ Nenhum lead vencido nessa etapa. Bom trabalho!"
                  : "Nenhum lead encontrado com esses filtros."}
              </p>
            )}
            {stageLeads.map(lead => {
              const days      = getDaysSince(lead.lastFollowUpDone || lead.dataFollowUp);
              const doneToday = lead.lastFollowUpDone === today;
              return (
                <div
                  key={lead.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors border ${
                    doneToday
                      ? "bg-emerald-50/60 border-emerald-100"
                      : "bg-background/50 hover:bg-muted/50 border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedLeadIds.has(lead.id)}
                    onChange={() => toggleLeadSelection(lead.id)}
                    className="h-4 w-4 cursor-pointer shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        className="font-medium text-sm truncate text-left hover:underline hover:text-primary transition-colors"
                        onClick={() => setDetailLead(lead)}
                      >
                        {lead.nome}
                      </button>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        lead.status === "QUENTE" ? "bg-destructive/15 text-destructive" :
                        lead.status === "MORNO"  ? "bg-warning/15 text-warning" :
                                                   "bg-info/15 text-info"
                      }`}>{lead.status || "–"}</span>
                      {isPromotor(lead) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-pink-100 text-pink-700 border border-pink-200">
                          Promotora
                        </span>
                      )}
                      {isIndicacao(lead) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
                          Indicação
                        </span>
                      )}
                      {doneToday && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
                          Feito hoje
                        </span>
                      )}
                      {!doneToday && days > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          days >= 7 ? "bg-destructive/15 text-destructive" :
                          days >= 4 ? "bg-warning/15 text-warning" :
                                      "bg-muted/50 text-muted-foreground"
                        }`}>Há {days}d</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-mono text-muted-foreground">{lead.telefone}</span>
                      <span className="text-xs text-muted-foreground">• {lead.servicoProcurado}</span>
                    </div>
                    {lead.observacao && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate italic">"{lead.observacao}"</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon" variant="outline"
                      className="h-8 w-8 text-primary border-primary/30 hover:bg-primary/10"
                      title="Detalhes"
                      onClick={() => setDetailLead(lead)}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="outline"
                      className="h-8 w-8"
                      title="Registrar Ligação"
                      onClick={() => setCallLead(lead)}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="outline"
                      className="h-8 w-8 text-success border-success/30 hover:bg-success/10"
                      title="Enviar WhatsApp"
                      onClick={() => handleWhatsApp(lead)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    {lead.dataAgendamento && (
                      <Button
                        size="icon" variant="outline"
                        className="h-8 w-8 text-primary border-primary/30 hover:bg-primary/10"
                        title="Confirmação de Agendamento"
                        onClick={() => handleConfirmAppt(lead)}
                      >
                        <CalendarCheck className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      className="h-8 w-8 bg-primary hover:bg-primary/90"
                      title="Registrar Follow-Up (Feito)"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB: CADÊNCIA                                                      */}
      {/* ================================================================== */}
      {innerTab === "regua" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            Cadência completa do funil — do primeiro contato ao fechamento.
            {fonteFilter === "promotora" && <span className="text-pink-600 font-medium"> Scripts adaptados para Promotora visíveis.</span>}
            {" "}Clique em <strong>Trabalhar →</strong> para ir direto à fila daquela etapa.
          </p>
          <div className="space-y-1.5">
            {REGUA_CONFIG.map(r => {
              const cnt        = stageCount[r.stage] || 0;
              const promoScript  = PROMOTORA_SCRIPTS[r.stage as LeadStage]?.[0];
              const indicScript  = INDICACAO_SCRIPTS[r.stage as LeadStage]?.[0];
              const msgData      = followUpMessages.find(m => m.stage === r.stage);
              const fullScript   = fonteFilter === "indicacao" && indicScript
                ? indicScript
                : fonteFilter === "promotora" && promoScript
                ? promoScript
                : (msgData?.variations?.[0] ?? msgData?.template ?? "");
              const isExp      = expandedScript === r.stage;
              return (
                <div
                  key={r.stage}
                  className={`rounded-lg border p-3 transition-colors ${
                    cnt > 0 ? `${COLOR_ROW[r.color]}` : "border-muted/50"
                  } ${cnt > 0 ? "bg-background" : "bg-muted/10"}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Badge */}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${COLOR_BADGE[r.color]}`}>
                      {r.label}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{r.tipo}</span>
                        <span className="text-xs text-muted-foreground">• {r.cadencia}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          • {fonteFilter === "indicacao" && r.descIndicacao
                              ? r.descIndicacao
                              : fonteFilter === "promotora" && r.descPromo
                              ? r.descPromo
                              : r.desc}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground sm:hidden mt-0.5">
                        {fonteFilter === "indicacao" && r.descIndicacao
                          ? r.descIndicacao
                          : fonteFilter === "promotora" && r.descPromo
                          ? r.descPromo
                          : r.desc}
                      </p>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2 shrink-0">
                      {cnt > 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COLOR_BADGE[r.color]}`}>
                          {cnt}
                        </span>
                      )}
                      <button
                        onClick={() => setExpandedScript(isExp ? null : r.stage)}
                        className="text-xs opacity-60 hover:opacity-100 flex items-center gap-0.5"
                        title="Ver script"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {isExp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {cnt > 0 && (
                        <button
                          onClick={() => { setSelectedStage(r.stage); setRotinaView("vencidos"); setInnerTab("rotina"); }}
                          className={`text-xs font-semibold px-2 py-0.5 rounded border transition-colors ${COLOR_BADGE[r.color]} hover:opacity-80`}
                        >
                          Trabalhar →
                        </button>
                      )}
                    </div>
                  </div>

                  {isExp && fullScript && (
                    <div className="mt-3 space-y-2">
                      {editingStage === r.stage ? (
                        <>
                          <Textarea
                            value={editingScript}
                            onChange={(e) => setEditingScript(e.target.value)}
                            className="text-xs resize-none"
                            rows={6}
                          />
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingStage(null)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                setEditingStage(null);
                                toast.success(`Script atualizado para ${r.label}`);
                              }}
                              className="bg-primary hover:bg-primary/90"
                            >
                              Salvar
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-3 bg-muted/30 rounded-lg text-xs whitespace-pre-line leading-relaxed font-mono border border-muted">
                            {fullScript}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingStage(r.stage);
                              setEditingScript(fullScript);
                            }}
                            className="w-full"
                          >
                            ✏️ Editar script
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB: MÉTRICAS                                                       */}
      {/* ================================================================== */}
      {innerTab === "metricas" && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
              <p className="text-[11px] text-muted-foreground mb-0.5">Em andamento</p>
              <p className="text-2xl font-bold text-primary">{totalEmFU}</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
              <p className="text-[11px] text-muted-foreground mb-0.5">Melhor etapa</p>
              <p className="text-sm font-bold text-emerald-700">
                {(() => {
                  const best = [...metrics].filter(m => m.total > 3).sort((a, b) => b.convRate - a.convRate)[0];
                  return best ? `${best.label} · ${best.convRate}%` : "–";
                })()}
              </p>
              <p className="text-[10px] text-muted-foreground">conv. p/ avaliação</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
              <p className="text-[11px] text-muted-foreground mb-0.5">Taxa média conv.</p>
              <p className="text-2xl font-bold text-amber-700">
                {(() => {
                  const valid = metrics.filter(m => m.total > 0);
                  if (!valid.length) return "–";
                  return Math.round(valid.reduce((a, m) => a + m.convRate, 0) / valid.length) + "%";
                })()}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-center">
              <p className="text-[11px] text-muted-foreground mb-0.5">Comparecimento</p>
              <p className="text-2xl font-bold text-teal-700">
                {(() => {
                  const totalHad  = metrics.reduce((s, m) => s + m.hadAppt, 0);
                  const totalShow = metrics.reduce((s, m) => s + m.showed, 0);
                  if (!totalHad) return "–";
                  return Math.round((totalShow / totalHad) * 100) + "%";
                })()}
              </p>
              <p className="text-[10px] text-muted-foreground">dos que agendaram</p>
            </div>
          </div>

          {/* Per-stage table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left p-2.5 font-semibold">Etapa</th>
                  <th className="text-left p-2.5 font-semibold hidden sm:table-cell">Tipo</th>
                  <th className="text-center p-2.5 font-semibold">Ativos</th>
                  <th className="text-center p-2.5 font-semibold">Agendados</th>
                  <th className="text-center p-2.5 font-semibold hidden sm:table-cell">Compareceu</th>
                  <th className="text-center p-2.5 font-semibold hidden sm:table-cell">Responderam</th>
                  <th className="text-center p-2.5 font-semibold hidden sm:table-cell">Desistência</th>
                  <th className="text-center p-2.5 font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => (
                  <tr key={m.stage} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="p-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${COLOR_BADGE[m.color]}`}>
                        {m.label}
                      </span>
                    </td>
                    <td className="p-2.5 text-muted-foreground hidden sm:table-cell">{m.tipo}</td>
                    <td className="p-2.5 text-center font-bold">
                      <span className={m.active > 0 ? "text-foreground" : "text-muted-foreground"}>{m.active}</span>
                    </td>
                    <td className="p-2.5 text-center">
                      {m.total > 0 ? (
                        <div className="flex flex-col items-center">
                          <span className={`font-semibold ${m.convRate >= 20 ? "text-emerald-600" : m.convRate >= 10 ? "text-amber-600" : "text-muted-foreground"}`}>
                            {m.convRate}%
                          </span>
                          {m.convRate >= 20 && <TrendingUp className="h-3 w-3 text-emerald-500 mt-0.5" />}
                        </div>
                      ) : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="p-2.5 text-center hidden sm:table-cell">
                      {m.showRate !== null ? (
                        <div className="flex flex-col items-center">
                          <span className={`font-semibold ${
                            m.showRate >= 70 ? "text-emerald-600" :
                            m.showRate >= 40 ? "text-amber-600" :
                            "text-destructive"
                          }`}>{m.showRate}%</span>
                          {m.noShowRate !== null && m.noShowRate > 0 && (
                            <span className="text-[10px] text-destructive/70">{m.noShowRate}% faltou</span>
                          )}
                        </div>
                      ) : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="p-2.5 text-center hidden sm:table-cell">
                      {m.total > 0
                        ? <span className={`font-semibold ${m.respondRate >= 30 ? "text-emerald-600" : "text-muted-foreground"}`}>{m.respondRate}%</span>
                        : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="p-2.5 text-center hidden sm:table-cell">
                      {m.total > 0
                        ? <span className={`font-semibold ${m.dropRate >= 40 ? "text-destructive" : "text-muted-foreground"}`}>{m.dropRate}%</span>
                        : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="p-2.5 text-center">
                      {m.active > 0 && (
                        <button
                          onClick={() => { setSelectedStage(m.stage); setRotinaView("vencidos"); setInnerTab("rotina"); }}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          Ver →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda */}
          <details className="group rounded-lg border border-muted bg-muted/20">
            <summary className="flex items-center gap-2 cursor-pointer select-none px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors list-none">
              <HelpCircle className="h-3.5 w-3.5 shrink-0" />
              Como ler estas métricas?
              <ChevronDown className="h-3.5 w-3.5 ml-auto group-open:hidden" />
              <ChevronUp className="h-3.5 w-3.5 ml-auto hidden group-open:block" />
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-3 text-[11px] leading-relaxed text-muted-foreground border-t border-muted">

              {/* Cards de resumo */}
              <div>
                <p className="font-semibold text-foreground mb-1.5 text-xs">Cards de resumo</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div className="flex gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary/60 mt-0.5 shrink-0" />
                    <span><strong className="text-foreground">Em andamento</strong> — total de leads que ainda estão no funil de follow-up (excluindo Finalizados e Desistências).</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mt-0.5 shrink-0" />
                    <span><strong className="text-foreground">Melhor etapa</strong> — etapa com maior taxa de conversão para Avaliação Agendada (mín. 4 leads).</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 mt-0.5 shrink-0" />
                    <span><strong className="text-foreground">Taxa média conv.</strong> — média das taxas de conversão de todas as etapas com pelo menos 1 lead.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-500 mt-0.5 shrink-0" />
                    <span><strong className="text-foreground">Comparecimento</strong> — % dos leads que tinham agendamento e <em>efetivamente compareceram</em> à clínica.</span>
                  </div>
                </div>
              </div>

              {/* Colunas da tabela */}
              <div>
                <p className="font-semibold text-foreground mb-1.5 text-xs">Colunas da tabela</p>
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <span className="font-semibold text-foreground w-24 shrink-0">Ativos</span>
                    <span>Leads que estão hoje nessa etapa do funil.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold text-foreground w-24 shrink-0">Agendados</span>
                    <span>% dos leads que chegaram <strong className="text-foreground">até esta etapa ou além</strong> (followUp ≥ N) e eventualmente agendaram. É uma visão de funil acumulado — etapas mais avançadas tendem a mostrar taxas maiores, pois os leads que desistiram saíram antes.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold text-foreground w-24 shrink-0">Compareceu</span>
                    <span>% dos leads com agendamento criado que compareceram à clínica. Valor alto = boa qualificação; valor baixo = leads frios ou agendamentos sem confirmação.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold text-foreground w-24 shrink-0">Responderam</span>
                    <span>% dos leads marcados como "RESPONDEU" — mede o engajamento com os contatos enviados.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-semibold text-foreground w-24 shrink-0">Desistência</span>
                    <span>% dos leads que saíram como "Desistência". Valor alto em etapas iniciais pode indicar script inadequado ou leads mal qualificados.</span>
                  </div>
                </div>
              </div>

              {/* Dica */}
              <div className="flex gap-2 rounded-md bg-primary/5 border border-primary/15 px-2.5 py-2">
                <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-foreground">Dica:</strong> o objetivo é ter <span className="text-emerald-600 font-semibold">Agendados ≥ 20%</span>, <span className="text-teal-600 font-semibold">Comparecimento ≥ 70%</span> e <span className="text-destructive font-semibold">Desistência &lt; 20%</span> em cada etapa.</span>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ================================================================== */}
      {/* Dialogs compartilhados                                              */}
      {/* ================================================================== */}
      <FollowUpDialog
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onConfirm={handleConfirmFU}
        onDelete={onDeleteLead}
      />

      <CallLogDialog
        lead={callLead}
        open={!!callLead}
        onClose={() => setCallLead(null)}
        onConfirm={handleConfirmCall}
      />

      {whatsLead && showWhatsApp && (
        <WhatsAppMessageDialog
          lead={whatsLead}
          open={showWhatsApp}
          onClose={() => { setShowWhatsApp(false); setSuggestedMsg(""); setWhatsLead(null); }}
          suggestedMessage={suggestedMsg}
        />
      )}

      <LeadDetailsDialog
        lead={detailLead}
        open={!!detailLead}
        onClose={() => setDetailLead(null)}
        onEdit={onUpdateLead ? (lead) => { setDetailLead(null); setEditingLead(lead); } : undefined}
      />

      <EditLeadDialog
        lead={editingLead}
        open={!!editingLead}
        onClose={() => setEditingLead(null)}
        onSave={(id, updates) => { onUpdateLead?.(id, updates); setEditingLead(null); }}
      />

      {/* Campaign Type Selection Modal */}
      {showCampaignTypeModal && (
        <Dialog open={showCampaignTypeModal} onOpenChange={setShowCampaignTypeModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>🎯 Qual tipo de oferta?</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Escolha qual benefício você quer oferecer nesta campanha:</p>

              {/* Clareamento Option */}
              <div
                onClick={() => {
                  setCampaignOfferType("clareamento");
                  handleStartCampaign();
                }}
                className="p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-blue-500 hover:bg-blue-50"
                style={{borderColor: campaignOfferType === "clareamento" ? "#3b82f6" : "#e5e7eb"}}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">🎁</div>
                  <div>
                    <p className="font-semibold text-sm">2 Sessões de Clareamento</p>
                    <p className="text-xs text-muted-foreground">Benefício da clínica sem custo</p>
                  </div>
                </div>
              </div>

              {/* Cupom Option */}
              <div className="space-y-2">
                <div
                  onClick={() => setCampaignOfferType("cupom")}
                  className="p-4 rounded-lg border-2 cursor-pointer transition-all hover:border-emerald-500 hover:bg-emerald-50"
                  style={{borderColor: campaignOfferType === "cupom" ? "#10b981" : "#e5e7eb"}}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">💳</div>
                    <div>
                      <p className="font-semibold text-sm">Cupom de Desconto</p>
                      <p className="text-xs text-muted-foreground">Automático: R$200/300/500 conforme tempo do lead</p>
                    </div>
                  </div>
                </div>
                {campaignOfferType === "cupom" && (
                  <div className="ml-9 p-2 rounded bg-emerald-50 border border-emerald-200">
                    <p className="text-xs text-emerald-700">
                      ℹ️ Cada lead receberá um cupom automático:<br/>
                      • 30-59 dias = R$200<br/>
                      • 60-89 dias = R$300<br/>
                      • 90+ dias = R$500
                    </p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCampaignTypeModal(false);
                  setSelectedLeadIds(new Set());
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleStartCampaign}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Continuar →
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Campaign Modal */}
      {showCampaignModal && currentCampaignLead && (
        <Dialog open={showCampaignModal} onOpenChange={(open) => {
          if (!open) {
            setShowCampaignModal(false);
            setSelectedLeadIds(new Set());
            setCampaignCurrentIndex(0);
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>📤 Campanha {campaignOfferType === "clareamento" ? "🎁" : "💳"}: {campaignCurrentIndex + 1}/{campaignLeads.length}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Lead card */}
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm font-semibold text-blue-900">{currentCampaignLead.nome}</p>
                <p className="text-xs text-blue-700 mt-1">{currentCampaignLead.telefone}</p>
              </div>

              {/* Message preview - use getCampaignMessage if available, else fallback */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">📝 Preview da mensagem:</p>
                <div className="p-3 rounded-lg bg-muted/40 border text-xs whitespace-pre-line leading-relaxed">
                  {(() => {
                    const greeting = getGreeting();
                    let msg: string;
                    if (campaignOfferType === "clareamento") {
                      msg = `${greeting}, [primeiro_nome]! Como você está?\n\nAinda consigo te colocar na campanha das 2 sessões de clareamento como benefício da clínica sem custo para [data_sugerida_1] às [hora_sugerida_1].\n\nPosso agendar para você?`;
                    } else {
                      // Calcular validade: 7 dias a partir de hoje
                      const validade = (() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 7);
                        return d.toLocaleDateString();
                      })();
                      const cupomAmount = getCupomAmount(currentCampaignLead);
                      msg = `Olá [primeiro_nome], tudo bem? 💚✨\n\nVocê ganhou um cupom de desconto de R$${cupomAmount} para seu tratamento de [serviço].\n\nPara garantir, responda EUQUERO até ${validade}.\n\nAproveite essa oportunidade! 💚💚`;
                    }
                    const previewMsg = msg
                      .replace("[primeiro_nome]", currentCampaignLead.nome.split(" ")[0] || "você")
                      .replace("[serviço]", currentCampaignLead.servicoProcurado || "seu procedimento")
                      .replace("[data_sugerida_1]", "Quinta, 07/05")
                      .replace("[hora_sugerida_1]", "8h30");
                    return previewMsg;
                  })()}
                </div>
              </div>

              {/* Instructions */}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                <p className="text-xs font-semibold text-amber-900">⚠️ Próximos passos:</p>
                <ol className="text-xs text-amber-800 space-y-1 list-decimal list-inside">
                  <li>Clique em "Abrir no WhatsApp"</li>
                  <li>Insira a imagem do voucher</li>
                  <li>Clique em "→ Próximo" para continuar</li>
                </ol>
              </div>

              {/* Progress */}
              <div className="flex h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="bg-blue-500 transition-all" 
                  style={{width: `${((campaignCurrentIndex + 1) / campaignLeads.length) * 100}%`}}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCampaignModal(false);
                  setSelectedLeadIds(new Set());
                  setCampaignCurrentIndex(0);
                }}
              >
                Cancelar tudo
              </Button>
              <Button
                onClick={async () => {
                  if (currentCampaignLead) {
                    const msg = await getCampaignMessage(currentCampaignLead, campaignOfferType);
                    const link = generateFollowUpWhatsAppLink(currentCampaignLead.telefone, currentCampaignLead.nome, msg);
                    window.open(link, "_blank");
                    handleCampaignNext();
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                ✓ Abrir no WhatsApp → Próximo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

