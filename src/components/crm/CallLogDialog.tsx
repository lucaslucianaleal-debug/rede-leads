import { useState, useEffect } from "react";
const STATUS_OPTIONS = [
  { value: "QUENTE", label: "🔥 Quente" },
  { value: "MORNO", label: "🟡 Morno" },
  { value: "FRIO", label: "🧊 Frio" },
];

const ETAPA_OPTIONS = [
  "Novo",
  "Em contato",
  "Follow-Up 1",
  "Follow-Up 2",
  "Follow-Up 3",
  "Follow-Up 4",
  "Follow-Up 5",
  "Follow-Up 6",
  "Follow-Up 7",
  "Follow-Up 8",
  "Follow-Up 9",
  "Follow-Up 10",
  "Follow-Up 11",
  "Follow-Up 12",
  "Avaliação agendada",
  "Fora da região",
  "Desistência",
  "Finalizado",
];

import { Lead, LeadStage } from "@/types/crm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatPhoneNumber } from "@/lib/phone";
import { AgendamentoDialog } from "./AgendamentoDialog";
import { WhatsAppMessageDialog } from "./WhatsAppMessageDialog";
import { AgendaDoDia } from "./AgendaDoDia";
import { generateAppointmentConfirmationTextForClinic } from "@/lib/whatsapp";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";

interface CallLogDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (leadId: string, outcome: string, obs: string, returnDate?: string) => void;
}

const OUTCOMES = [
  { value: "Atendeu", label: "📞 Atendeu" },
  { value: "Caixa de mensagem", label: "📭 Caiu na caixa" },
  { value: "Não atendeu", label: "🔕 Não atendeu" },
  { value: "Número errado", label: "❌ Número errado" },
];

