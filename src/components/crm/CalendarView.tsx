import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lead } from "@/types/crm";
import React, { useMemo } from "react";
import { format } from "date-fns";
import { Bell, Clock, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { WhatsAppMessageDialog } from "./WhatsAppMessageDialog";
import { generateAppointmentConfirmationText } from "@/lib/whatsapp";

interface CalendarViewProps {
  leads: Lead[];
  onMarkReminder: (id: string, type: "h24" | "today") => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => void;
  onOpenChat?: (phone: string, message?: string) => void;
}

export function CalendarView({ leads, onMarkReminder, onUpdateLead, onOpenChat }: CalendarViewProps) {
  const now = new Date();
  const todayStr = format(now, "dd/MM/yyyy");
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowStr = format(tomorrowDate, "dd/MM/yyyy");

  // Filtrar apenas leads de hoje e amanhã
  const relevantLeads = useMemo(
    () =>
      leads.filter(
        (l) =>
          l.dataAgendamento?.startsWith(todayStr) ||
          l.dataAgendamento?.startsWith(tomorrowStr)
      ),
    [leads, todayStr, tomorrowStr]
  );

  // Separar por dia
  const parseAppointmentTime = (dateStr?: string) => {
    if (!dateStr) return 0;
    const parts = dateStr.split(" ");
    const time = parts[1] || "00:00";
    const [h = "0", m = "0"] = time.split(":");
    return parseInt(h || "0") * 60 + parseInt(m || "0");
  };

  const todayLeads = relevantLeads
    .filter((l) => l.dataAgendamento?.startsWith(todayStr))
    .sort((a, b) => parseAppointmentTime(a.dataAgendamento) - parseAppointmentTime(b.dataAgendamento));

  const tomorrowLeads = relevantLeads
    .filter((l) => l.dataAgendamento?.startsWith(tomorrowStr))
    .sort((a, b) => parseAppointmentTime(a.dataAgendamento) - parseAppointmentTime(b.dataAgendamento));

  // Textos fixos dos lembretes
  const getReminder24h = (lead: Lead): string => {
    const data = lead.dataAgendamento?.split(" ")[0] || "[Data]";
    const hora = lead.dataAgendamento?.split(" ")[1] || "[Horário]";
    const firstName = (lead.nome || "").split(" ")[0] || "!";
    return (
      `Olá, ${firstName}! Tudo bem?\n\n` +
      `Passando para lembrar da sua consulta aqui na OdontoCompany amanhã, dia ${data}, às ${hora}.\n\n` +
      `Já deixamos tudo reservado para o seu atendimento.\n\n` +
      `Até amanhã! 🦷💚`
    );
  };

  const getReminder1h = (lead: Lead): string => {
    const hora = lead.dataAgendamento?.split(" ")[1] || "[Horário]";
    const firstName = (lead.nome || "").split(" ")[0] || "!";
    return (
      `Bom dia, ${firstName}!\n\n` +
      `Tudo certo para o seu horário hoje às ${hora} aqui na OdontoCompany?\n\n` +
      `Já estamos com sua sala preparada e te aguardando.\n\n` +
      `Até logo! 💚✨`
    );
  };

  const [whatsLead, setWhatsLead] = React.useState<Lead | null>(null);
  const [showWhatsDialog, setShowWhatsDialog] = React.useState(false);

  const handleSend24h = (lead: Lead) => {
    // Open local popup to edit/send reminder (prefilled)
    setWhatsLead(lead);
    setShowWhatsDialog(true);
    // onMarkReminder will be called after send via onDone
  };

  const handleSend1h = (lead: Lead) => {
    setWhatsLead(lead);
    setShowWhatsDialog(true);
  };

  const handleMarkAbsent = (lead: Lead) => {
    onUpdateLead?.(lead.id, { lembretes: { ...lead.lembretes, disabled: true } });
    toast.info(`✗ ${lead.nome} — Marcado como desistência`);
  };

  const renderLeadCard = (lead: Lead, isToday: boolean) => {
    const hora = lead.dataAgendamento?.split(" ")[1] || "09:00";
    const [h, m] = hora.split(":");
    const dayLabel = isToday ? "HOJE" : "AMANHÃ";

    return (
      <div
        key={lead.id}
        className="flex items-center gap-3 p-3 rounded-lg bg-background/50 hover:bg-muted/50 transition-colors"
      >
        {/* Horário */}
        <span className="text-xl font-bold text-primary tabular-nums leading-none shrink-0 w-14 text-center">
          {h}:{m}
        </span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{lead.nome}</span>
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0.5 font-medium ${
                isToday
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}
            >
              {dayLabel}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span>{lead.servicoProcurado || "Consulta"}</span>
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {lead.telefone}
            </span>
          </div>
        </div>

        {/* Botões de ação */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={() => handleSend24h(lead)}
            className="h-8 px-2.5 bg-green-100 hover:bg-green-200 text-green-800 text-xs font-semibold border border-green-300"
            variant="outline"
            title="Enviar lembrete Amanhã"
          >
            📱 Amanhã
          </Button>
          <Button
            size="sm"
            onClick={() => handleSend1h(lead)}
            className="h-8 px-2.5 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-semibold border border-blue-300"
            variant="outline"
            title="Enviar lembrete Hoje"
          >
            📱 Hoje
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-700 text-muted-foreground"
            onClick={() => handleMarkAbsent(lead)}
            title="Marcar como desistência"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-card rounded-xl p-5 flex flex-col h-full">
      {/* Título — idêntico ao FollowUpQueue */}
      <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2 shrink-0">
        <Bell className="h-5 w-5 text-primary" />
        Lembretes de Agendamento
        <span className="ml-auto text-sm font-body text-muted-foreground">{relevantLeads.length} agendamentos</span>
      </h3>

      <div className="flex-1 overflow-y-auto space-y-0 min-h-0">
      {/* HOJE */}
      {todayLeads.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            📅 Hoje ({todayLeads.length})
          </p>
          <div className="space-y-2">
            {todayLeads.map((lead) => renderLeadCard(lead, true))}
          </div>
        </div>
      )}

      {/* AMANHÃ */}
      {tomorrowLeads.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            📅 Amanhã ({tomorrowLeads.length})
          </p>
          <div className="space-y-2">
            {tomorrowLeads.map((lead) => renderLeadCard(lead, false))}
          </div>
        </div>
      )}
      </div>

      {whatsLead && showWhatsDialog && (
        <WhatsAppMessageDialog
          lead={whatsLead}
          open={showWhatsDialog}
          onClose={() => setShowWhatsDialog(false)}
          suggestedMessage={(() => {
            // choose template based on whether it's today or tomorrow
            const tomorrow = whatsLead.dataAgendamento?.startsWith(tomorrowStr);
            return tomorrow ? getReminder24h(whatsLead) : getReminder1h(whatsLead);
          })()}
          onDone={() => {
            if (whatsLead) {
              // determine type
              const isTomorrow = whatsLead.dataAgendamento?.startsWith(tomorrowStr);
              onMarkReminder(whatsLead.id, isTomorrow ? "h24" : "today");
              toast.success(`✓ ${whatsLead.nome} — Lembrete enviado!`);
            }
            setShowWhatsDialog(false);
          }}
        />
      )}

      {/* Vazio */}
      {relevantLeads.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          📭 Nenhum agendamento para hoje ou amanhã
        </p>
      )}
    </div>
  );
}
