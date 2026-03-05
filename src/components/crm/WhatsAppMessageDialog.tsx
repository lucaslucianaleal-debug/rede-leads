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
        <DialogHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg">{lead.nome}</DialogTitle>
              <div className="text-sm text-muted-foreground mt-1">{lead.telefone}</div>
            </div>
            {onSend && (
              <span className={`text-xs flex items-center gap-1 px-2 py-1 rounded-full font-medium whitespace-nowrap shrink-0 ${
                serverConnected === true
                  ? "bg-green-100 text-green-700"
                  : serverConnected === false
                  ? "bg-red-100 text-red-600"
                  : "bg-muted text-muted-foreground"
              }`}>
                {serverConnected === true ? <><Wifi className="h-3 w-3" /> Conectado</> :
                 serverConnected === false ? <><WifiOff className="h-3 w-3" /> Offline</> :
                 "Verificando..."}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {isEditing ? (
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite sua mensagem..."
              rows={5}
              autoFocus
              className="resize-none"
            />
          ) : (
            <div
              className="p-3 rounded-lg bg-muted/50 border border-border text-sm whitespace-pre-wrap cursor-pointer hover:bg-muted/80 transition-colors min-h-[120px] flex items-center"
              onClick={() => setIsEditing(true)}
            >
              {message || <span className="text-muted-foreground italic">Clique para editar...</span>}
            </div>
          )}
          {isEditing && (
            <p className="text-xs text-muted-foreground px-1">
              {canSendDirect
                ? "✓ Será enviado direto pelo CRM (sem abrir WhatsApp)"
                : "⚠ Servidor offline — abrirá link externo do WhatsApp"}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)} className="flex-1">
            {isEditing ? "Ver" : "Editar"}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 bg-success hover:bg-success/90"
            size="sm"
          >
            <Send className="h-4 w-4 mr-1" />
            {sending ? "Enviando..." : canSendDirect ? "Enviar" : "Abrir"}
          </Button>
          {!canSendDirect && (
            <Button onClick={handleDone} className="flex-1 bg-primary hover:bg-primary/90" size="sm">
              <Check className="h-4 w-4 mr-1" />
              Feito
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
