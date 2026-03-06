import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lead } from "@/types/crm";
import { useState, useMemo, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Phone, Bot, CheckCircle, AlertCircle, Calendar as CalendarIcon, Wifi, WifiOff } from "lucide-react";
import { generateReminderText } from "@/lib/whatsapp";
import { toast } from "sonner";

interface CalendarViewProps {
  leads: Lead[];
  onMarkReminder: (id: string, type: "h24" | "today") => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => void;
  onOpenChat?: (phone: string, message?: string) => void;
}

type SlotKey = "24h" | "12h" | "3h" | "1h";
type SlotStatus = "sent" | "scheduled" | "missed" | "failed";

interface SendFailureEntry {
  leadId: string;
  slot: string;
  attempts: number;
  lastError: string;
  firstFailedAt: string;
  lastFailedAt: string;
}

interface SendFailures {
  [key: string]: SendFailureEntry;
}

const SLOTS: SlotKey[] = ["24h", "12h", "3h", "1h"];

const SLOT_OFFSETS_MS: Record<SlotKey, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "3h":  3  * 60 * 60 * 1000,
  "1h":  1  * 60 * 60 * 1000,
};

function parseAppointmentDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const [datePart, timePart] = dateStr.split(" ");
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour = 0, minute = 0] = (timePart || "00:00").split(":").map(Number);
    const d = new Date(year, month - 1, day, hour, minute, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function computeSlotTimes(appointmentDate: Date): Record<SlotKey, Date> {
  return {
    "24h": new Date(appointmentDate.getTime() - SLOT_OFFSETS_MS["24h"]),
    "12h": new Date(appointmentDate.getTime() - SLOT_OFFSETS_MS["12h"]),
    "3h":  new Date(appointmentDate.getTime() - SLOT_OFFSETS_MS["3h"]),
    "1h":  new Date(appointmentDate.getTime() - SLOT_OFFSETS_MS["1h"]),
  };
}

export function CalendarView({ leads, onMarkReminder, onUpdateLead, onOpenChat }: CalendarViewProps) {
  const [sendFailures, setSendFailures] = useState<SendFailures>({});
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);

  const fetchFailures = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:3001/api/send-failures");
      if (res.ok) {
        const data = await res.json();
        setSendFailures(data ?? {});
        setServerConnected(true);
      } else {
        setServerConnected(false);
      }
    } catch {
      setServerConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchFailures();
    const interval = setInterval(fetchFailures, 60_000);
    return () => clearInterval(interval);
  }, [fetchFailures]);

  const now = new Date();
  const todayStr   = format(now, "dd/MM/yyyy");
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowStr  = format(tomorrowDate, "dd/MM/yyyy");

  const todayLeads = useMemo(
    () =>
      leads
        .filter((l) => l.dataAgendamento?.startsWith(todayStr))
        .sort((a, b) =>
          (a.dataAgendamento?.split(" ")[1] ?? "").localeCompare(b.dataAgendamento?.split(" ")[1] ?? "")
        ),
    [leads, todayStr]
  );

  const tomorrowLeads = useMemo(
    () =>
      leads
        .filter((l) => l.dataAgendamento?.startsWith(tomorrowStr))
        .sort((a, b) =>
          (a.dataAgendamento?.split(" ")[1] ?? "").localeCompare(b.dataAgendamento?.split(" ")[1] ?? "")
        ),
    [leads, tomorrowStr]
  );

  // ---- slot logic ----

  function getSlotStatus(lead: Lead, slot: SlotKey, slotTime: Date): SlotStatus {
    const sentTs = lead.lembretes?.sent?.[slot];
    if (sentTs) return "sent";

    if (sendFailures[`${lead.id}:${slot}`]) return "failed";

    if (slotTime > new Date()) return "scheduled";
    return "missed";
  }

  function stampSlot(lead: Lead, slot: SlotKey) {
    if (!onUpdateLead) return;
    const nowIso = new Date().toISOString();
    onUpdateLead(lead.id, {
      lembretes: {
        ...lead.lembretes,
        sent: {
          "24h": lead.lembretes?.sent?.["24h"] ?? null,
          "12h": lead.lembretes?.sent?.["12h"] ?? null,
          "3h":  lead.lembretes?.sent?.["3h"]  ?? null,
          "1h":  lead.lembretes?.sent?.["1h"]  ?? null,
          [slot]: nowIso,
        },
      },
    });
  }

  function handleManualSend(lead: Lead, slot: SlotKey) {
    const reminderType: "h24" | "today" = slot === "24h" ? "h24" : "today";
    const msg = generateReminderText(lead.dataAgendamento ?? "", reminderType);
    onOpenChat?.(lead.telefone, msg);
    stampSlot(lead, slot);
    toast.success(`Lembrete ${slot} enviado e marcado para ${lead.nome}`);
  }

  // ---- render slot pill ----

  function renderSlot(lead: Lead, slot: SlotKey, slotTime: Date) {
    const status = getSlotStatus(lead, slot, slotTime);
    const sentTs = lead.lembretes?.sent?.[slot];

    type Config = { label: string; icon?: React.ReactNode; cls: string; tooltip: string; clickable: boolean };

    const configs: Record<SlotStatus, Config> = {
      sent: {
        label: sentTs ? format(new Date(sentTs), "HH:mm") : "Env.",
        icon: <CheckCircle className="h-3 w-3" />,
        cls: "bg-green-100 text-green-700 border-green-300 hover:bg-green-200",
        tooltip: sentTs ? `Enviado às ${format(new Date(sentTs), "HH:mm")}` : "Enviado",
        clickable: false,
      },
      scheduled: {
        label: format(slotTime, "HH:mm"),
        icon: <Clock className="h-3 w-3 animate-pulse" />,
        cls: "bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200",
        tooltip: `Agendado para ${format(slotTime, "HH:mm")} — Clique para enviar agora`,
        clickable: true,
      },
      failed: {
        label: "FALHA",
        icon: <AlertCircle className="h-3 w-3" />,
        cls: "bg-red-100 text-red-700 border-red-300 hover:bg-red-200",
        tooltip: "Falha no envio automático — Clique para enviar manual",
        clickable: true,
      },
      missed: {
        label: slot,
        cls: "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200",
        tooltip: "Janela passou — Clique para marcar manualmente",
        clickable: true,
      },
    };

    const cfg = configs[status];

    return (
      <div key={slot} className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-muted-foreground font-medium">{slot}</span>
        <Button
          size="sm"
          variant="outline"
          className={`h-8 min-w-[52px] px-2 text-xs font-medium border ${cfg.cls}`}
          onClick={() => { if (cfg.clickable) handleManualSend(lead, slot); }}
          disabled={!cfg.clickable}
          title={cfg.tooltip}
        >
          {cfg.icon && <span className="mr-1">{cfg.icon}</span>}
          {cfg.label}
        </Button>
      </div>
    );
  }

  // ---- render lead card ----

  function renderLeadCard(lead: Lead) {
    const appointment = parseAppointmentDate(lead.dataAgendamento ?? "");
    const slotTimes = appointment ? computeSlotTimes(appointment) : null;

    const failedSlots = slotTimes ? SLOTS.filter((s) => sendFailures[`${lead.id}:${s}`]) : [];
    const allSent = slotTimes ? SLOTS.every((s) => !!lead.lembretes?.sent?.[s]) : false;

    const borderColor = failedSlots.length > 0 ? "border-l-red-500" : allSent ? "border-l-green-500" : "border-l-primary/30";

    return (
      <Card key={lead.id} className={`border-l-4 ${borderColor} transition-colors`}>
        <CardContent className="p-4">
          {/* Header: time + name + procedure */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-lg font-bold text-primary tabular-nums">
              {lead.dataAgendamento?.split(" ")[1] ?? "—"}
            </span>
            <span className="font-semibold text-sm flex-1 min-w-0 truncate">{lead.nome}</span>
            <Badge variant="secondary" className="shrink-0 bg-primary/10 text-primary font-semibold text-xs">
              {lead.servicoProcurado}
            </Badge>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-1.5 mb-3 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span>{lead.telefone}</span>
          </div>

          {/* Automation timeline */}
          {slotTimes ? (
            <div className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex gap-2 flex-wrap">
                {SLOTS.map((slot) => renderSlot(lead, slot, slotTimes[slot]))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Data inválida</p>
          )}

          {/* Failure banner */}
          {failedSlots.length > 0 && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded flex items-start gap-2 text-xs">
              <AlertCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
              <span className="text-red-700">
                <strong>⚠️ Falha na automação</strong>{" "}
                ({failedSlots.join(", ")}) — Clique no botão vermelho para enviar manualmente.
              </span>
            </div>
          )}

          {/* Notes */}
          {lead.observacao && (
            <div className="mt-2 p-2 bg-muted rounded text-xs">
              <span className="font-medium">Obs:</span> {lead.observacao}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- render day section ----

  function renderDaySection(label: string, dateLabel: string, dayLeads: Lead[]) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CalendarIcon className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{label}</span>
          <span className="text-xs text-muted-foreground capitalize">{dateLabel}</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            {dayLeads.length} agendamento{dayLeads.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        {dayLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground italic pl-6 py-2">Nenhum agendamento</p>
        ) : (
          <div className="space-y-2">{dayLeads.map(renderLeadCard)}</div>
        )}
      </div>
    );
  }

  const total = todayLeads.length + tomorrowLeads.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarIcon className="h-5 w-5" />
          Lembretes de Agendamento — Próximas 48h
          <div className="ml-auto flex items-center gap-3">
            {serverConnected === true && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-normal">
                <Wifi className="h-3.5 w-3.5" /> Robô online
              </span>
            )}
            {serverConnected === false && (
              <span className="flex items-center gap-1 text-xs text-red-500 font-normal">
                <WifiOff className="h-3.5 w-3.5" /> Robô offline
              </span>
            )}
            <Badge variant="outline" className="text-xs font-normal">
              {total} agendamento{total !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardTitle>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-green-200 border border-green-300" />
            Enviado (mostra horário)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-yellow-200 border border-yellow-300" />
            Agendado para HH:mm
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-200" />
            Aguardando / Janela passou
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-red-200 border border-red-300" />
            ⚠️ Falha — Enviar Manual
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-4">
        {total === 0 ? (
          <p className="text-center text-muted-foreground py-10">
            Nenhum agendamento nas próximas 48 horas
          </p>
        ) : (
          <>
            {renderDaySection("📆 Hoje", format(now, "EEEE, dd/MM", { locale: ptBR }), todayLeads)}
            <div className="border-t pt-4">
              {renderDaySection("📅 Amanhã", format(tomorrowDate, "EEEE, dd/MM", { locale: ptBR }), tomorrowLeads)}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
