import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Lead } from "@/types/crm";
import { useState, useMemo } from "react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Phone, Calendar as CalendarIcon, Pencil, Check, Bot, CheckCircle, AlertCircle } from "lucide-react";
import { generateReminderText } from "@/lib/whatsapp";
import { toast } from "sonner";

interface CalendarViewProps {
  leads: Lead[];
  onMarkReminder: (id: string, type: "h24" | "today") => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => void;
  onOpenChat?: (phone: string, message?: string) => void;
}

export function CalendarView({ leads, onMarkReminder, onUpdateLead, onOpenChat }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState<string>("");

  const handleSaveTime = (lead: Lead) => {
    if (!editingTimeValue || !onUpdateLead) return;
    const datePart = lead.dataAgendamento.split(" ")[0];
    const newDataAgendamento = `${datePart} ${editingTimeValue}`;
    onUpdateLead(lead.id, { dataAgendamento: newDataAgendamento });
    setEditingTimeId(null);
    toast.success(`Horário de ${lead.nome} alterado para ${editingTimeValue}`);
  };

  // Get all dates with appointments
  const appointmentDates = useMemo(() => {
    const dates = new Set<string>();
    leads.forEach((lead) => {
      if (lead.dataAgendamento) {
        try {
          const datePart = lead.dataAgendamento.substring(0, 10);
          const parsedDate = parse(datePart, "dd/MM/yyyy", new Date());
          if (isValid(parsedDate)) {
            dates.add(format(parsedDate, "yyyy-MM-dd"));
          }
        } catch {
          // Skip invalid dates
        }
      }
    });
    // Use noon (12:00) to avoid UTC offset shifting the date to the previous day
    return Array.from(dates).map((d) => {
      const [y, m, day] = d.split("-").map(Number);
      return new Date(y, m - 1, day, 12, 0, 0);
    });
  }, [leads]);

  // Get leads for selected date
  const leadsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = format(selectedDate, "dd/MM/yyyy");
    return leads
      .filter((lead) => lead.dataAgendamento.startsWith(dateStr))
      .sort((a, b) => {
        const timeA = a.dataAgendamento?.split(" ")[1] || "00:00";
        const timeB = b.dataAgendamento?.split(" ")[1] || "00:00";
        return timeA.localeCompare(timeB);
      });
  }, [leads, selectedDate]);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      const dateStr = format(date, "dd/MM/yyyy");
      const hasAppointments = leads.some((lead) => lead.dataAgendamento.startsWith(dateStr));
      if (hasAppointments) {
        setDialogOpen(true);
      }
    }
  };

  const handleSendReminder = (lead: Lead, type: "h24" | "today") => {
    const msg = generateReminderText(lead.dataAgendamento || "", type);
    onOpenChat?.(lead.telefone, msg);
  };

  const getReminderStatus = (lead: Lead) => {
    const { h24, today } = lead.lembretes;
    if (h24 && today) return { label: "Todos enviados", color: "bg-green-500" };
    if (today) return { label: "1 enviado", color: "bg-blue-500" };
    if (h24) return { label: "1 enviado", color: "bg-blue-500" };
    return { label: "Nenhum enviado", color: "bg-gray-500" };
  };

  // Helper function to format the robot-sent timestamp
  const formatRobotSendTime = (isoTimestamp: string | null | undefined): string | null => {
    if (!isoTimestamp) return null;
    try {
      const date = new Date(isoTimestamp);
      return format(date, "HH:mm", { locale: ptBR });
    } catch {
      return null;
    }
  };

  // Check if reminder was sent automatically by robot for a specific slot
  const getRobotReminderStatus = (lead: Lead, slot: "24h" | "today") => {
    const sent = lead.lembretes?.sent;
    if (!sent) return { isSent: false, timestamp: null, timeStr: null };
    
    const timestamp = sent[slot];
    const timeStr = formatRobotSendTime(timestamp);
    
    return {
      isSent: !!timestamp,
      timestamp,
      timeStr
    };
  };

  // Check if there's manual conversation cooldown (prevents robot from sending)
  const hasCooldownBlock = (lead: Lead): boolean => {
    const sent = lead.lembretes?.sent;
    if (!sent) return false;
    
    // If any slot is marked, assume there might be cooldown consideration
    // In production, we'd check timestamps against conversation messages
    return false; // Placeholder for now
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Calendário de Agendamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              locale={ptBR}
              modifiers={{
                hasAppointment: appointmentDates,
              }}
              modifiersClassNames={{
                hasAppointment: "bg-primary/20 font-bold",
              }}
              className="rounded-md border"
            />
          </div>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <p>Dias marcados têm agendamentos • Clique para ver detalhes</p>
            <p className="mt-2">
              Total de agendamentos: <span className="font-bold">{appointmentDates.length}</span> dias
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Agendamentos de {selectedDate && format(selectedDate, "dd/MM/yyyy")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {leadsForSelectedDate.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum agendamento para esta data
              </p>
            ) : (
              leadsForSelectedDate.map((lead) => {
                const reminderStatus = getReminderStatus(lead);
                return (
                  <Card key={lead.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-primary" />
                            {editingTimeId === lead.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="time"
                                  value={editingTimeValue}
                                  onChange={(e) => setEditingTimeValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTime(lead); if (e.key === "Escape") setEditingTimeId(null); }}
                                  className="h-7 w-28 text-sm font-bold text-primary"
                                  autoFocus
                                />
                                <Button size="icon" className="h-6 w-6" onClick={() => handleSaveTime(lead)}>
                                  <Check className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-lg font-bold text-primary">
                                  {lead.dataAgendamento?.split(" ")[1] || "—"}
                                </span>
                                {onUpdateLead && (
                                  <button
                                    className="text-muted-foreground hover:text-primary"
                                    title="Alterar horário"
                                    onClick={() => {
                                      setEditingTimeId(lead.id);
                                      setEditingTimeValue(lead.dataAgendamento?.split(" ")[1] || "");
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <h3 className="font-semibold text-lg">{lead.nome}</h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <Phone className="h-3 w-3" />
                            {lead.telefone}
                          </div>
                          <p className="text-sm mt-1">
                            <span className="font-medium">Serviço:</span> {lead.servicoProcurado}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <Badge className={reminderStatus.color}>
                            {reminderStatus.label}
                          </Badge>
                          {lead.comparecimento && (
                            <Badge variant={lead.comparecimento === "COMPARECEU" ? "default" : "destructive"}>
                              {lead.comparecimento}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {/* 24h Reminder Button */}
                        {(() => {
                          const robotStatus = getRobotReminderStatus(lead, "24h");
                          return (
                            <div className="space-y-1">
                              <Button
                                size="sm"
                                variant={robotStatus.isSent ? "default" : "outline"}
                                onClick={() => handleSendReminder(lead, "h24")}
                                className={`w-full ${
                                  robotStatus.isSent 
                                    ? "bg-green-500 hover:bg-green-600 text-white" 
                                    : ""
                                }`}
                              >
                                {robotStatus.isSent ? (
                                  <>
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    24h antes
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-3 w-3 mr-1" />
                                    24h antes
                                  </>
                                )}
                              </Button>
                              {robotStatus.isSent && robotStatus.timeStr && (
                                <div className="flex items-center gap-1 text-xs text-emerald-600 mx-1">
                                  <Bot className="h-3 w-3" />
                                  <span>Enviado às {robotStatus.timeStr}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Today Reminder Button */}
                        {(() => {
                          const robotStatus = getRobotReminderStatus(lead, "today");
                          return (
                            <div className="space-y-1">
                              <Button
                                size="sm"
                                variant={robotStatus.isSent ? "default" : "outline"}
                                onClick={() => handleSendReminder(lead, "today")}
                                className={`w-full ${
                                  robotStatus.isSent 
                                    ? "bg-blue-500 hover:bg-blue-600 text-white" 
                                    : ""
                                }`}
                              >
                                {robotStatus.isSent ? (
                                  <>
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Hoje
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-3 w-3 mr-1" />
                                    Hoje
                                  </>
                                )}
                              </Button>
                              {robotStatus.isSent && robotStatus.timeStr && (
                                <div className="flex items-center gap-1 text-xs text-blue-600 mx-1">
                                  <Bot className="h-3 w-3" />
                                  <span>Enviado às {robotStatus.timeStr}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Cooldown Warning */}
                      {(() => {
                        const robotStatus24h = getRobotReminderStatus(lead, "24h");
                        const robotStatusToday = getRobotReminderStatus(lead, "today");
                        const maybeCooldown = hasCooldownBlock(lead);
                        
                        return (
                          (robotStatus24h.isSent || robotStatusToday.isSent) && (
                            <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded flex items-start gap-2 text-xs">
                              <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                              <span className="text-emerald-700">
                                <strong>✓ Automação ativa:</strong> O robô enviou lembrete(s). Você pode clicar acima para reenviar manualmente se necessário.
                              </span>
                            </div>
                          )
                        );
                      })()}

                      {/* Cooldown Safety Notice */}
                      {hasCooldownBlock(lead) && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded flex items-start gap-2 text-xs">
                          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="text-amber-700">
                            <strong>⏸ Atendimento manual detectado:</strong> Lembrete automaticamente pausado por 1 hora para não interromper sua conversa.
                          </span>
                        </div>
                      )}
                      
                      {lead.observacao && (
                        <div className="mt-3 p-2 bg-muted rounded text-sm">
                          <span className="font-medium">Obs:</span> {lead.observacao}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
