import { useState, useEffect, useMemo } from "react";
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
import { AlertTriangle, CalendarCheck2, CalendarIcon, CheckCircle2 } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatPhoneNumber } from "@/lib/phone";
import { useAuth } from "@/hooks/useAuth";
import { scheduleAppointmentWhatsAppAutomation } from "@/lib/appointmentWhatsAppAutomation";
import { generateAppointmentConfirmationTextForClinic } from "@/lib/whatsapp";
import { Textarea } from "@/components/ui/textarea";
import { appointmentConflicts, suggestAvailableTimes } from "@/lib/appointmentAvailability";

interface AgendamentoDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (leadId: string, dataAgendamento: string) => void;
  initialDate?: Date;
  initialTime?: string;
  existingAppointments?: Lead[];
}

export function AgendamentoDialog({
  lead,
  open,
  onClose,
  onConfirm,
  initialDate,
  initialTime,
  existingAppointments = [],
}: AgendamentoDialogProps) {
  const { user, currentClinic, clinicMeta } = useAuth();
  const [agendamentoDate, setAgendamentoDate] = useState<Date | undefined>(new Date());
  const [agendamentoTime, setAgendamentoTime] = useState("09:00");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"appointment" | "message">("appointment");
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [allowConflict, setAllowConflict] = useState(false);

  // Pré-preencher se já tem agendamento ou vaga sugerida
  useEffect(() => {
    if (!open) return;
    setStep("appointment");
    setConfirmationMessage("");
    setAllowConflict(false);

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

  const selectedDateValue = agendamentoDate ? format(agendamentoDate, "dd/MM/yyyy") : "";
  const appointmentValue = selectedDateValue ? `${selectedDateValue} ${agendamentoTime}` : "";
  const conflicts = useMemo(
    () => appointmentConflicts(existingAppointments, appointmentValue, lead?.id),
    [existingAppointments, appointmentValue, lead?.id],
  );
  const suggestedTimes = useMemo(
    () => conflicts.length
      ? suggestAvailableTimes(existingAppointments, selectedDateValue, agendamentoTime, lead?.id)
      : [],
    [conflicts.length, existingAppointments, selectedDateValue, agendamentoTime, lead?.id],
  );

  if (!lead) return null;

  const handleContinue = () => {
    const dataAgendamento = appointmentValue;
    if (!dataAgendamento) {
      toast.error("Selecione uma data!");
      return;
    }
    const selectedDateTime = parse(dataAgendamento, "dd/MM/yyyy HH:mm", new Date());
    if (selectedDateTime.getTime() <= Date.now()) {
      toast.error("Escolha uma data e um horário futuros.");
      return;
    }
    if (conflicts.length && !allowConflict) {
      toast.warning("Esse horário já está ocupado. Escolha outro horário ou confirme que deseja manter o encaixe.");
      return;
    }

    const firstName = (lead.nome || "").trim().split(/\s+/)[0] || "";
    const services = lead.servicoProcurado ? [lead.servicoProcurado] : [];
    setConfirmationMessage(
      generateAppointmentConfirmationTextForClinic(
        clinicMeta,
        dataAgendamento,
        firstName,
        services,
      ),
    );
    setStep("message");
  };

  const handleConfirm = async () => {
    const dataAgendamento = appointmentValue;
    if (!dataAgendamento) {
      toast.error("Selecione uma data!");
      return;
    }
    if (!confirmationMessage.trim()) {
      toast.error("A mensagem de confirmação não pode ficar vazia.");
      return;
    }
    setSaving(true);

    try {
      // Primeiro salva o agendamento no fluxo já existente do CRM.
      onConfirm(lead.id, dataAgendamento);

      // Depois usa o mesmo agente do WhatsApp para confirmação imediata e lembretes futuros.
      // A automação usa as mensagens já existentes no Rede Leads.
      const result = await scheduleAppointmentWhatsAppAutomation({
        user,
        clinicId: currentClinic || "",
        clinicMeta,
        lead,
        dataAgendamento,
        confirmationMessage,
      });

      const confirmationStatus = result.confirmationQueued
        ? "Confirmação enviada"
        : "Confirmação já estava programada";
      const reminderStatus = (result.scheduled || []).length > 0
        ? "lembretes programados"
        : "lembretes mantidos";
      toast.success(`${confirmationStatus} e ${reminderStatus}.`);
    } catch (error) {
      console.error("Falha ao programar WhatsApp do agendamento:", error);
      toast.warning(
        `Agendamento salvo, mas a automação do WhatsApp não foi programada: ${error instanceof Error ? error.message : "erro desconhecido"}`
      );
    } finally {
      setSaving(false);
      setAgendamentoDate(new Date());
      setAgendamentoTime("09:00");
      setStep("appointment");
      setConfirmationMessage("");
      setAllowConflict(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{step === "appointment" ? "Agendar Atendimento" : "Revisar confirmação"}</DialogTitle>
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

        {step === "appointment" ? (
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
                    {agendamentoDate
                      ? format(agendamentoDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                      : "Selecionar data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={agendamentoDate}
                    onSelect={(date) => {
                      setAgendamentoDate(date);
                      setAllowConflict(false);
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
                onChange={(e) => {
                  setAgendamentoTime(e.target.value);
                  setAllowConflict(false);
                }}
                className="mt-2"
                disabled={saving}
              />
            </div>

            {conflicts.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-800">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> Horário disponível
                </div>
                <p className="mt-0.5 text-xs text-emerald-700">Conferido com a agenda atual do Rede Leads.</p>
              </div>
            ) : (
              <div className={`rounded-lg border px-3 py-3 ${allowConflict ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                <div className={`flex items-center gap-2 text-sm font-semibold ${allowConflict ? "text-amber-900" : "text-red-800"}`}>
                  <AlertTriangle className="h-4 w-4" />
                  {conflicts.length === 1 ? "Este horário já está ocupado" : `${conflicts.length} agendamentos neste horário`}
                </div>
                <p className={`mt-1 text-xs ${allowConflict ? "text-amber-800" : "text-red-700"}`}>
                  {conflicts.slice(0, 2).map((item) => item.nome || "Lead sem nome").join(" • ")}
                  {conflicts.length > 2 ? ` • +${conflicts.length - 2}` : ""}
                </p>

                {suggestedTimes.length > 0 && !allowConflict && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-red-800">Próximos horários livres</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {suggestedTimes.map((time) => (
                        <Button
                          key={time}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-red-200 bg-white text-red-800 hover:bg-red-100"
                          onClick={() => {
                            setAgendamentoTime(time);
                            setAllowConflict(false);
                          }}
                        >
                          {time}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className={`mt-3 text-xs font-semibold underline underline-offset-2 ${allowConflict ? "text-amber-900" : "text-red-800"}`}
                  onClick={() => setAllowConflict((current) => !current)}
                >
                  {allowConflict ? "Cancelar encaixe neste horário" : "A clínica comporta: manter como encaixe"}
                </button>
              </div>
            )}

            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Na próxima etapa você poderá revisar a mensagem antes do envio.
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            <div className="rounded-lg border bg-muted/40 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Data e horário</div>
                  <div className="font-semibold">{appointmentValue}</div>
                </div>
                <CalendarCheck2 className="h-5 w-5 text-primary" />
              </div>
              {conflicts.length > 0 && allowConflict && (
                <div className="mt-2 text-xs font-medium text-amber-700">Encaixe autorizado • {conflicts.length + 1} atendimentos no horário</div>
              )}
            </div>
            <div>
              <Label htmlFor="appointment-confirmation">Mensagem de confirmação</Label>
              <Textarea
                id="appointment-confirmation"
                value={confirmationMessage}
                onChange={(event) => setConfirmationMessage(event.target.value)}
                rows={10}
                disabled={saving}
                className="mt-2 resize-none"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Depois do envio, os lembretes serão programados automaticamente.
            </p>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          {step === "appointment" ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleContinue} disabled={saving}>
                Continuar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("appointment")} disabled={saving}>
                Voltar
              </Button>
              <Button onClick={handleConfirm} disabled={saving || !confirmationMessage.trim()}>
                {saving ? "Enviando..." : "Agendar e enviar confirmação"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
