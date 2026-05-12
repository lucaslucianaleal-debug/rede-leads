import { useState, useEffect } from "react";
import { useLeads } from "@/hooks/useLeads";
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
import { Textarea } from "@/components/ui/textarea";
import { Check, Send, Wifi, WifiOff, Copy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const { updateLead } = useLeads();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string>(lead?.status || "MORNO");
  const [etapa, setEtapa] = useState<LeadStage>(lead?.etapaLead || "Novo");
  const [isEditing, setIsEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [includeVoucher, setIncludeVoucher] = useState(false);
  const [voucherPreviewUrl, setVoucherPreviewUrl] = useState<string | null>(null);
  const [foundVoucherId, setFoundVoucherId] = useState<string | null>(null);
  const [hasVoucherAvailable, setHasVoucherAvailable] = useState(false);
  const [voucherCopied, setVoucherCopied] = useState(false);

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
    setVoucherCopied(false);
    setStatus(lead?.status || "MORNO");
    setEtapa(lead?.etapaLead || "Novo");
  }, [suggestedMessage, open, lead?.status]);

  if (!lead) return null;

  const handleSend = async () => {
    // Atualiza etapa do lead se mudou (status já foi atualizado instantaneamente)
    if (updateLead && lead) {
      if (etapa && lead.etapaLead !== etapa) {
        updateLead(lead.id, { etapaLead: etapa });
      }
    }
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

    // Abre o app do WhatsApp diretamente via protocolo nativo (evita corrupção de emojis no wa.me)
    const phone = lead.telefone.replace(/[^0-9]/g, "");
    const appLink = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
    window.open(appLink, "_blank");
    toast.success(`Abrindo WhatsApp para ${lead.nome}`);
    // NÃO fecha o diálogo aqui
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

  const handleCopyVoucher = async () => {
    if (!voucherPreviewUrl) return;
    try {
      const response = await fetch(voucherPreviewUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      setVoucherCopied(true);
      toast.success("Imagem copiada! Cole no WhatsApp quando abrir.");
      setTimeout(() => setVoucherCopied(false), 2000);
    } catch (e) {
      console.error('Erro ao copiar imagem:', e);
      toast.error("Não consegui copiar. Tenta salvar a imagem manualmente.");
    }
  };

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
          {/* Status do lead */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status do lead</label>
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
              <label className="text-sm font-medium">Etapa do lead</label>
              <button
                type="button"
                onClick={() => {
                  setEtapa("Desistência");
                  setStatus("FRIO");
                  if (updateLead && lead) {
                    updateLead(lead.id, { status: "FRIO" as any });
                  }
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

          {(lead.voucherPending || hasVoucherAvailable) && (
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeVoucher} onChange={(e) => setIncludeVoucher(e.target.checked)} />
                <span className="text-sm font-medium">Incluir Voucher</span>
              </label>
              
              {includeVoucher && voucherPreviewUrl && (
                <div className="space-y-2">
                  {/* Preview expandido */}
                  <img 
                    src={voucherPreviewUrl} 
                    alt="voucher" 
                    className="w-full rounded-lg shadow-md border border-border"
                  />
                  
                  {/* Botão copiar */}
                  <Button
                    onClick={handleCopyVoucher}
                    variant={voucherCopied ? "default" : "outline"}
                    className="w-full"
                    size="sm"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {voucherCopied ? "✓ Copiada!" : "Copiar Imagem"}
                  </Button>
                  
                  {/* Instruções */}
                  <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                    💡 Clique em "Enviar" abaixo. Quando o WhatsApp abrir, cole a imagem com <span className="font-mono bg-blue-100 px-1 rounded">Ctrl+V</span>
                  </p>
                </div>
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
