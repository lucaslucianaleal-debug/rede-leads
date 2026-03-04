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
import { formatPhoneNumber } from "@/lib/phone";

interface CallLogDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (leadId: string, outcome: string, obs: string) => void;
}

const OUTCOMES = [
  { value: "Atendeu", label: "📞 Atendeu" },
  { value: "Caixa de mensagem", label: "📭 Caiu na caixa" },
  { value: "Não atendeu", label: "🔕 Não atendeu" },
  { value: "Número errado", label: "❌ Número errado" },
];

export function CallLogDialog({ lead, open, onClose, onConfirm }: CallLogDialogProps) {
  const [outcome, setOutcome] = useState("Caixa de mensagem");
  const [obs, setObs] = useState("");

  if (!lead) return null;

  const handleConfirm = () => {
    onConfirm(lead.id, outcome, obs);
    toast.success("Ligação registrada!");
    setObs("");
    setOutcome("Caixa de mensagem");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar Ligação</DialogTitle>
          <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
            <div className="text-xs text-muted-foreground mb-1">{lead.nome}</div>
            <div className="text-2xl font-mono font-bold tracking-widest text-foreground">
              {formatPhoneNumber(lead.telefone)}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Outcome */}
          <div className="space-y-2">
            <Label>Resultado da ligação</Label>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setOutcome(o.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors text-left ${
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
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
