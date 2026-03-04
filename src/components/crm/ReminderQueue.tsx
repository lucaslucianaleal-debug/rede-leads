import { Lead } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Bell, Phone, User, ExternalLink, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateWhatsAppLink } from "@/lib/whatsapp";

interface ReminderQueueProps {
  leads: Lead[];
  onMarkReminder: (leadId: string, type: "h24" | "h12" | "h3" | "h1") => void;
}

const reminderTypes = [
  { key: "h24" as const, label: "24h" },
  { key: "h12" as const, label: "12h" },
  { key: "h3" as const, label: "3h" },
  { key: "h1" as const, label: "1h" },
];

export function ReminderQueue({ leads, onMarkReminder }: ReminderQueueProps) {
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
                    const whatsLink = generateWhatsAppLink(lead.telefone, lead.nome, lead.servicoProcurado, lead.dataAgendamento, rt.label as any);
                    return (
                      <div key={rt.key} className="flex gap-0.5">
                        <a href={whatsLink} target="_blank" rel="noopener noreferrer">
                          <Button
                            size="sm"
                            variant={sent ? "default" : "outline"}
                            className={`text-xs h-7 ${sent ? "bg-success hover:bg-success/90 text-white" : ""}`}
                            disabled={sent}
                          >
                            {sent ? (
                              <Check className="h-3 w-3 mr-1" />
                            ) : (
                              <ExternalLink className="h-3 w-3 mr-1" />
                            )}
                            {rt.label}
                          </Button>
                        </a>
                        {!sent && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 hover:bg-success/10 hover:text-success"
                            onClick={() => onMarkReminder(lead.id, rt.key)}
                            title={`Marcar ${rt.label} como enviado`}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
