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

type ReminderType = "24h" | "12h" | "1h";
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

const SLOT_HOURS: Record<ReminderType, { start: number; end: number }> = {
  "24h": { start: 24, end: 12 },
  "12h": { start: 12, end: 1 },
  "1h": { start: 1, end: 0 },
};

export function CalendarView({ leads, onMarkReminder, onUpdateLead, compact = false }: CalendarViewProps) {
  const now = new Date();
  const todayStr = format(now, "dd/MM/yyyy");
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowStr = format(tomorrowDate, "dd/MM/yyyy");

  const relevantLeads = useMemo(
    () =>
      leads.filter(
        (l) =>
          l.dataAgendamento?.startsWith(todayStr) ||
          l.dataAgendamento?.startsWith(tomorrowStr)
      ),
    [leads, todayStr, tomorrowStr]
  );

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

  const getReminderMessage = (lead: Lead, type: ReminderType): string => {
    const data = lead.dataAgendamento?.split(" ")[0] || "[Data]";
    const hora = lead.dataAgendamento?.split(" ")[1] || "[Horário]";
    const firstName = (lead.nome || "").trim().split(/\s+/)[0] || "";

    if (type === "24h") {
      return (
        `Olá, ${firstName}! Tudo bem?\n\n` +
        `Passando para lembrar da sua consulta na OdontoCompany Olímpia amanhã, dia ${data}, às ${hora}.\n\n` +
        `Já deixamos tudo reservado para o seu atendimento.\n\n` +
        `Até amanhã! 🦷💚`
      );
    }

    if (type === "12h") {
      return (
        `Olá, ${firstName}! Tudo bem?\n\n` +
        `Só reforçando o seu horário na OdontoCompany Olímpia: ${data}, às ${hora}.\n\n` +
        `Seu atendimento está reservado e estaremos te aguardando. 💚`
      );
    }

    return (
      `Olá, ${firstName}! 💚\n\n` +
      `Seu horário na OdontoCompany Olímpia é daqui a 1 hora, às ${hora}.\n\n` +
      `Já estamos preparando sua sala e te aguardamos por aqui.\n\n` +
      `Até já! ✨`
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
    const sentAt = lead.lembretes?.sent?.[type];
    const legacySent = type === "24h"
      ? lead.lembretes?.h24
      : type === "1h"
        ? lead.lembretes?.today
        : false;

    if (sentAt || legacySent) {
      return {
        state: "sent",
        title: "Enviado",
        detail: sentAt ? format(new Date(sentAt), "dd/MM 'às' HH:mm") : "Registro anterior",
      };
    }

    const appointment = parseAppointment(lead.dataAgendamento);
    if (!appointment) {
      return { state: "not-applicable", title: "Sem registro", detail: "Data inválida" };
    }

    const cfg = SLOT_HOURS[type];
    const sendAt = new Date(appointment.getTime() - cfg.start * 60 * 60 * 1000);
    const closeAt = new Date(appointment.getTime() - cfg.end * 60 * 60 * 1000);
    const nowMs = Date.now();

    if (nowMs < sendAt.getTime()) {
      return {
        state: "scheduled",
        title: "Programado",
        detail: format(sendAt, "dd/MM 'às' HH:mm"),
      };
    }

    if (nowMs >= closeAt.getTime()) {
      return { state: "not-applicable", title: "Não enviado", detail: "Janela encerrada" };
    }

    return { state: "pending", title: "Aguardando", detail: "Envio automático" };
  };

  const markManualReminderSent = (lead: Lead, type: ReminderType) => {
    const sentAt = new Date().toISOString();

    if (onUpdateLead) {
      onUpdateLead(lead.id, {
        lembretes: {
          ...lead.lembretes,
          h24: type === "24h" ? true : Boolean(lead.lembretes?.h24),
          today: type === "1h" ? true : Boolean(lead.lembretes?.today),
          sent: {
            "24h": lead.lembretes?.sent?.["24h"] ?? null,
            "12h": lead.lembretes?.sent?.["12h"] ?? null,
            "3h": lead.lembretes?.sent?.["3h"] ?? null,
            "1h": lead.lembretes?.sent?.["1h"] ?? null,
            ...lead.lembretes?.sent,
            [type]: sentAt,
          },
        },
      });
      return;
    }

    if (type === "24h") onMarkReminder(lead.id, "h24");
    if (type === "1h") onMarkReminder(lead.id, "today");
  };

  const handleMarkAbsent = (lead: Lead) => {
    onUpdateLead?.(lead.id, { lembretes: { ...lead.lembretes, disabled: true } });
    toast.info(`✗ ${lead.nome} — Automação de lembretes desativada`);
  };

  const renderLeadCard = (lead: Lead, isToday: boolean) => {
    const hora = lead.dataAgendamento?.split(" ")[1] || "09:00";
    const [h, m] = hora.split(":");
    const dayLabel = isToday ? "HOJE" : "AMANHÃ";

    const renderReminderStatus = (label: string, status: ReminderVisualStatus) => {
      const StatusIcon = status.state === "sent" ? CheckCircle2 : Clock3;

      return (
        <div
          className={`min-w-[84px] rounded-lg border px-2 py-1.5 ${reminderStatusStyles[status.state]}`}
          title={`${label}: ${status.title} — ${status.detail}`}
        >
          <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide opacity-80">
            <StatusIcon className="h-3 w-3" />
            {label}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold leading-tight">{status.title}</div>
          <div className="text-[9px] leading-tight opacity-80">{status.detail}</div>
        </div>
      );
    };

    return (
      <div
        key={lead.id}
        className="flex items-center gap-3 p-3 rounded-lg bg-background/50 hover:bg-muted/50 transition-colors"
      >
        <span className="text-xl font-bold text-primary tabular-nums leading-none shrink-0 w-14 text-center">
          {h}:{m}
        </span>

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

        <div className="flex items-center gap-1.5 shrink-0">
          {renderReminderStatus("24h", getReminderStatus(lead, "24h"))}
          {renderReminderStatus("12h", getReminderStatus(lead, "12h"))}
          {renderReminderStatus("1h", getReminderStatus(lead, "1h"))}

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
              {(["24h", "12h", "1h"] as ReminderType[]).map((type) => (
                <DropdownMenuItem key={type} onClick={() => handleManualReminder(lead, type)}>
                  <Send className="mr-2 h-4 w-4" />
                  Lembrete de {type}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-700 text-muted-foreground"
            onClick={() => handleMarkAbsent(lead)}
            title="Desativar automação deste agendamento"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className={`glass-card rounded-xl p-5 ${compact ? "h-full min-h-0 flex flex-col" : ""}`}>
      <h3 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2 shrink-0">
        <Bell className="h-5 w-5 text-primary" />
        Lembretes de Agendamento
        <span className="ml-auto text-sm font-body text-muted-foreground">{relevantLeads.length} agendamentos</span>
      </h3>

      <div className={`${compact ? "flex-1 min-h-0" : "max-h-[500px]"} overflow-y-auto space-y-0`}>
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

        {relevantLeads.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            📭 Nenhum agendamento para hoje ou amanhã
          </p>
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
          suggestedMessage={getReminderMessage(whatsLead, whatsReminderType)}
          onDone={() => {
            if (whatsLead && whatsReminderType) {
              markManualReminderSent(whatsLead, whatsReminderType);
              toast.success(`✓ ${whatsLead.nome} — Lembrete de ${whatsReminderType} registrado!`);
            }
            setShowWhatsDialog(false);
            setWhatsReminderType(null);
          }}
        />
      )}
    </div>
  );
}
