import { useState, useMemo, useEffect } from "react";
import { Lead, LeadStage } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Phone, User, ExternalLink, Check, Target, Search, X, CalendarCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateAppointmentConfirmationText } from "@/lib/whatsapp";
import { db } from "@/lib/firebase";
import { doc, getDoc } from 'firebase/firestore';
import { normalizePhoneTo10Digits } from "@/lib/phone";
import { FollowUpDialog } from "./FollowUpDialog";
import { WhatsAppMessageDialog } from "./WhatsAppMessageDialog";
import { CallLogDialog } from "./CallLogDialog";
import ExcelJS from 'exceljs';
import { getFollowUpMessage, formatFollowUpMessage } from "@/data/followUpMessages";
import { useAuth } from "@/hooks/useAuth";
import { generateAppointmentConfirmationTextForClinic } from "@/lib/whatsapp";
import { ProgressWithLabel } from "@/components/ui/progress-with-label";
import NewLeadsPanel from "./NewLeadsPanel";

interface FollowUpQueueProps {
  leads: Lead[];
  onSendFollowUp: (leadId: string, observacao?: string, etapa?: LeadStage) => void;
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string) => void;
  followUpsDoneToday?: number;
  followUpGoal?: number;
  onOpenChat?: (phone: string, message?: string) => void;
  onCreateLead?: (lead: Omit<Lead, 'id'>) => void;
}

// Helper function to calculate days since last follow-up
const getDaysSince = (dateString: string): number => {
  if (!dateString) return 0;
  const [day, month, year] = dateString.split('/');
  const followUpDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  followUpDate.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - followUpDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const formatDateForDisplay = (v: any) => {
  if (!v) return "";
  try {
    const d = typeof v === "number" ? new Date(v) : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString();
  } catch (e) {
    return String(v);
  }
};
  
const parseToDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    // Try ISO first
    const iso = new Date(v);
    if (!isNaN(iso.getTime())) return iso;
    // Try DD/MM/YYYY
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const dd = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10) - 1;
      const yyyy = parseInt(m[3], 10);
      const d = new Date(yyyy, mm, dd);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
};

