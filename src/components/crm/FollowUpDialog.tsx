import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { WhatsAppMessageDialog } from "./WhatsAppMessageDialog";
import { getFollowUpMessage, formatFollowUpMessage } from "@/data/followUpMessages";

interface FollowUpDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (leadId: string, observacao: string, etapa?: LeadStage) => void;
}

export function FollowUpDialog({ lead, open, onClose, onConfirm }: FollowUpDialogProps) {
  const [observacao, setObservacao] = useState("");
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [etapa, setEtapa] = useState<LeadStage>(lead?.etapaLead || "Novo");

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

  if (!lead) return null;

  const handleConfirm = () => {
    onConfirm(lead.id, observacao, etapa);
    toast.success(`Follow-Up registrado para ${lead.nome}`);
    setObservacao("");
    setEtapa(lead?.etapaLead || "Novo");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Follow-Up</DialogTitle>
          <div className="text-sm text-muted-foreground mt-1">
            {lead.nome} • {lead.etapaLead}
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Etapa do lead</Label>
              <button
                type="button"
                onClick={() => setEtapa("Desistência")}
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
          <div className="space-y-2">
            <Label>Observação do contato</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Deixou mensagem, não respondeu, agendou consulta..."
              rows={4}
            />
          </div>
        </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowWhatsAppDialog(true)}
          >
            WhatsApp
          </Button>
          <Button onClick={handleConfirm}>
            Feito
          </Button>
        </DialogFooter>
        {lead && showWhatsAppDialog && (
          <WhatsAppMessageDialog
            lead={lead}
            open={showWhatsAppDialog}
            onClose={() => setShowWhatsAppDialog(false)}
            suggestedMessage={(() => {
              const template = getFollowUpMessage(lead.etapaLead);
              if (template) {
                return formatFollowUpMessage(template, lead.nome, lead.servicoProcurado);
              }
              return observacao || "";
            })()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