export function CallLogDialog({ lead, open, onClose, onConfirm }: CallLogDialogProps) {
    // Permite abrir modal de agendamento ao clicar no slot vazio
    const [agendamentoInitialDate, setAgendamentoInitialDate] = useState<Date | undefined>(undefined);
    const [agendamentoInitialTime, setAgendamentoInitialTime] = useState<string | undefined>(undefined);
    useEffect(() => {
      function handleAbrirAgendamentoDoDia(e: any) {
        if (e?.detail?.date) {
          setAgendamentoInitialDate(e.detail.date);
          setAgendamentoInitialTime(undefined);
        } else {
          setAgendamentoInitialDate(undefined);
          setAgendamentoInitialTime(undefined);
        }
        setAgendamentoOpen(true);
      }
      window.addEventListener('abrirAgendamentoDoDia', handleAbrirAgendamentoDoDia);
      return () => {
        window.removeEventListener('abrirAgendamentoDoDia', handleAbrirAgendamentoDoDia);
      };
    }, []);
  const { leads, updateLead } = useLeads();
  const { clinicMeta } = useAuth();
  const [outcome, setOutcome] = useState("Caixa de mensagem");
  const [obs, setObs] = useState("");
  const [agendarRetorno, setAgendarRetorno] = useState(false);
  const [returnDate, setReturnDate] = useState<Date | undefined>(new Date());
  const [returnTime, setReturnTime] = useState("17:00");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [agendamentoOpen, setAgendamentoOpen] = useState(false);
  const [whatsOpen, setWhatsOpen] = useState(false);
  const [suggestedMessage, setSuggestedMessage] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string>(lead?.status || "MORNO");
  const [etapa, setEtapa] = useState<LeadStage>(lead?.etapaLead || "Novo");
    const [showAgenda, setShowAgenda] = useState(false);

  // Pré-preencher se já tem retorno ligação agendado
  useEffect(() => {
    if (lead?.dataRetornoLigacao && open) {
      const parts = lead.dataRetornoLigacao.split(" ");
      if (parts.length >= 2) {
        const dateStr = parts[0]; // dd/MM/yyyy
        const timeStr = parts[1]; // HH:mm
        try {
          const parsedDate = parse(dateStr, "dd/MM/yyyy", new Date());
          setReturnDate(parsedDate);
          setReturnTime(timeStr);
          setAgendarRetorno(true); // Habilitar switch de retorno
        } catch (e) {
          // Fallback se parsing falhar
          setReturnDate(new Date());
          setReturnTime("17:00");
          setAgendarRetorno(false);
        }
      }
    } else {
      // Reset quando modal abre sem retorno agendado
      setReturnDate(new Date());
      setReturnTime("17:00");
      setAgendarRetorno(false);
    }
    setOutcome("Caixa de mensagem");
    setObs("");
    setStatus(lead?.status || "MORNO");
    setEtapa(lead?.etapaLead || "Novo");
  }, [lead?.dataRetornoLigacao, open, lead?.status, lead?.etapaLead]);

  if (!lead) return null;

  const handleConfirm = () => {
    let returnDateStr: string | undefined;
    if (agendarRetorno && returnDate) {
      returnDateStr = `${format(returnDate, "dd/MM/yyyy")} ${returnTime}`;
    }
    // Atualiza status e etapa do lead
    if (updateLead) {
      const updates: any = {};
      if (status && lead.status !== status) updates.status = status as any;
      if (etapa && lead.etapaLead !== etapa) updates.etapaLead = etapa;
      if (Object.keys(updates).length > 0) {
        updateLead(lead.id, updates);
      }
    }
    onConfirm(lead.id, outcome, obs, returnDateStr);
    toast.success(returnDateStr ? `Ligação registrada! Retorno agendado para ${returnDateStr}` : "Ligação registrada!");
    setObs("");
    setOutcome("Caixa de mensagem");
    setAgendarRetorno(false);
    setReturnDate(new Date());
    setReturnTime("17:00");
    onClose();
  };

  const handleOpenAgendamento = () => {
    setAgendamentoOpen(true);
  };

  const handleConfirmAgendamento = (leadId: string, dataAgendamento: string) => {
    if (!updateLead || !lead) return;
    const hoje = format(new Date(), "dd/MM/yyyy");
    updateLead(leadId, {
      dataAgendamento,
      dataAgendamentoCriado: hoje,
      etapaLead: "Avaliação agendada",
      lembretes: {
        h24: false,
        today: false,
        disabled: false,
        sent: { "24h": null, "12h": null, "3h": null, "1h": null },
      },
      briefingRecepcao: lead.briefingRecepcao ?? ""
    });
    toast.success("Agendamento atualizado! Automação reativada.");
    const text = generateAppointmentConfirmationTextForClinic(clinicMeta, dataAgendamento);
    setSuggestedMessage(text);
    setAgendamentoOpen(false);
    setWhatsOpen(true);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Ligação</DialogTitle>
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
              <div className="mt-2 flex justify-end">
                <button
                  className="text-xs px-2 py-1 rounded bg-primary/10 text-primary border border-primary hover:bg-primary/20 transition"
                  onClick={() => setShowAgenda(true)}
                >
                  Ver Agenda
                </button>
              </div>
          </div>
        </DialogHeader>
      {/* Painel lateral da agenda */}
      {showAgenda && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md h-[90vh] flex flex-col relative border border-border p-0 sm:p-0">
            <button
              className="absolute top-3 right-3 text-xs px-3 py-1 rounded bg-muted text-foreground border border-border hover:bg-muted/70 transition z-10"
              onClick={() => setShowAgenda(false)}
            >
              Fechar Agenda
            </button>
            <div className="flex-1 flex flex-col justify-start items-center p-0 overflow-y-auto w-full">
              <div className="w-full px-2 sm:px-4 pt-4 pb-2">
                <AgendaDoDia
                  leads={leads}
                  onMarkAttendance={() => {}}
                  onUpdateLead={() => {}}
                  variant="sidepanel"
                />
              </div>
            </div>
          </div>
        </div>
      )}

        <div className="space-y-4 py-2">
          {/* Status do lead */}
          <div className="space-y-2">
            <Label>Status do lead</Label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => {
                    setStatus(s.value);
                    if (updateLead && lead && lead.status !== s.value) {
                      updateLead(lead.id, { status: s.value as any });
                    }
                  }}
                  className={`px-2 py-2 rounded-lg text-xs font-medium border transition-colors text-center whitespace-normal break-words ${
                    status === s.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Etapa */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Etapa do lead</Label>
              <button
                type="button"
                onClick={() => {
                  setEtapa("Desistência");
                  setStatus("FRIO");
                }}
                className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition font-medium"
              >
                Desistiu
              </button>
            </div>
            <Select value={etapa} onValueChange={(value) => setEtapa(value as LeadStage)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {ETAPA_OPTIONS.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Outcome */}
          <div className="space-y-2">
            <Label>Resultado da ligação</Label>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setOutcome(o.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left whitespace-normal break-words ${
                    outcome === o.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Obs */}
          <div className="space-y-2">
            <Label>Observação <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: tentei às 14h, caixa cheia..."
              rows={2}
            />
          </div>

          {/* Agendar Retorno */}
          <div className="space-y-3 pt-1 border-t border-border">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer">📅 Agendar retorno de ligação</Label>
              <Switch checked={agendarRetorno} onCheckedChange={setAgendarRetorno} />
            </div>
            {agendarRetorno && (
              <div className="flex gap-2">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {returnDate ? format(returnDate, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={returnDate}
                      onSelect={(d) => { setReturnDate(d); setCalendarOpen(false); }}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  className="w-28"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary" onClick={handleOpenAgendamento}>Agendar Atendimento</Button>
          <Button onClick={handleConfirm}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AgendamentoDialog
      lead={lead}
      open={agendamentoOpen}
      onClose={() => {
        setAgendamentoOpen(false);
        setAgendamentoInitialDate(undefined);
        setAgendamentoInitialTime(undefined);
      }}
      onConfirm={handleConfirmAgendamento}
      initialDate={agendamentoInitialDate}
      initialTime={agendamentoInitialTime}
    />

    <WhatsAppMessageDialog
      lead={lead}
      open={whatsOpen}
      onClose={() => setWhatsOpen(false)}
      suggestedMessage={suggestedMessage}
    />
    </>
  );
}
