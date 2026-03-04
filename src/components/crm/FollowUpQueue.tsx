import { useState } from "react";
import { Lead } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Send, Phone, User, ExternalLink, Check, Target } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateFollowUpWhatsAppLink } from "@/lib/whatsapp";
import { FollowUpDialog } from "./FollowUpDialog";
import { CallLogDialog } from "./CallLogDialog";
import { WhatsAppMessageDialog } from "./WhatsAppMessageDialog";
import { getFollowUpMessage, formatFollowUpMessage } from "@/data/followUpMessages";

interface FollowUpQueueProps {
  leads: Lead[];
  onSendFollowUp: (leadId: string, observacao?: string) => void;
  onRegisterCall?: (leadId: string, outcome: string, obs: string) => void;
  followUpsDoneToday?: number;
  followUpGoal?: number;
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

export function FollowUpQueue({ leads, onSendFollowUp, onRegisterCall, followUpsDoneToday = 0, followUpGoal = 20 }: FollowUpQueueProps) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const [whatsappLead, setWhatsappLead] = useState<Lead | null>(null);
  const [suggestedMessage, setSuggestedMessage] = useState<string>("");
  const progress = Math.min((followUpsDoneToday / followUpGoal) * 100, 100);
  
  const handleConfirmFollowUp = (leadId: string, observacao: string) => {
    onSendFollowUp(leadId, observacao);
    setSelectedLead(null);
  };

  const handleConfirmCall = (leadId: string, outcome: string, obs: string) => {
    onRegisterCall?.(leadId, outcome, obs);
    setCallLead(null);
  };

  const handleWhatsAppClick = (lead: Lead) => {
    const template = getFollowUpMessage(lead.etapaLead);
    if (template) {
      // Follow-Up 3+: show suggested message
      const formatted = formatFollowUpMessage(
        template,
        lead.nome,
        lead.servicoProcurado
      );
      setSuggestedMessage(formatted);
    } else {
      // Follow-Up 1-2: empty message, user types
      setSuggestedMessage("");
    }
    setWhatsappLead(lead);
  };
  
  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        Fila de Follow-up
        <span className="ml-auto text-sm font-body text-muted-foreground">{leads.length} leads</span>
      </h3>
      
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
        <AnimatePresence>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum follow-up pendente 🎉</p>
          ) : (
            leads.map((lead, i) => {
              const daysSince = getDaysSince(lead.dataFollowUp);
              
              return (
                <motion.div
                  key={lead.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-lg bg-background/50 hover:bg-muted/50 transition-colors"
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
                  <div className="flex flex-col sm:flex-row flex-wrap gap-1 shrink-0 w-full sm:w-auto">
                    <Button size="sm" variant="outline" onClick={() => setCallLead(lead)}>
                      <Phone className="h-3.5 w-3.5 mr-1" />
                      Registrar Ligação
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleWhatsAppClick(lead)}
                      className="text-success border-success/30 hover:bg-success/10"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      WhatsApp
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => setSelectedLead(lead)}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Feito
                    </Button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
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

      <WhatsAppMessageDialog
        lead={whatsappLead}
        open={!!whatsappLead}
        onClose={() => setWhatsappLead(null)}
        onDone={() => {
          if (whatsappLead) onSendFollowUp(whatsappLead.id, "");
          setWhatsappLead(null);
        }}
        suggestedMessage={suggestedMessage}
      />
    </div>
  );
}
