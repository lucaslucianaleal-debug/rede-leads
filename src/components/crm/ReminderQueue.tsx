import { Lead } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Bell, Phone, User, ExternalLink, Check, Bot, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateReminderText } from "@/lib/whatsapp";
import { format } from "date-fns";
import { useMemo } from "react";

interface ReminderQueueProps {
  leads: Lead[];
  onMarkReminder: (leadId: string, type: "h24" | "today") => void;
  onOpenChat?: (phone: string, message?: string) => void;
}

const reminderTypes = [
  { key: "h24" as const, label: "Amanhã" },
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

  // Parse appointment string (dd/MM/yyyy HH:mm) to Date
  const parseAppointment = (dateStr: string): Date | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
      const [datePart, timePart] = dateStr.split(' ');
      const [day, month, year] = datePart.split('/').map(Number);
      const [hour = 0, minute = 0] = (timePart || '00:00').split(':').map(Number);
      return new Date(year, month - 1, day, hour, minute, 0, 0);
    } catch {
      return null;
    }
  };

  // Calculate slot times for appointment
  const computeSlots = (appointmentDate: Date) => {
    return {
      '24h': new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000),
      '12h': new Date(appointmentDate.getTime() - 12 * 60 * 60 * 1000),
      '3h': new Date(appointmentDate.getTime() - 3 * 60 * 60 * 1000),
      '1h': new Date(appointmentDate.getTime() - 60 * 60 * 1000),
    };
  };

  // Format time until next send
  const formatTimeUntilSend = (slotTime: Date): string => {
    const now = new Date();
    const diff = slotTime.getTime() - now.getTime();
    
    if (diff < 0) return "Vencido";
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `em ${hours}h${minutes}m`;
    if (minutes > 0) return `em ${minutes}m`;
    return "agora";
  };

  // Get next scheduled send for a slot
  const getNextScheduledSend = (lead: Lead, slot: "24h" | "today"): { time: Date | null; timeStr: string | null } => {
    const sent = lead.lembretes?.sent;
    if (!sent) return { time: null, timeStr: null };
    
    // If already sent, return null
    if (sent[slot === "24h" ? "24h" : "today" === "today" ? "today" : "24h"]) {
      return { time: null, timeStr: null };
    }

    // Calculate when it's scheduled to send
    const appointment = parseAppointment(lead.dataAgendamento || "");
    if (!appointment) return { time: null, timeStr: null };

    const slots = computeSlots(appointment);
    const slotKey = slot === "24h" ? "24h" : "today" === "today" ? "today" : "24h";
    const slotTime = slots[slotKey as "24h" | "12h" | "3h" | "1h"];

    if (!slotTime) return { time: null, timeStr: null };

    const now = new Date();
    if (now < slotTime) {
      return {
        time: slotTime,
        timeStr: `⏰ Automação agendada para ${format(slotTime, "dd/MM HH:mm")}`
      };
    }

    return { time: null, timeStr: null };
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
                    const nextScheduled = getNextScheduledSend(lead, rt.key);
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
                            const firstName = (lead.nome || "").split(" ")[0];
                            const msg = generateReminderText(lead.dataAgendamento || "", rt.key, firstName);
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
                        
                        {/* Robot Send Status (Past) */}
                        {robotStatus.isSent && robotStatus.timeStr && (
                          <div className="flex items-center gap-1 text-xs ml-1 px-2 py-1 rounded bg-emerald-50">
                            <Bot className="h-3 w-3 text-emerald-600" />
                            <span className="text-emerald-600 text-xs">Enviado às {robotStatus.timeStr}</span>
                          </div>
                        )}

                        {/* Scheduled Future Send (Future) */}
                        {!isSent && nextScheduled.timeStr && (
                          <div className="flex items-center gap-1 text-xs ml-1 px-2 py-1 rounded bg-blue-50 border border-blue-200">
                            <Clock className="h-3 w-3 text-blue-600 animate-pulse" />
                            <span className="text-blue-600 text-xs font-medium">{nextScheduled.timeStr}</span>
                          </div>
                        )}

                        {/* Manual Mark Button (only if not by robot and not scheduled) */}
                        {!robotStatus.isSent && !sent && !nextScheduled.timeStr && (
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
                  const next24h = getNextScheduledSend(lead, "24h");
                  const nextToday = getNextScheduledSend(lead, "today");
                  
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
                  
                  if (next24h.timeStr || nextToday.timeStr) {
                    return (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded flex items-start gap-2 text-xs">
                        <Clock className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0 animate-pulse" />
                        <span className="text-blue-700">
                          <strong>⏳ Automação agendada:</strong> O robô enviará lembrete(s) de acordo com a programação.
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
