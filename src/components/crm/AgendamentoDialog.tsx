import { useState, useEffect } from "react";
import { Lead } from "@/types/crm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatPhoneNumber } from "@/lib/phone";
import { useAuth } from "@/hooks/useAuth";
import { scheduleAppointmentWhatsAppAutomation } from "@/lib/appointmentWhatsAppAutomation";

interface AgendamentoDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (leadId: string, dataAgendamento: string) => void;
  initialDate?: Date;
  initialTime?: string;
}

export function AgendamentoDialog({ lead, open, onClose, onConfirm, initialDate, initialTime }: AgendamentoDialogProps) {
  const { user, currentClinic, clinicMeta } = useAuth();
  const [agendamentoDate, setAgendamentoDate] = useState<Date | undefined>(new Date());
  const [agendamentoTime, setAgendamentoTime] = useState("09:00");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pré-preencher se já tem agendamento ou vaga sugerida
  useEffect(() => {
    if (!open) return;

    if (initialDate) {
      setAgendamentoDate(initialDate);
      setAgendamentoTime(initialTime ?? "09:00");
      return;
    }

    if (lead?.dataAgendamento) {
      const parts = lead.dataAgendamento.split(" ");
      if (parts.length >= 2) {
        const dateStr = parts[0]; // dd/MM/yyyy
        const timeStr = parts[1]; // HH:mm
        try {
          const parsedDate = parse(dateStr, "dd/MM/yyyy", new Date());
          setAgendamentoDate(parsedDate);
          setAgendamentoTime(timeStr);
          return;
        } catch (e) {
          // Fallback se parsing falhar
        }
      }
    }

    // Reset quando modal abre sem agendamento
    setAgendamentoDate(new Date());
    setAgendamentoTime("09:00");
  }, [lead?.dataAgendamento, open, initialDate, initialTime]);

  if (!lead) return null;

  const handleConfirm = async () => {
    if (!agendamentoDate) {
      toast.error("Selecione uma data!");
      return;
    }

    const dataAgendamento = `${format(agendamentoDate, "dd/MM/yyyy")} ${agendamentoTime}`;
    setSaving(true);

    try {
      // Primeiro salva o agendamento no fluxo já existente do CRM.
      onConfirm(lead.id, dataAgendamento);
      toast.success(`Agendado para ${dataAgendamento}`);

      // Depois usa o mesmo agente do WhatsApp para confirmação imediata e lembretes futuros.
      // A automação usa as mensagens já existentes no Rede Leads.
      const result = await scheduleAppointmentWhatsAppAutomation({
        user,
        clinicId: currentClinic || "",
        clinicMeta,
        lead,
        dataAgendamento,
      });

      if (result.confirmationQueued) {
        toast.success("Confirmação colocada na fila do WhatsApp ✓");
      }
      if ((result.scheduled || []).length > 0) {
        toast.success("Lembretes do agendamento programados ✓");
      }
    } catch (error) {
      console.error("Falha ao programar WhatsApp do agendamento:", error);
      toast.warning(
        `Agendamento salvo, mas a automação do WhatsApp não foi programada: ${error instanceof Error ? error.message : "erro desconhecido"}`
      );
    } finally {
      setSaving(false);
      setAgendamentoDate(new Date());
      setAgendamentoTime("09:00");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Agendar Atendimento</DialogTitle>
          <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-muted-foreground">{lead.nome}</div>
              {lead.servicoProcurado && (
                <div className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {lead.servicoProcurado}
                </div>
              )}
            </div>
            <div className="text-2xl font-mono font-bold tracking-widest text-foreground">
              {formatPhoneNumber(lead.telefone)}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Data */}
          <div>
            <Label>📅 Data do Agendamento</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full mt-2 text-left font-normal"
                  onClick={() => setCalendarOpen(true)}
                  disabled={saving}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {agendamentoDate ? format(agendamentoDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={agendamentoDate}
                  onSelect={(date) => {
                    setAgendamentoDate(date);
                    setCalendarOpen(false);
                  }}
                  locale={ptBR}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Hora */}
          <div>
            <Label htmlFor="time">🕐 Horário</Label>
            <Input
              id="time"
              type="time"
              value={agendamentoTime}
              onChange={(e) => setAgendamentoTime(e.target.value)}
              className="mt-2"
              disabled={saving}
            />
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            Ao confirmar, o Rede Leads envia a confirmação pelo agente conectado e programa os lembretes disponíveis para esse horário.
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? "Programando..." : "✓ Agendar e confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
