import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { WhatsAppMessageDialog } from "./WhatsAppMessageDialog";
import { getFollowUpMessage, formatFollowUpMessage } from "@/data/followUpMessages";

interface FollowUpDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (leadId: string, observacao: string) => void;
}

export function FollowUpDialog({ lead, open, onClose, onConfirm }: FollowUpDialogProps) {
  const [observacao, setObservacao] = useState("");
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);

  if (!lead) return null;

  const handleConfirm = () => {
    onConfirm(lead.id, observacao);
    toast.success(`Follow-Up registrado para ${lead.nome}`);
    setObservacao("");
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
            <Label>Observação do contato</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Deixou mensagem, não respondeu, agendou consulta..."
              rows={4}
            />
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
