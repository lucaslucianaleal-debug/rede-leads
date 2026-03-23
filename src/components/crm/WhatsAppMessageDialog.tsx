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
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc, runTransaction, serverTimestamp, getDoc } from 'firebase/firestore';

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
  const [includeVoucher, setIncludeVoucher] = useState(false);
  const [voucherPreviewUrl, setVoucherPreviewUrl] = useState<string | null>(null);
  const [foundVoucherId, setFoundVoucherId] = useState<string | null>(null);
  const [hasVoucherAvailable, setHasVoucherAvailable] = useState(false);

  useEffect(() => {
    if (suggestedMessage) {
      setMessage(suggestedMessage);
      setIsEditing(false);
    } else {
      setMessage("");
      setIsEditing(true);
    }
    setIncludeVoucher(false);
    setVoucherPreviewUrl(null);
    setFoundVoucherId(null);
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
        // If voucher was included, mark voucher as sent in Firestore and clear lead flag
        if (includeVoucher && foundVoucherId) {
          try {
            // mark voucher doc as sent and update crm_data/shared lead entry
            await runTransaction(db, async (tx) => {
              const voucherRef = doc(db, 'vouchers', foundVoucherId);
              tx.update(voucherRef, { status: 'sent', sentAt: serverTimestamp() });

              const crmRef = doc(db, 'crm_data', 'shared');
              const crmSnap = await tx.get(crmRef);
              if (!crmSnap.exists()) {
                console.error('Blocked write to crm_data/shared: document not found when marking voucher sent for lead', lead.id || lead.telefone);
                throw new Error('Blocked write to crm_data/shared: document not found');
              }
              const curr = crmSnap.data() || {};
              const currLeads = Array.isArray(curr.leads) ? curr.leads.slice() : [];
              if (!Array.isArray(currLeads) || currLeads.length === 0) {
                console.error('Blocked write to crm_data/shared: currLeads empty when marking voucher sent', { leadId: lead.id });
                throw new Error('Blocked write to crm_data/shared: empty leads array');
              }
              const idx = currLeads.findIndex(l => (l.id && lead.id && l.id === lead.id) || (l.telefone && lead.telefone && l.telefone === lead.telefone));
              if (idx >= 0) {
                const updated = Object.assign({}, currLeads[idx], { voucherPending: false, voucherSentAt: new Date().toISOString(), voucherLabel: 'Enviado' });
                currLeads[idx] = updated;
                tx.update(crmRef, { leads: currLeads });
              }
            });
          } catch (e) {
            console.error('Failed to mark voucher as sent', e);
          }
        }
        onDone?.();
        onClose();
      }
      return;
    }

    // Tenta abrir o WhatsApp, mas NÃO fecha o diálogo automaticamente
    const phone = lead.telefone.replace(/[^0-9]/g, "");
    const appLink = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
    const webLink = generateFollowUpWhatsAppLink(lead.telefone, lead.nome, message);

    let fallbackFired = false;
    const fallbackTimer = window.setTimeout(() => {
      fallbackFired = true;
      window.open(webLink, "_blank");
      toast.success(`Abrindo WhatsApp Web para ${lead.nome}`);
      // NÃO fecha o diálogo aqui
    }, 900);

    try {
      const opened = window.open(appLink);
      if (!opened) {
        clearTimeout(fallbackTimer);
        window.open(webLink, "_blank");
        toast.success(`Abrindo WhatsApp Web para ${lead.nome}`);
        // NÃO fecha o diálogo aqui
        return;
      }
    } catch (e) {
      clearTimeout(fallbackTimer);
      window.open(webLink, "_blank");
      toast.success(`Abrindo WhatsApp Web para ${lead.nome}`);
      // NÃO fecha o diálogo aqui
      return;
    }

    // NÃO fecha o diálogo automaticamente
  };

  // If user toggles includeVoucher and lead has pending voucher, try find voucher doc
  useEffect(() => {
    let mounted = true;
    async function findVoucher() {
      setVoucherPreviewUrl(null);
      setFoundVoucherId(null);
      if (!lead || !includeVoucher) return;
      try {
        const q = query(collection(db, 'vouchers'), where('leadId', '==', lead.id || ''), where('status', '==', 'issued'));
        const snap = await getDocs(q);
        if (!mounted) return;
        if (!snap.empty) {
          const doc0 = snap.docs[0];
          setFoundVoucherId(doc0.id);
          const data = doc0.data() as any;
          // prefer a hosted image URL if present, else try to build relative path
          let img = data.imageUrl || data.imageLocalPath || '';
          let fileName = '';
          if (img) {
            if (img.indexOf('C:\\') === 0 || img.indexOf('/') === -1) {
              // Caminho local Windows ou só nome do arquivo
              fileName = img.split('\\').pop() || img.split('/').pop() || '';
              img = `/Voucher/${fileName}`;
            } else if (img.startsWith('/Voucher/')) {
              fileName = img.split('/').pop() || '';
            }
          }
          setVoucherPreviewUrl(img || null);
          // Log para depuração
          console.log('Voucher doc:', data);
          console.log('Voucher preview url:', img);
          // Sempre prefill message com texto do voucher ao marcar
          const amount = data.amount || (lead.voucherLastIssuedTier === 3 ? 500 : lead.voucherLastIssuedTier === 2 ? 300 : 200);
          const expiry = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString() : '';
          setMessage(`Olá ${lead.nome}, temos um voucher de R$${amount} válido até ${expiry} para você agendar seu procedimento de ${lead.servicoProcurado || ''}. Responda "EUQUERO" para garantir.`);
          setIsEditing(false);
        }
      } catch (e) {
        console.error('Error finding voucher', e);
      }
    }
    findVoucher();
    return () => { mounted = false; };
  }, [includeVoucher, lead]);

  // If local lead doesn't have voucherPending, check crm_data/shared for a matching lead entry
  useEffect(() => {
    let mounted = true;
    async function checkSharedDoc() {
      setHasVoucherAvailable(false);
      if (!lead) return;
      try {
        const sharedRef = doc(db, 'crm_data', 'shared');
        const snap = await getDoc(sharedRef);
        if (!mounted || !snap.exists()) return;
        const data = snap.data() || {};
        const leadsArr = Array.isArray(data.leads) ? data.leads : [];
        const match = leadsArr.find((l: any) => {
          try {
            const a = (l.telefone || '').replace(/\D/g, '');
            const b = (lead.telefone || '').replace(/\D/g, '');
            return a && b && (a === b || a.endsWith(b) || b.endsWith(a));
          } catch {
            return false;
          }
        });
        if (match && (match.voucherPending || match.voucherLastIssuedTier)) {
          setHasVoucherAvailable(true);
        }
      } catch (e) {
        // ignore
      }
    }
    checkSharedDoc();
    return () => { mounted = false; };
  }, [lead]);

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
              <DialogTitle className="text-lg">{(lead.nome || "").split(" ")[0]}</DialogTitle>
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
          {(lead.voucherPending || hasVoucherAvailable) && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeVoucher} onChange={(e) => setIncludeVoucher(e.target.checked)} />
                <span className="text-sm">Incluir Voucher</span>
              </label>
              {voucherPreviewUrl && (
                <img src={voucherPreviewUrl} alt="voucher" className="h-10 rounded shadow-sm" />
              )}
            </div>
          )}
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
              className="p-3 rounded-lg bg-muted/50 border border-border text-sm whitespace-pre-line cursor-pointer hover:bg-muted/80 transition-colors min-h-[120px] flex items-center"
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
