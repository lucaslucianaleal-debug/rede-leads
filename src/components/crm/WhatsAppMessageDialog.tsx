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
import { Check, Send, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { generateFollowUpWhatsAppLink } from "@/lib/whatsapp";

interface WhatsAppMessageDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  suggestedMessage?: string;
  onSend?: (telefone: string, message: string) => Promise<boolean>;
  serverConnected?: boolean | null;
}

export function WhatsAppMessageDialog({
  lead,
  open,
  onClose,
  onDone,
  suggestedMessage,
  onSend,
  serverConnected,
}: WhatsAppMessageDialogProps) {
  const [message, setMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (suggestedMessage) {
      setMessage(suggestedMessage);
      setIsEditing(false);
    } else {
      setMessage("");
      setIsEditing(true);
    }
  }, [suggestedMessage, open]);

  if (!lead) return null;

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Mensagem não pode estar vazia");
      return;
    }

    // Se servidor disponível, envia direto pelo CRM
    if (onSend && serverConnected !== false) {
      setSending(true);
      const ok = await onSend(lead.telefone, message);
      setSending(false);
      if (ok) {
        toast.success(`Mensagem enviada para ${lead.nome} ✓`);
        onDone?.();
        onClose();
      }
      return;
    }

    // Fallback: abre link externo se servidor offline
    const whatsAppLink = generateFollowUpWhatsAppLink(lead.telefone, lead.nome, message);
    window.open(whatsAppLink, "_blank");
  };

  const handleDone = () => {
    onDone?.();
    onClose();
  };

  const canSendDirect = onSend && serverConnected !== false;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>WhatsApp — {lead.nome}</span>
            {onSend && (
              <span className={`text-xs flex items-center gap-1 px-2 py-0.5 rounded-full font-normal ${
                serverConnected === true
                  ? "bg-green-100 text-green-700"
                  : serverConnected === false
                  ? "bg-red-100 text-red-600"
                  : "bg-muted text-muted-foreground"
              }`}>
                {serverConnected === true ? <><Wifi className="h-3 w-3" /> CRM conectado</> :
                 serverConnected === false ? <><WifiOff className="h-3 w-3" /> Offline — link externo</> :
                 "Verificando..."}
              </span>
            )}
          </DialogTitle>
          <div className="text-sm text-muted-foreground mt-1">{lead.telefone}</div>
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
            <div
              className="p-3 rounded-lg bg-muted/50 border border-border text-sm whitespace-pre-wrap cursor-pointer hover:bg-muted/80 transition-colors"
              onClick={() => setIsEditing(true)}
            >
              {message || <span className="text-muted-foreground italic">Clique para editar...</span>}
            </div>
          )}
          {isEditing && (
            <p className="text-xs text-muted-foreground">
              {canSendDirect
                ? "✓ Será enviado direto pelo CRM (sem abrir WhatsApp)"
                : "⚠ Servidor offline — abrirá link externo do WhatsApp"}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? "Ver" : "Editar"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="bg-success hover:bg-success/90"
          >
            <Send className="h-4 w-4 mr-1" />
            {sending ? "Enviando..." : canSendDirect ? "Enviar pelo CRM" : "Abrir WhatsApp"}
          </Button>
          {!canSendDirect && (
            <Button onClick={handleDone} className="bg-primary hover:bg-primary/90">
              <Check className="h-4 w-4 mr-1" />
              Feito
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