export function FollowUpQueue({ leads, onSendFollowUp, onRegisterCall, followUpsDoneToday = 0, followUpGoal = 20, onOpenChat, onCreateLead }: FollowUpQueueProps) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const [whatsLead, setWhatsLead] = useState<Lead | null>(null);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [noShowOnly, setNoShowOnly] = useState(false);
  const [suggestedMessage, setSuggestedMessage] = useState<string | null>(null);
  const { clinicMeta, currentClinic } = useAuth();
  const progress = Math.min((followUpsDoneToday / followUpGoal) * 100, 100);
  const [sharedLeadsMap, setSharedLeadsMap] = useState<Record<string, any>>({});
  const [showNewLeads, setShowNewLeads] = useState(false);
  const [tab, setTab] = useState<'pendentes' | 'feitos'>('pendentes');
  const [visibleCount, setVisibleCount] = useState(30);
  const PAGE_SIZE = 30;

  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = clinicMeta?.name || 'Clínica';
      const sheet = workbook.addWorksheet('FollowUp');

      sheet.columns = [
        { header: 'Nome', key: 'nome', width: 30 },
        { header: 'Data Criação', key: 'created', width: 14 },
        { header: 'Telefone', key: 'telefone', width: 18 },
        { header: 'Serviço', key: 'servico', width: 24 },
        { header: 'Etapa', key: 'etapa', width: 18 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Observação', key: 'observacao', width: 40 },
        { header: 'Último Follow-up', key: 'lastFollowUp', width: 14 },
        { header: 'Próx. Follow-up', key: 'dataFollowUp', width: 14 },
      ];

      filteredLeads.forEach((l) => {
        const createdRaw = l.createdAt || l.dataCriacao || l.dataCadastro || l.created || l.created_at || '';
        const lastRaw = l.lastFollowUpDone || '';
        const nextRaw = l.dataFollowUp || '';
        const createdDate = parseToDate(createdRaw);
        const lastDate = parseToDate(lastRaw);
        const nextDate = parseToDate(nextRaw);
        sheet.addRow([
          l.nome || '',
          createdDate,
          l.telefone || '',
          l.servicoProcurado || '',
          l.etapaLead || '',
          l.status || '',
          l.observacao || '',
          lastDate,
          nextDate,
        ]);
      });
      // Ensure date columns are formatted as dates in Excel
      try {
        sheet.getColumn(2).numFmt = 'dd/mm/yyyy'; // Data Criação
        sheet.getColumn(8).numFmt = 'dd/mm/yyyy'; // Último Follow-up
        sheet.getColumn(9).numFmt = 'dd/mm/yyyy'; // Próx. Follow-up
      } catch (e) {
        // ignore if column indices are not available yet
      }

      // Make header bold and add thin borders to all cells
      sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
        if (rowNumber === 1) row.font = { bold: true };
      });

      const buf = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const clinicNameSafe = (clinicMeta?.name || 'clinic').replace(/[^a-z0-9\-]/gi, '_');
      a.download = `followup_${clinicNameSafe}_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Erro ao gerar Excel: ' + (err as any)?.message || String(err));
    }
  };

  // Load crm_data/shared once to detect voucher flags that might be present
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sharedRef = doc(db, 'crm_data', 'shared');
        const snap = await getDoc(sharedRef);
        if (!mounted || !snap.exists()) return;
        const data = snap.data() || {};
        const arr = Array.isArray(data.leads) ? data.leads : [];
        const map: Record<string, any> = {};
        for (const l of arr) {
          if (!l) continue;
          if (l.id) map[`id:${l.id}`] = l;
          if (l.telefone) {
            const norm = (l.telefone || '').replace(/\D/g, '');
            if (norm) map[`tel:${norm}`] = l;
          }
        }
        setSharedLeadsMap(map);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);



  const today = useMemo(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }, []);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    // start from a shallow copy to avoid mutating props
    let list = leads.slice();
    // Oculta leads finalizados, desistentes e fora da região (apenas para aba Pendentes)
    const etapasOcultas = [
      "FINALIZADO", "FINALIZADA", "DESISTÊNCIA", "DESISTENCIA", "FORA DA REGIÃO", "FORA DA REGIAO"
    ];
    list = list.filter(l => !etapasOcultas.includes((l.etapaLead || '').toUpperCase()));

    if (term) {
      list = list.filter(
        (l) =>
          l.nome.toLowerCase().includes(term) ||
          l.telefone.includes(term)
      );
    }

    // filter by selected service
    if (selectedService) {
      list = list.filter((l) => (l.servicoProcurado || "") === selectedService);
    }

    // filter only not-showed
    if (noShowOnly) {
      list = list.filter((l) => l.dataAgendamento && l.comparecimento === "NÃO COMPARECEU");
    }

    return list;
  }, [leads, search, debouncedSearch, selectedService, noShowOnly]);

  // Lista para "Feitos Hoje" — sem filtro de etapa, pois o lead pode ter sido finalizado durante o follow-up
  const filteredLeadsSemEtapa = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = leads.slice();
    if (term) {
      list = list.filter(
        (l) =>
          l.nome.toLowerCase().includes(term) ||
          l.telefone.includes(term)
      );
    }
    if (selectedService) {
      list = list.filter((l) => (l.servicoProcurado || "") === selectedService);
    }
    return list;
  }, [leads, search, debouncedSearch, selectedService]);

  // Separa pendentes (não feitos hoje) de feitos hoje
  const pendentes = useMemo(() => {
    const OVERDUE_DAYS = 7;
    const list = filteredLeads.filter(l => l.lastFollowUpDone !== today);
    list.sort((a, b) => {
      const da = getDaysSince(a.lastFollowUpDone || a.dataFollowUp);
      const db_val = getDaysSince(b.lastFollowUpDone || b.dataFollowUp);
      const aOver = da > OVERDUE_DAYS ? 1 : 0;
      const bOver = db_val > OVERDUE_DAYS ? 1 : 0;
      if (aOver !== bOver) return bOver - aOver;
      if (da !== db_val) return db_val - da;
      return a.nome.localeCompare(b.nome);
    });
    return list;
  }, [filteredLeads, today]);

  // Reset visibleCount quando muda filtro ou aba
  const pendentesVisiveis = useMemo(() => pendentes.slice(0, visibleCount), [pendentes, visibleCount]);

  const feitosHoje = useMemo(() => {
    return filteredLeadsSemEtapa
      .filter(l => l.lastFollowUpDone === today)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filteredLeadsSemEtapa, today]);
  
  const handleConfirmFollowUp = (leadId: string, observacao: string, etapa?: LeadStage) => {
    onSendFollowUp(leadId, observacao, etapa);
    setSelectedLead(null);
  };

  const handleConfirmCall = (leadId: string, outcome: string, obs: string, returnDate?: string) => {
    onRegisterCall?.(leadId, outcome, obs, returnDate);
    setCallLead(null);
  };

  const handleWhatsAppClick = (lead: Lead) => {
    // Serviços elegíveis (com e sem acento, singular/plural, case-insensitive)
    const allowed = [
      "implante", "implantes",
      "faceta", "facetas",
      "protocolo", "protocolos",
      "prótese", "próteses",
      "protese", "proteses"
    ];
    const servico = (lead.servicoProcurado || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const isAllowed = allowed.some(s => {
      const sNorm = s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      return servico.includes(sNorm);
    });
    const days = getDaysSince(lead.lastFollowUpDone || lead.dataFollowUp);
    let amount = 0;
    if (days >= 90) amount = 500;
    else if (days >= 60) amount = 300;
    else if (days >= 30) amount = 200;
    setWhatsLead(lead);
    if (isAllowed && amount > 0) {
      // Calcular validade: 7 dias a partir de hoje
      const validade = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toLocaleDateString();
      })();
      // Mensagem especial para prótese
      const servicoNorm = (lead.servicoProcurado || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      const isProtese = ["protese", "proteses", "prótese", "próteses"].some(s => servicoNorm.includes(s));
      let msg = "";
      if (isProtese && amount === 200) {
        msg = `Olá ${lead.nome}, tudo bem? 💚✨\n\n\nVocê ganhou um cupom de desconto de R$200 para seu novo sorriso com prótese. \n\nPara garantir, responda EUQUERO até ${validade}. \n\nAproveite essa oportunidade! 💚💚`;
      } else {
        msg = `Olá ${lead.nome}, tudo bem? 💚✨\n\n\nVocê ganhou um cupom de desconto de R$${amount} para seu tratamento de ${lead.servicoProcurado}. \n\nPara garantir, responda EUQUERO até ${validade}. \n\nAproveite essa oportunidade! 💚💚`;
      }
      setSuggestedMessage(msg);
    } else {
      // prefills with follow-up template
      const template = getFollowUpMessage(lead.etapaLead);
      if (template) setSuggestedMessage(formatFollowUpMessage(template, lead.nome, lead.servicoProcurado));
      else setSuggestedMessage("");
    }
    setShowWhatsAppDialog(true);
  };

  const handleConfirmationClick = (lead: Lead) => {
    // Debug: log clinicMeta and currentClinic for troubleshooting address fallback
    // eslint-disable-next-line no-console
    console.log('[CONFIRM][clinicMeta]', clinicMeta);
    // eslint-disable-next-line no-console
    console.log('[CONFIRM][currentClinic]', currentClinic);
    const clinicForLookup = clinicMeta || (currentClinic ? { id: currentClinic, name: currentClinic } : undefined);
    // eslint-disable-next-line no-console
    console.log('[CONFIRM][clinicForLookup]', clinicForLookup);
    const message = generateAppointmentConfirmationTextForClinic(clinicForLookup, lead.dataAgendamento || "");
    setSuggestedMessage(message);
    setWhatsLead(lead);
    setShowWhatsAppDialog(true);
  };
  
  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        Fila de Follow-up
        <span className="ml-auto text-sm font-body text-muted-foreground">{pendentes.length} pendentes</span>
        <Button size="sm" variant="ghost" className="ml-3" onClick={() => setShowNewLeads(true)}>
          Novos leads
        </Button>
      </h3>

      {/* Aviso de backlog */}
      {pendentes.length > PAGE_SIZE && tab === 'pendentes' && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <span className="font-semibold">⚠️ {pendentes.length} leads no backlog.</span>
          <span>Exibindo os {Math.min(visibleCount, pendentes.length)} mais urgentes — foque neles hoje.</span>
        </div>
      )}

      {/* Abas Pendentes / Feitos Hoje */}
      <div className="flex gap-1 mb-4 bg-muted/40 rounded-lg p-1">
        <button
          onClick={() => setTab('pendentes')}
          className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
            tab === 'pendentes'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Pendentes
          {pendentes.length > 0 && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === 'pendentes' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
            }`}>{pendentes.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('feitos')}
          className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
            tab === 'feitos'
              ? 'bg-background shadow text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Feitos Hoje
          {feitosHoje.length > 0 && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === 'feitos' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
            }`}>{feitosHoje.length}</span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Filters: service + no-show */}
      <div className="flex gap-2 items-center mb-4">
        <select
          value={selectedService || ""}
          onChange={(e) => setSelectedService(e.target.value || null)}
          className="bg-slate-700 border-slate-600 text-white p-2 rounded"
        >
          <option value="">Filtrar por serviço (todos)</option>
          {Array.from(new Set(leads.map(l => l.servicoProcurado).filter(Boolean))).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={noShowOnly} onChange={(e) => setNoShowOnly(e.target.checked)} />
          <span className="text-muted-foreground">Apenas não compareceram</span>
        </label>
      </div>
      
      {/* Daily Goal Progress - Padronizado */}
      <div className="mb-4 p-4 rounded-lg bg-gradient-to-br from-amber-50 to-amber-50/50 border border-amber-200/50">
        <ProgressWithLabel
          label="Meta Diária de Follow-ups"
          current={followUpsDoneToday}
          goal={followUpGoal}
          icon={<Target className="h-4 w-4" />}
          variant="warning"
        />
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {tab === 'feitos' && feitosHoje.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum follow-up feito hoje ainda.</p>
        )}
        {tab === 'pendentes' && pendentes.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {search ? "Nenhum lead encontrado" : "Nenhum follow-up pendente 🎉"}
          </p>
        )}
        <AnimatePresence initial={false}>
          {(tab === 'pendentes' ? pendentesVisiveis : feitosHoje).map((lead, i) => {
              const daysSince = getDaysSince(lead.lastFollowUpDone || lead.dataFollowUp);
              
              return (
                <motion.div
                  key={lead.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-background/50 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{lead.nome}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        lead.status === "QUENTE" ? "bg-destructive/15 text-destructive" :
                        lead.status === "MORNO" ? "bg-warning/15 text-warning" :
                        "bg-info/15 text-info"
                      }`}>{lead.status}</span>
                      {(() => {
                        // Serviços elegíveis (com e sem acento, singular/plural, case-insensitive)
                        const allowed = [
                          "implante", "implantes",
                          "faceta", "facetas",
                          "protocolo", "protocolos",
                          "prótese", "próteses",
                          "protese", "proteses"
                        ];
                        const servico = (lead.servicoProcurado || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
                        const isAllowed = allowed.some(s => {
                          const sNorm = s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
                          return servico.includes(sNorm);
                        });
                        const days = getDaysSince(lead.lastFollowUpDone || lead.dataFollowUp);
                        let amount = 0;
                        if (days >= 90) amount = 500;
                        else if (days >= 60) amount = 300;
                        else if (days >= 30) amount = 200;
                        const show = isAllowed && amount > 0;
                        if (!show) return null;
                        return (
                          <span className={`text-[10px] ml-1 px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700`}>Voucher R${amount}</span>
                        );
                      })()}
                      {daysSince > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          daysSince >= 7 ? "bg-destructive/15 text-destructive" :
                          daysSince >= 4 ? "bg-warning/15 text-warning" :
                          "bg-muted/50 text-muted-foreground"
                        }`}>
                          Há {daysSince}d
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-mono text-muted-foreground">{lead.telefone}</span>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{lead.servicoProcurado}</span>
                      <span className="text-xs text-muted-foreground">• {lead.etapaLead}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="outline" className="h-8 w-8" title="Registrar Ligação" onClick={() => setCallLead(lead)}>
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 text-success border-success/30 hover:bg-success/10"
                      title="WhatsApp"
                      onClick={() => handleWhatsAppClick(lead)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    {lead.dataAgendamento && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-primary border-primary/30 hover:bg-primary/10"
                        title="Enviar Confirmação de Agendamento"
                        onClick={() => handleConfirmationClick(lead)}
                      >
                        <CalendarCheck className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      className="h-8 w-8 bg-primary hover:bg-primary/90"
                      title="Feito"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
        </AnimatePresence>
        {/* Botão carregar mais */}
        {tab === 'pendentes' && visibleCount < pendentes.length && (
          <button
            onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
            className="w-full mt-3 py-2 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 rounded-lg hover:border-muted-foreground/60 transition-colors"
          >
            Carregar mais {Math.min(PAGE_SIZE, pendentes.length - visibleCount)} leads ({pendentes.length - visibleCount} restantes)
          </button>
        )}
      </div>

      <FollowUpDialog
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onConfirm={handleConfirmFollowUp}
      />

      <CallLogDialog
        lead={callLead}
        open={!!callLead}
        onClose={() => setCallLead(null)}
        onConfirm={handleConfirmCall}
      />

      {whatsLead && showWhatsAppDialog && (
        <WhatsAppMessageDialog
          lead={whatsLead}
          open={showWhatsAppDialog}
          onClose={() => {
            setShowWhatsAppDialog(false);
            setSuggestedMessage(null);
          }}
          suggestedMessage={
            suggestedMessage ?? (() => {
              const template = getFollowUpMessage(whatsLead.etapaLead);
              if (template) return formatFollowUpMessage(template, whatsLead.nome, whatsLead.servicoProcurado);
              return "";
            })()
          }
        />
      )}

        {showNewLeads && (
          <NewLeadsPanel open={showNewLeads} onClose={() => setShowNewLeads(false)} onCreateLead={onCreateLead} />
        )}
      {/* Botão de imprimir - só aparece na tela */}
      <div className="flex items-center gap-2 mb-4">
        <Button onClick={handleExportExcel} className="print:hidden">
          Exportar Excel
        </Button>
      </div>
      {/* Cabeçalho para impressão */}
      <div className="print-header print-only:block hidden text-center mb-4">
        <h2 className="text-xl font-bold">{clinicMeta?.name || "Clínica"}</h2>
        <div className="font-semibold">Fila de Follow-up</div>
        <div className="print-total">Total de leads na fila: {pendentes.length + feitosHoje.length}</div>
        <div className="text-sm">Data: {new Date().toLocaleDateString()}</div>
      </div>
      {/* Tabela de impressão - só aparece na impressão */}
      <table className="print-table w-full border border-slate-300 text-xs mt-4 hidden print:table">
        <thead>
          <tr>
            <th className="border border-slate-300 p-2">Nome</th>
            <th className="border border-slate-300 p-2">Telefone</th>
            <th className="border border-slate-300 p-2">Serviço</th>
            <th className="border border-slate-300 p-2">Observação</th>
            <th className="border border-slate-300 p-2">Último Follow-up</th>
            <th className="border border-slate-300 p-2">Próx. Follow-up</th>
          </tr>
        </thead>
        <tbody>
          {[...pendentes, ...feitosHoje].map(lead => (
            <tr key={lead.id}>
              <td className="border border-slate-300 p-2">{lead.nome}</td>
              <td className="border border-slate-300 p-2">{lead.telefone}</td>
              <td className="border border-slate-300 p-2">{lead.servicoProcurado}</td>
              <td className="border border-slate-300 p-2">{lead.observacao}</td>
              <td className="border border-slate-300 p-2">{lead.lastFollowUpDone || lead.dataFollowUp}</td>
              <td className="border border-slate-300 p-2">{lead.dataFollowUp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
