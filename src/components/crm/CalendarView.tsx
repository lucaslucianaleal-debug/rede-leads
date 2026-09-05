import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Lead } from "@/types/crm";
import React, { useMemo } from "react";
import { format } from "date-fns";
import { Bell, CheckCircle2, Clock3, MoreHorizontal, Phone, Send, X } from "lucide-react";
import { toast } from "sonner";
import { WhatsAppMessageDialog } from "./WhatsAppMessageDialog";

interface CalendarViewProps {
  leads: Lead[];
  onMarkReminder: (id: string, type: "h24" | "today") => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => void;
  onOpenChat?: (phone: string, message?: string) => void;
  compact?: boolean;
}

type ReminderType = "h24" | "today";
type ReminderVisualState = "sent" | "scheduled" | "pending" | "not-applicable";

type ReminderVisualStatus = {
  state: ReminderVisualState;
  title: string;
  detail: string;
};

const reminderStatusStyles: Record<ReminderVisualState, string> = {
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  "not-applicable": "border-border bg-muted/40 text-muted-foreground",
};

export function CalendarView({ leads, onMarkReminder, onUpdateLead, onOpenChat, compact = false }: CalendarViewProps) {
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
  const [whatsReminderType, setWhatsReminderType] = React.useState<ReminderType | null>(null);
  const [showWhatsDialog, setShowWhatsDialog] = React.useState(false);

  const handleManualReminder = (lead: Lead, type: ReminderType) => {
    setWhatsLead(lead);
    setWhatsReminderType(type);
    setShowWhatsDialog(true);
  };

  const parseAppointment = (dateStr?: string): Date | null => {
    const match = String(dateStr || "").match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, day, month, year, hour, minute] = match;
    const value = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    return Number.isNaN(value.getTime()) ? null : value;
  };

  const getReminderStatus = (lead: Lead, type: ReminderType): ReminderVisualStatus => {
    const sentAt = type === "h24"
      ? lead.lembretes?.sent?.["24h"]
      : lead.lembretes?.sent?.today;
    const markedAsSent = type === "h24" ? lead.lembretes?.h24 : lead.lembretes?.today;

    if (sentAt || markedAsSent) {
      return {
        state: "sent",
        title: "Enviado",
        detail: sentAt ? format(new Date(sentAt), "dd/MM 'às' HH:mm") : "Horário não registrado",
      };
    }

    const appointment = parseAppointment(lead.dataAgendamento);
    if (!appointment) {
      return { state: "not-applicable", title: "Sem registro", detail: "Data inválida" };
    }

    const sendAt = type === "h24"
      ? new Date(appointment.getTime() - 24 * 60 * 60 * 1000)
      : new Date(appointment.getFullYear(), appointment.getMonth(), appointment.getDate(), 8, 0, 0, 0);

    if (sendAt.getTime() >= appointment.getTime()) {
      return { state: "not-applicable", title: "Não se aplica", detail: "Fora da janela" };
    }

    if (Date.now() < sendAt.getTime()) {
      return {
        state: "scheduled",
        title: "Programado",
        detail: format(sendAt, "dd/MM 'às' HH:mm"),
      };
    }

    const appointmentDayStart = new Date(
      appointment.getFullYear(),
      appointment.getMonth(),
      appointment.getDate(),
      0,
      0,
      0,
      0,
    );
    const windowClosed = type === "h24"
      ? Date.now() >= appointmentDayStart.getTime()
      : Date.now() >= appointment.getTime();

    if (windowClosed) {
      return { state: "not-applicable", title: "Não enviado", detail: "Janela encerrada" };
    }

    return { state: "pending", title: "Aguardando", detail: "Envio automático" };
  };

  const handleMarkAbsent = (lead: Lead) => {
    onUpdateLead?.(lead.id, { lembretes: { ...lead.lembretes, disabled: true } });
    toast.info(`✗ ${lead.nome} — Marcado como desistência`);
  };

  const renderLeadCard = (lead: Lead, isToday: boolean) => {
    const hora = lead.dataAgendamento?.split(" ")[1] || "09:00";
    const [h, m] = hora.split(":");
    const dayLabel = isToday ? "HOJE" : "AMANHÃ";
    const reminder24h = getReminderStatus(lead, "h24");
    const reminderToday = getReminderStatus(lead, "today");

    const renderReminderStatus = (label: string, status: ReminderVisualStatus) => {
      const StatusIcon = status.state === "sent" ? CheckCircle2 : Clock3;

      return (
        <div
          className={`min-w-[112px] rounded-lg border px-2.5 py-1.5 ${reminderStatusStyles[status.state]}`}
          title={`${label}: ${status.title} — ${status.detail}`}
        >
          <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide opacity-80">
            <StatusIcon className="h-3 w-3" />
            {label}
          </div>
          <div className="mt-0.5 text-xs font-semibold leading-tight">{status.title}</div>
          <div className="text-[10px] leading-tight opacity-80">{status.detail}</div>
        </div>
      );
    };

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

        {/* Status dos lembretes */}
        <div className="flex items-center gap-1.5 shrink-0">
          {renderReminderStatus("24h antes", reminder24h)}
          {renderReminderStatus("No dia", reminderToday)}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground"
                title="Mais opções"
                aria-label={`Mais opções para ${lead.nome}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Envio manual</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleManualReminder(lead, "h24")}>
                <Send className="mr-2 h-4 w-4" />
                Lembrete de 24h
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleManualReminder(lead, "today")}>
                <Send className="mr-2 h-4 w-4" />
                Lembrete do dia
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
    <div className={`glass-card rounded-xl p-5 ${compact ? "h-full min-h-0 flex flex-col" : ""}`}>
      {/* Título — idêntico ao FollowUpQueue */}
      <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2 shrink-0">
        <Bell className="h-5 w-5 text-primary" />
        Lembretes de Agendamento
        <span className="ml-auto text-sm font-body text-muted-foreground">{relevantLeads.length} agendamentos</span>
      </h3>

      <div className={`${compact ? "flex-1 min-h-0" : "max-h-[500px]"} overflow-y-auto space-y-0`}>
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
      {whatsLead && whatsReminderType && showWhatsDialog && (
        <WhatsAppMessageDialog
          lead={whatsLead}
          open={showWhatsDialog}
          onClose={() => {
            setShowWhatsDialog(false);
            setWhatsReminderType(null);
          }}
          suggestedMessage={
            whatsReminderType === "h24"
              ? getReminder24h(whatsLead)
              : getReminder1h(whatsLead)
          }
          onDone={() => {
            if (whatsLead) {
              onMarkReminder(whatsLead.id, whatsReminderType);
              toast.success(`✓ ${whatsLead.nome} — Lembrete enviado!`);
            }
            setShowWhatsDialog(false);
            setWhatsReminderType(null);
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
