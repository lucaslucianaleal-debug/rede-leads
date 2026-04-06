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
  // useAutoStage: se true (padrão), usa a progressão automática; se false, o usuário escolheu manual
  const [useAutoStage, setUseAutoStage] = useState(true);
  const [manualStage, setManualStage] = useState<LeadStage>(lead?.etapaLead || "Novo");

  // Calcular próxima etapa automática
  const getNextStageAuto = (): LeadStage => {
    const stageProgression: LeadStage[] = [
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
    ];
    const finalStages: LeadStage[] = ["Finalizado", "Desistência", "Fora da região"];
    const current = lead?.etapaLead || "Novo";
    if (finalStages.includes(current as LeadStage)) return current as LeadStage;
    const idx = stageProgression.findIndex(s => s === current);
    if (idx === -1) return "Novo";
    const nextIdx = Math.min(idx + 1, stageProgression.length - 1);
    return stageProgression[nextIdx];
  };

  const nextAutoStage = getNextStageAuto();

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
    const finalStage = useAutoStage ? nextAutoStage : manualStage;
    onConfirm(lead.id, observacao, finalStage);
    toast.success(`Follow-Up registrado: ${lead.nome} → ${finalStage}`);
    setObservacao("");
    setUseAutoStage(true);
    setManualStage(lead?.etapaLead || "Novo");
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
          {/* Auto-progression indicator */}
          <div className="p-2 rounded bg-blue-50 border border-blue-200">
            <div className="text-xs font-medium text-blue-900">
              Progressão automática:
            </div>
            <div className="text-sm text-blue-700 mt-1">
              {lead.etapaLead} → <span className="font-semibold">{nextAutoStage}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-stage"
                checked={useAutoStage}
                onChange={(e) => setUseAutoStage(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="auto-stage" className="text-sm font-medium cursor-pointer">
                Usar progressão automática
              </label>
            </div>
          </div>

          {/* Manual override section */}
          {!useAutoStage && (
            <div className="space-y-2">
              <Label>Escolher etapa diferente</Label>
              <Select value={manualStage} onValueChange={(value) => setManualStage(value as LeadStage)}>
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
          )}

          {/* Quick desist button */}
          {useAutoStage && (
            <button
              type="button"
              onClick={() => {
                setUseAutoStage(false);
                setManualStage("Desistência");
              }}
              className="w-full text-xs px-2 py-2 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition font-medium"
            >
              Marcar como Desistência  
            </button>
          )}
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
