import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lead } from "@/types/crm";
import { useState, useMemo } from "react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Phone, Calendar as CalendarIcon } from "lucide-react";
import { generateWhatsAppLink } from "@/lib/whatsapp";
import { toast } from "sonner";

interface CalendarViewProps {
  leads: Lead[];
  onMarkReminder: (id: string, type: "h24" | "h12" | "h3" | "h1") => void;
}

export function CalendarView({ leads, onMarkReminder }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);

  // Get all dates with appointments
  const appointmentDates = useMemo(() => {
    const dates = new Set<string>();
    leads.forEach((lead) => {
      if (lead.dataAgendamento) {
        try {
          const parsedDate = parse(lead.dataAgendamento, "dd/MM/yyyy", new Date());
          if (isValid(parsedDate)) {
            dates.add(format(parsedDate, "yyyy-MM-dd"));
          }
        } catch {
          // Skip invalid dates
        }
      }
    });
    return Array.from(dates).map((d) => new Date(d));
  }, [leads]);

  // Get leads for selected date
  const leadsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = format(selectedDate, "dd/MM/yyyy");
    return leads.filter((lead) => lead.dataAgendamento === dateStr);
  }, [leads, selectedDate]);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      const dateStr = format(date, "dd/MM/yyyy");
      const hasAppointments = leads.some((lead) => lead.dataAgendamento === dateStr);
      if (hasAppointments) {
        setDialogOpen(true);
      }
    }
  };

  const handleSendReminder = (lead: Lead, type: "h24" | "h12" | "h3" | "h1") => {
    const reminderTypeMap = {
      h24: "24h",
      h12: "12h",
      h3: "3h",
      h1: "1h",
    } as const;
    
    const whatsappLink = generateWhatsAppLink(
      lead.telefone,
      lead.nome,
      lead.servicoProcurado,
      lead.dataAgendamento,
      reminderTypeMap[type]
    );
    
    window.open(whatsappLink, "_blank");
    onMarkReminder(lead.id, type);
    toast.success(`Lembrete ${type} enviado para ${lead.nome}`);
  };

  const getReminderStatus = (lead: Lead) => {
    const { h24, h12, h3, h1 } = lead.lembretes;
    if (h1) return { label: "Todos enviados", color: "bg-green-500" };
    if (h3) return { label: "3 enviados", color: "bg-yellow-500" };
    if (h12) return { label: "2 enviados", color: "bg-orange-500" };
    if (h24) return { label: "1 enviado", color: "bg-blue-500" };
    return { label: "Nenhum enviado", color: "bg-gray-500" };
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
                      
                      <div className="grid grid-cols-4 gap-2">
                        <Button
                          size="sm"
                          variant={lead.lembretes.h24 ? "default" : "outline"}
                          onClick={() => handleSendReminder(lead, "h24")}
                          disabled={lead.lembretes.h24}
                          className={lead.lembretes.h24 ? "bg-success" : ""}
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          24h
                        </Button>
                        <Button
                          size="sm"
                          variant={lead.lembretes.h12 ? "default" : "outline"}
                          onClick={() => handleSendReminder(lead, "h12")}
                          disabled={lead.lembretes.h12}
                          className={lead.lembretes.h12 ? "bg-success" : ""}
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          12h
                        </Button>
                        <Button
                          size="sm"
                          variant={lead.lembretes.h3 ? "default" : "outline"}
                          onClick={() => handleSendReminder(lead, "h3")}
                          disabled={lead.lembretes.h3}
                          className={lead.lembretes.h3 ? "bg-success" : ""}
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          3h
                        </Button>
                        <Button
                          size="sm"
                          variant={lead.lembretes.h1 ? "default" : "outline"}
                          onClick={() => handleSendReminder(lead, "h1")}
                          disabled={lead.lembretes.h1}
                          className={lead.lembretes.h1 ? "bg-success" : ""}
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          1h
                        </Button>
                      </div>
                      
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
