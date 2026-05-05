import { useState, useMemo } from "react";
import { Lead, LeadStage } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { FollowUpDialog } from "./FollowUpDialog";
import { WhatsAppMessageDialog } from "./WhatsAppMessageDialog";
import { CallLogDialog } from "./CallLogDialog";
import { LeadDetailsDialog } from "./LeadDetailsDialog";
import { followUpMessages, getFollowUpMessageForLead, formatFollowUpMessage } from "@/data/followUpMessages";
import { useAuth } from "@/hooks/useAuth";
import { getAvailableSlots } from "@/lib/scheduleHelper";
import { generateAppointmentConfirmationTextForClinic } from "@/lib/whatsapp";

// ---------------------------------------------------------------------------
// Scripts específicos para leads da Promotora
// Eles JÁ foram abordados pessoalmente — NÃO pedir áudio, focar em confirmar/agendar
// ---------------------------------------------------------------------------
const PROMOTORA_SCRIPTS: Partial<Record<LeadStage, string[]>> = {
  "Novo": [
    "Olá [primeiro_nome]! 😊\n\nFoi um prazer te conhecer hoje.\n\nComo combinamos, tenho alguns horários disponíveis para sua avaliação de [serviço].\n\nQual dia funciona melhor para você? Temos opções em [data_sugerida_1] ou [data_sugerida_2].",
    "Olá [primeiro_nome], tudo bem?\n\nPassei para confirmar nosso contato de hoje. Temos horários disponíveis para sua avaliação de [serviço].\n\nPoderia me confirmar qual dia é melhor para você?",
  ],
  "Em contato": [
    "Olá [primeiro_nome]! 😊\n\nRetornei para verificar sobre o agendamento da sua avaliação de [serviço].\n\nTemos disponibilidade em [data_sugerida_1] ou [data_sugerida_2]. Qual prefere?",
    "[primeiro_nome], como você está?\n\nSei que a rotina é corrida, mas queria garantir que você não perca a oportunidade de cuidar do seu sorriso.\n\nPoderia me confirmar um horário? Temos [data_sugerida_1] disponível.",
  ],
  "Follow-Up 1": [
    "Olá [primeiro_nome]! 😊\n\nTentei entrar em contato anteriormente sobre sua avaliação de [serviço].\n\nTemos disponibilidade em [data_sugerida_1] ou [data_sugerida_2]. Qual dia funciona para você?",
  ],
  "Follow-Up 2": [
    "[primeiro_nome], tudo bem?\n\nNão quero perder o contato! Você passou pelo nosso atendimento e demonstrou interesse em [serviço].\n\nConseguimos um horário em [data_sugerida_1]. Funciona para você?",
  ],
  "Follow-Up 3": [
    "Olá [primeiro_nome]!\n\nCompreendo que a agenda pode estar cheia. Se quiser, podemos agendar para o período da tarde ou de manhã — o que for melhor para você.\n\nTemos [data_sugerida_1] disponível. O que acha?",
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
  descPromo?: string; // descrição alternativa para leads da promotora
}

const REGUA_CONFIG: ReguaEntry[] = [
  { stage: "Novo",          label: "NOVO",  cadencia: "Imediato",    tipo: "1º Contato",       color: "green",  desc: "Lead acabou de entrar — primeiro toque, perguntar sobre incômodo via áudio",        descPromo: "Lead abordado pela promotora — confirmar agendamento ou propor data" },
  { stage: "Em contato",    label: "EC",    cadencia: "+1 dia",      tipo: "Nutrição",          color: "teal",   desc: "Já respondeu mas não agendou — manter conversa e colher informações",               descPromo: "Ainda não agendou — oferecer data concreta e fechar horário" },
  { stage: "Follow-Up 1",   label: "D1",    cadencia: "Mesmo dia",   tipo: "Primeiro Follow-Up",color: "blue",   desc: "Abordagem inicial suave — perguntar sobre dor/incômodo via áudio",                 descPromo: "Não agendou ainda — oferecer data direta, sem pedir áudio" },
  { stage: "Follow-Up 2",   label: "D2",    cadencia: "+1 dia",      tipo: "Primeiro Contato",  color: "blue",   desc: "Reengajar sem pressão — perguntar qual é o próximo passo",                         descPromo: "Insistir com data alternativa — tom leve" },
  { stage: "Follow-Up 3",   label: "D3",    cadencia: "+1 dia",      tipo: "Primeiro Contato",  color: "blue",   desc: "Empatia com a rotina — reforçar disponibilidade",                                  descPromo: "Flexibilizar horário — manhã ou tarde" },
  { stage: "Follow-Up 4",   label: "D4",    cadencia: "+1 dia",      tipo: "Urgência",          color: "amber",  desc: "Criar urgência — agenda concorrida, limitar vagas percebidas" },
  { stage: "Follow-Up 5",   label: "D5",    cadencia: "+2 dias",     tipo: "Oferta",            color: "amber",  desc: "Condição diferenciada / oferta especial do financeiro" },
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

// ---------------------------------------------------------------------------

interface FollowUpRulerProps {
  leads: Lead[];
  allLeads?: Lead[];
  onSendFollowUp: (leadId: string, observacao?: string, etapa?: LeadStage) => void;
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string, nextStage?: LeadStage) => void;
  onDeleteLead?: (leadId: string) => void;
}

type InnerTab    = "rotina" | "regua" | "metricas";
type RotinaView  = "vencidos" | "hoje" | "todos";
type FonteFilter = "todos" | "organico" | "promotora";

const isPromotor = (lead: Lead) =>
  (lead.fonteLead || "").toLowerCase().trim() === "promotora";

// ---------------------------------------------------------------------------

export function FollowUpRuler({
  leads,
  allLeads,
  onSendFollowUp,
  onRegisterCall,
  onDeleteLead,
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

  const { clinicMeta, currentClinic } = useAuth();
  const today = todayStr();
  const base = allLeads || leads;
  const active = base.filter(l => !(l as any)._deleted);

  // ── filtragem por fonte ───────────────────────────────────────────────────
  const activeFiltered = useMemo(() => {
    if (fonteFilter === "promotora") return active.filter(isPromotor);
    if (fonteFilter === "organico")  return active.filter(l => !isPromotor(l));
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
      const converted = pool.filter(l =>
        l.etapaLead === "Finalizado" ||
        l.etapaLead === "Avaliação agendada" ||
        !!l.dataAgendamentoCriado
      ).length;
      const dropped   = pool.filter(l => l.etapaLead === "Desistência").length;
      const responded = pool.filter(l => l.respostaLead === "RESPONDEU").length;
      return {
        ...r,
        active:      stageCount[r.stage] || 0,
        total,
        convRate:    total > 0 ? Math.round((converted / total) * 100) : 0,
        dropRate:    total > 0 ? Math.round((dropped   / total) * 100) : 0,
        respondRate: total > 0 ? Math.round((responded / total) * 100) : 0,
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
      list = list.filter(l => getDaysSince(l.dataFollowUp) >= 1 && l.lastFollowUpDone !== today);
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
      vencidos: base2.filter(l => getDaysSince(l.dataFollowUp) >= 1 && l.lastFollowUpDone !== today).length,
      hoje:     base2.filter(l => l.dataFollowUp === today || l.lastFollowUpDone === today).length,
      todos:    base2.length,
    };
  }, [activeFiltered, selectedStage, today]);

  // ── script for selected stage (varia conforme fonte selecionada) ──────────
  const selectedConfig = REGUA_CONFIG.find(r => r.stage === selectedStage);
  const selectedScript = useMemo(() => {
    // Se filtro = promotora ou "Avaliação agendada", usa script da promotora quando disponível
    if (fonteFilter === "promotora" || selectedStage === "Avaliação agendada") {
      const promo = PROMOTORA_SCRIPTS[selectedStage as LeadStage];
      if (promo?.[0]) return promo[0];
    }
    const msg = followUpMessages.find(m => m.stage === selectedStage);
    return msg?.variations?.[0] ?? msg?.template ?? null;
  }, [selectedStage, fonteFilter]);

  // helper: resolve mensagem WhatsApp respeitando fonte do lead
  const resolveWhatsAppMessage = (lead: Lead, data1 = "", hora1 = "") => {
    const horario = lead.dataAgendamento?.split(" ")[1] ?? "";
    // Avaliação agendada → sempre usa confirmação de agendamento
    if (lead.etapaLead === "Avaliação agendada") return null; // sinaliza para usar confirmação
    // Lead da promotora: usa script promotora se disponível
    if (isPromotor(lead)) {
      const scripts = PROMOTORA_SCRIPTS[lead.etapaLead as LeadStage];
      const tpl = scripts?.[lead.followUpCount ? lead.followUpCount % scripts.length : 0] ?? scripts?.[0];
      if (tpl) return formatFollowUpMessage(tpl, lead.nome, lead.servicoProcurado, "OdontoCompany", horario, data1, undefined, hora1);
    }
    // Lead orgânico: usa sistema existente
    const hasAppt = !!(lead.dataAgendamentoCriado || lead.dataAgendamentoAlterado);
    const noShow  = lead.comparecimento === "NÃO COMPARECEU";
    const tpl     = getFollowUpMessageForLead(lead.etapaLead, lead.followUpCount || 0, hasAppt, noShow);
    if (!tpl) return "";
    return formatFollowUpMessage(tpl, lead.nome, lead.servicoProcurado, "OdontoCompany", horario, data1, undefined, hora1);
  };

  // ── action handlers ───────────────────────────────────────────────────────
  const handleWhatsApp = async (lead: Lead) => {
    // Avaliação agendada → confirmação de presença
    if (lead.etapaLead === "Avaliação agendada") {
      handleConfirmAppt(lead);
      return;
    }
    let data1 = "", hora1 = "";
    const noShow = lead.comparecimento === "NÃO COMPARECEU";
    if ((noShow || isPromotor(lead)) && currentClinic) {
      try {
        const slots = await getAvailableSlots(currentClinic);
        if (slots.length > 0) { data1 = slots[0].dayLabel; hora1 = slots[0].hourLabel; }
      } catch { /* silent */ }
    }
    const msg = resolveWhatsAppMessage(lead, data1, hora1) ?? "";
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
                    • {fonteFilter === "promotora" && selectedConfig.descPromo
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
          <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
            {(
              [
                { id: "vencidos", label: "Vencidos",  count: subCounts.vencidos, warn: true },
                { id: "hoje",     label: "Hoje",       count: subCounts.hoje,     warn: false },
                { id: "todos",    label: "Todos",      count: subCounts.todos,    warn: false },
              ] as { id: RotinaView; label: string; count: number; warn: boolean }[]
            ).map(v => (
              <button
                key={v.id}
                onClick={() => setRotinaView(v.id)}
                className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
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
            ))}
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
              const promoScript = PROMOTORA_SCRIPTS[r.stage as LeadStage]?.[0];
              const msgData    = followUpMessages.find(m => m.stage === r.stage);
              const fullScript = fonteFilter === "promotora" && promoScript
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
                          • {fonteFilter === "promotora" && r.descPromo ? r.descPromo : r.desc}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground sm:hidden mt-0.5">
                        {fonteFilter === "promotora" && r.descPromo ? r.descPromo : r.desc}
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
                    <div className="mt-3 p-3 bg-muted/30 rounded-lg text-xs whitespace-pre-line leading-relaxed font-mono border border-muted">
                      {fullScript}
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
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-center">
              <p className="text-[11px] text-muted-foreground mb-0.5">Total em Follow-Up</p>
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

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            * "Agendados" = leads que passaram por essa etapa (followUpCount ≥ N) e depois chegaram a Avaliação Agendada ou Finalizado.
            "Responderam" = marcados com "RESPONDEU". Dados crescem conforme histórico acumula.
          </p>
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
      />
    </div>
  );
}
