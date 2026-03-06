import { Lead } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Bell, Phone, User, ExternalLink, Check, Bot, CheckCircle, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateReminderText } from "@/lib/whatsapp";
import { format } from "date-fns";

interface ReminderQueueProps {
  leads: Lead[];
  onMarkReminder: (leadId: string, type: "h24" | "today") => void;
  onOpenChat?: (phone: string, message?: string) => void;
}

const reminderTypes = [
  { key: "h24" as const, label: "24h antes" },
  { key: "today" as const, label: "Hoje" },
];

export function ReminderQueue({ leads, onMarkReminder, onOpenChat }: ReminderQueueProps) {
  // Helper function to format robot-sent timestamp
  const formatRobotSendTime = (isoTimestamp: string | null | undefined): string | null => {
    if (!isoTimestamp) return null;
    try {
      const date = new Date(isoTimestamp);
      return format(date, "HH:mm");
    } catch {
      return null;
    }
  };

  // Check if reminder was sent automatically by robot for a specific slot
  const getRobotReminderStatus = (lead: Lead, slot: "24h" | "today") => {
    const sent = lead.lembretes?.sent;
    if (!sent) return { isSent: false, timestamp: null, timeStr: null };
    
    const slotKey = slot === "24h" ? "24h" : "today" === "today" ? "today" : "24h";
    const timestamp = sent[slotKey as "24h" | "12h" | "3h" | "1h"];
    const timeStr = formatRobotSendTime(timestamp);
    
    return {
      isSent: !!timestamp,
      timestamp,
      timeStr
    };
  };

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
        <Bell className="h-5 w-5 text-warning" />
        Lembretes de Agendamento
        <span className="ml-auto text-sm font-body text-muted-foreground">{leads.length} leads</span>
      </h3>
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        <AnimatePresence>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum agendamento pendente</p>
          ) : (
            leads.map((lead, i) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="p-3 rounded-lg bg-background/50 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-sm">{lead.nome}</span>
                  <span className="text-xs text-muted-foreground ml-auto">📅 {lead.dataAgendamento}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-mono text-muted-foreground">{lead.telefone}</span>
                  <span className="text-xs text-muted-foreground">• {lead.servicoProcurado}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {reminderTypes.map((rt) => {
                    const sent = lead.lembretes[rt.key];
                    const robotStatus = getRobotReminderStatus(lead, rt.key);
                    const isSent = sent || robotStatus.isSent;
                    
                    return (
                      <div key={rt.key} className="flex flex-col gap-0.5">
                        <Button
                          size="sm"
                          variant={isSent ? "default" : "outline"}
                          className={`text-xs h-7 ${
                            robotStatus.isSent
                              ? rt.key === "h24"
                                ? "bg-green-500 hover:bg-green-600 text-white"
                                : "bg-blue-500 hover:bg-blue-600 text-white"
                              : ""
                          }`}
                          onClick={() => {
                            const msg = generateReminderText(lead.dataAgendamento || "", rt.key);
                            onOpenChat?.(lead.telefone, msg);
                          }}
                        >
                          {isSent ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {rt.label}
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-3 w-3 mr-1" />
                              {rt.label}
                            </>
                          )}
                        </Button>
                        
                        {/* Robot Send Status */}
                        {robotStatus.isSent && robotStatus.timeStr && (
                          <div className="flex items-center gap-1 text-xs ml-1 px-2 py-1 rounded bg-emerald-50">
                            <Bot className="h-3 w-3 text-emerald-600" />
                            <span className="text-emerald-600 text-xs">Enviado às {robotStatus.timeStr}</span>
                          </div>
                        )}

                        {/* Manual Mark Button (only if not by robot) */}
                        {!robotStatus.isSent && !sent && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs hover:bg-success/10 hover:text-success"
                            onClick={() => onMarkReminder(lead.id, rt.key)}
                            title={`Marcar ${rt.label} como enviado`}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Marcar
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Automation Status Badge */}
                {(() => {
                  const robot24h = getRobotReminderStatus(lead, "24h");
                  const robotToday = getRobotReminderStatus(lead, "today");
                  
                  if (robot24h.isSent || robotToday.isSent) {
                    return (
                      <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded flex items-start gap-2 text-xs">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span className="text-emerald-700">
                          <strong>✓ Automação ativa:</strong> Robô enviou lembrete(s). Clique acima para reenviar se necessário.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
