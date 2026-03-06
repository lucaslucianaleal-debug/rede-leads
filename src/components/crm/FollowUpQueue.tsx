import { useState, useMemo } from "react";
import { Lead } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Phone, User, ExternalLink, Check, Target, Search, X, CalendarCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateAppointmentConfirmationText } from "@/lib/whatsapp";
import { normalizePhoneTo11Digits } from "@/lib/phone";
import { FollowUpDialog } from "./FollowUpDialog";
import { CallLogDialog } from "./CallLogDialog";
import { getFollowUpMessage, formatFollowUpMessage } from "@/data/followUpMessages";

interface FollowUpQueueProps {
  leads: Lead[];
  onSendFollowUp: (leadId: string, observacao?: string) => void;
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string) => void;
  followUpsDoneToday?: number;
  followUpGoal?: number;
  onOpenChat?: (phone: string, message?: string) => void;
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

export function FollowUpQueue({ leads, onSendFollowUp, onRegisterCall, followUpsDoneToday = 0, followUpGoal = 20, onOpenChat }: FollowUpQueueProps) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const progress = Math.min((followUpsDoneToday / followUpGoal) * 100, 100);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter(
      (l) =>
        l.nome.toLowerCase().includes(term) ||
        l.telefone.replace(/\D/g, "").includes(term.replace(/\D/g, ""))
    );
  }, [leads, search]);
  
  const handleConfirmFollowUp = (leadId: string, observacao: string) => {
    onSendFollowUp(leadId, observacao);
    setSelectedLead(null);
  };

  const handleConfirmCall = (leadId: string, outcome: string, obs: string, returnDate?: string) => {
    onRegisterCall?.(leadId, outcome, obs, returnDate);
    setCallLead(null);
  };

  const handleWhatsAppClick = (lead: Lead) => {
    const template = getFollowUpMessage(lead.etapaLead);
    const message = template ? formatFollowUpMessage(template, lead.nome, lead.servicoProcurado) : undefined;
    const normalizedPhone = normalizePhoneTo11Digits(lead.telefone);
    onOpenChat?.(normalizedPhone, message);
  };

  const handleConfirmationClick = (lead: Lead) => {
    const message = generateAppointmentConfirmationText(lead.dataAgendamento || "");
    const normalizedPhone = normalizePhoneTo11Digits(lead.telefone);
    onOpenChat?.(normalizedPhone, message);
  };
  
  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        Fila de Follow-up
        <span className="ml-auto text-sm font-body text-muted-foreground">{leads.length} leads</span>
      </h3>

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
      
      {/* Daily Goal Progress */}
      <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Meta Diária</span>
          </div>
          <span className="text-sm font-bold">
            {followUpsDoneToday}/{followUpGoal}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              progress >= 100 ? 'bg-success' : 'bg-primary'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filteredLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {search ? "Nenhum lead encontrado" : "Nenhum follow-up pendente 🎉"}
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {filteredLeads.map((lead, i) => {
              const daysSince = getDaysSince(lead.dataFollowUp);
              
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
    </div>
  );
}
