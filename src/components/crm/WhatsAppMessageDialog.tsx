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
import { Textarea } from "@/components/ui/textarea";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { generateFollowUpWhatsAppLink } from "@/lib/whatsapp";

interface WhatsAppMessageDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  suggestedMessage?: string;
}

export function WhatsAppMessageDialog({
  lead,
  open,
  onClose,
  onDone,
  suggestedMessage,
}: WhatsAppMessageDialogProps) {
  const [message, setMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (suggestedMessage) {
      setMessage(suggestedMessage);
      setIsEditing(false);
    } else {
      setMessage("");
    }
  }, [suggestedMessage, open]);

  if (!lead) return null;

  const handleSend = () => {
    if (!message.trim()) {
      toast.error("Mensagem não pode estar vazia");
      return;
    }

    const whatsAppLink = generateFollowUpWhatsAppLink(
      lead.telefone,
      lead.nome,
      message
    );
    window.open(whatsAppLink, "_blank");
  };

  const handleDone = () => {
    onDone?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>WhatsApp - {lead.nome}</DialogTitle>
          <div className="text-sm text-muted-foreground mt-1">
            {lead.telefone}
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {isEditing ? (
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite sua mensagem..."
              rows={6}
              autoFocus
            />
          ) : (
            <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm whitespace-pre-wrap">
              {message}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? "Ver" : "Editar"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSend} className="bg-success hover:bg-success/90">
            Enviar
          </Button>
          <Button onClick={handleDone} className="bg-primary hover:bg-primary/90">
            <Check className="h-4 w-4 mr-1" />
            Feito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
