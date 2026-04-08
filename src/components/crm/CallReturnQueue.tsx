import { useState } from "react";
import { Lead } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { PhoneCall, User, Phone, X, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CallLogDialog } from "./CallLogDialog";
import { formatPhoneNumber } from "@/lib/phone";

interface CallReturnQueueProps {
  leads: Lead[];
  onRegisterCall: (leadId: string, outcome: string, obs: string, returnDate?: string, nextStage?: import("@/types/crm").LeadStage) => void;
  onClearReturn: (leadId: string) => void;
}

function isOverdue(dataRetornoLigacao: string): boolean {
  const parts = dataRetornoLigacao.split(" ");
  const [day, month, year] = parts[0].split("/");
  const [hour, minute] = (parts[1] || "00:00").split(":");
  const returnDt = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  return returnDt <= new Date();
}

export function CallReturnQueue({ leads, onRegisterCall, onClearReturn }: CallReturnQueueProps) {
  const [callLead, setCallLead] = useState<Lead | null>(null);
  const overdueCount = leads.filter((l) => isOverdue(l.dataRetornoLigacao)).length;

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
        <PhoneCall className="h-5 w-5 text-warning" />
        Retornos de Ligação
        {overdueCount > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">
            {overdueCount} vencido{overdueCount > 1 ? "s" : ""}
          </span>
        )}
        <span className="ml-auto text-sm font-body text-muted-foreground">{leads.length} agendado{leads.length !== 1 ? "s" : ""}</span>
      </h3>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        <AnimatePresence>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum retorno pendente 🎉</p>
          ) : (
            leads.map((lead, i) => {
              const overdue = isOverdue(lead.dataRetornoLigacao);
              return (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ delay: i * 0.03 }}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  overdue
                    ? "bg-destructive/5 border-destructive/25 hover:bg-destructive/10"
                    : "bg-warning/5 border-warning/20 hover:bg-warning/10"
                }`}
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
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatPhoneNumber(lead.telefone)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <Clock className={`h-3 w-3 shrink-0 ${overdue ? "text-destructive" : "text-warning"}`} />
                    <span className={`text-xs font-medium ${overdue ? "text-destructive" : "text-warning"}`}>
                      {overdue ? "Vencido — " : "Retornar às "}
                      {lead.dataRetornoLigacao?.split(" ")[1]}
                      {" — "}
                      {lead.dataRetornoLigacao?.split(" ")[0]}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    className={`h-8 w-8 ${overdue ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : "bg-warning hover:bg-warning/90 text-warning-foreground"}`}
                    title="Registrar ligação de retorno"
                    onClick={() => setCallLead(lead)}
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:border-destructive/30"
                    title="Descartar retorno"
                    onClick={() => onClearReturn(lead.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      <CallLogDialog
        lead={callLead}
        open={!!callLead}
        onClose={() => setCallLead(null)}
        onConfirm={(leadId, outcome, obs, returnDate, nextStage) => {
          onRegisterCall(leadId, outcome, obs, returnDate, nextStage);
          // Se não agendou novo retorno, limpa o atual
          if (!returnDate) onClearReturn(leadId);
          setCallLead(null);
        }}
      />
    </div>
  );
}
