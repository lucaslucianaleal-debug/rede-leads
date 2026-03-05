import { useState, useEffect } from "react";
import { useConversations } from "@/hooks/useConversations";
import { ConversationList } from "@/components/crm/ConversationList";
import { ChatWindow } from "@/components/crm/ChatWindow";
import { WhatsAppQRModal } from "@/components/crm/WhatsAppQRModal";
import { EditLeadDialog } from "@/components/crm/EditLeadDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, QrCode } from "lucide-react";
import { Lead } from "@/types/crm";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, writeBatch, deleteDoc, setDoc, Timestamp } from "firebase/firestore";
import { toast } from "sonner";

interface ChatViewProps {
  leads: Lead[];
  onUpdateLead: (id: string, updates: Partial<Lead>) => void;
  openTarget?: { phone: string; message?: string } | null;
  onOpenTargetHandled?: () => void;
}

export function ChatView({ leads, onUpdateLead, openTarget, onOpenTargetHandled }: ChatViewProps) {
  const {
    conversations,
    serverConnected,
    qrCode,
    sendMessage,
    markAsRead,
    useMessages,
  } = useConversations();

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [prefilledMessage, setPrefilledMessage] = useState<string>("");
  const [qrDismissed, setQrDismissed] = useState(false);
  const [editLeadPhone, setEditLeadPhone] = useState<string | null>(null);
  const [deletePhone, setDeletePhone] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [conversationListWidth, setConversationListWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const messages = useMessages(selectedPhone);

  const selectedConversation = selectedPhone
    ? conversations.find((c) => {
        if (c.telefone === selectedPhone) return true;
        const sd = selectedPhone.replace(/\D/g, "");
        const cd = c.telefone.replace(/\D/g, "");
        return sd.length >= 8 && cd.slice(-8) === sd.slice(-8);
      }) || null
    : null;

  // Encontrar lead correspondente pelo telefone (ultimos 8 digitos)
  const currentLead = selectedPhone
    ? leads.find((l) => {
        const ld = l.telefone?.replace(/\D/g, "") || "";
        const sd = selectedPhone.replace(/\D/g, "");
        return ld.length >= 8 && sd.slice(-8) === ld.slice(-8);
      }) || null
    : null;

  // Abrir conversa a partir de atalho (FollowUpQueue / AllLeadsView)
  useEffect(() => {
    if (!openTarget) return;
    if (conversations.length === 0) return; // aguardar carregamento das conversas
    const digits = openTarget.phone.replace(/\D/g, "");
    const match = conversations.find((c) => {
      const cd = c.telefone.replace(/\D/g, "");
      return cd.slice(-8) === digits.slice(-8);
    });
    
    // Se conversa não existe, criar no Firestore
    if (!match) {
      const createConversation = async () => {
        try {
          const lead = leads.find((l) => {
            const ld = l.telefone?.replace(/\D/g, "") || "";
            return ld.length >= 8 && digits.slice(-8) === ld.slice(-8);
          });
          
          // Normalizar telefone: adicionar código país se não tiver
          const fullPhone = digits.length === 11 ? `55${digits}` : digits;
          
          const convRef = doc(db, "conversations", fullPhone);
          await setDoc(convRef, {
            telefone: fullPhone,
            leadNome: lead?.nome || "Novo Contato",
            createdAt: Timestamp.now(),
            lastMessageAt: null,
            unreadCount: 0,
            lastMessage: ""
          }, { merge: true });
          
          console.log(`[ChatView] Conversa criada para ${fullPhone}`);
          // Aguardar um pouco para o hook useConversations pegar a nova conversa
          await new Promise(resolve => setTimeout(resolve, 500));
          setSelectedPhone(fullPhone);
          if (openTarget.message) setPrefilledMessage(openTarget.message);
          onOpenTargetHandled?.();
        } catch (err) {
          console.error(`[ChatView] Erro ao criar conversa: ${err}`);
        }
      };
      createConversation();
      return;
    }
    
    const targetPhone = match.telefone;
    setSelectedPhone(targetPhone);
    if (openTarget.message) setPrefilledMessage(openTarget.message);
    onOpenTargetHandled?.();
  }, [openTarget, conversations, leads]);

  // Pedir permissão de notificação ao abrir a aba
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (qrCode) {
      setQrDismissed(false);
    }
  }, [qrCode]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(260, Math.min(500, e.clientX));
      setConversationListWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleSelect = (telefone: string) => {
    setSelectedPhone(telefone);
  };

  const handleEditLead = (telefone: string) => {
    setEditLeadPhone(telefone);
  };

  const handleDeleteConversation = async () => {
    if (!deletePhone) return;
    setDeleting(true);
    try {
      // Usa o ID exato da conversa (pode não ser só dígitos se foi criado com nome/ID estranho)
      let targetConvId = deletePhone;
      
      // Tenta encontrar a conversa por matching de dígitos (últimos 11 dígitos)
      const digits = deletePhone.replace(/\D/g, "");
      const last11 = digits.slice(-11);
      
      if (last11.length >= 11) {
        // Verifica se há conversa com ID exato primeiro
        try {
          const directSnap = await getDocs(collection(db, "conversations", digits, "messages"));
          console.log("Conversa encontrada com ID exato de dígitos");
          targetConvId = digits;
        } catch (e) {
          // Senão, procura por matching de 11 dígitos em todas as conversas
          const allConvs = await getDocs(collection(db, "conversations"));
          for (const convDoc of allConvs.docs) {
            const convDigits = convDoc.id.replace(/\D/g, "");
            if (convDigits.length >= 11 && convDigits.slice(-11) === last11) {
              targetConvId = convDoc.id;
              console.log(`Conversa encontrada por 11-digitos matching: ${targetConvId}`);
              break;
            }
          }
        }
      }
      
      const convRef = doc(db, "conversations", targetConvId);
      // Apaga todas as mensagens primeiro
      const msgsSnap = await getDocs(collection(db, "conversations", targetConvId, "messages"));
      const batch = writeBatch(db);
      msgsSnap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      // Apaga o doc da conversa
      await deleteDoc(convRef);
      if (selectedPhone === deletePhone) setSelectedPhone(null);
      toast.success("Conversa apagada.");
    } catch (e) {
      console.error("Erro ao apagar conversa:", e.message);
      toast.error("Erro ao apagar conversa.");
    } finally {
      setDeleting(false);
      setDeletePhone(null);
    }
  };

  // Lead alvo para editar (match por telefone)
  const editLeadTarget = editLeadPhone
    ? leads.find((l) => {
        const ld = l.telefone?.replace(/\D/g, "") || "";
        const sd = editLeadPhone.replace(/\D/g, "");
        return ld.length >= 8 && sd.slice(-8) === ld.slice(-8);
      }) || null
    : null;

  const handleSend = async (message: string) => {
    if (!selectedConversation) return false;
    // Usar o telefone da conversa (ID canônico no Firestore) para garantir envio correto
    return sendMessage(selectedConversation.telefone, message);
  };

  const handleOpen = () => {
    if (selectedConversation) {
      // Marcar conversa como lida usando seu ID no Firestore
      markAsRead(selectedConversation.telefone);
    }
  };

  return (
    <div className="mt-4 flex flex-col" style={{ height: "calc(100vh - 190px)", minHeight: 520 }}>
      {/* Banner se servidor offline */}
      {serverConnected === false && (
        <div className="mb-2 flex items-center justify-between bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm shrink-0">
          <span>
            ⚠️ Servidor WhatsApp offline. Para receber e enviar mensagens, inicie o servidor:
            <code className="ml-2 bg-amber-100 px-1.5 py-0.5 rounded text-xs">
              cd whatsapp-server &amp;&amp; npm start
            </code>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-700 ml-3 shrink-0"
            onClick={() => window.open("https://github.com/lucaslucianaleal-debug/rede-leads", "_blank")}
          >
            <ExternalLink className="h-3 w-3 mr-1" /> Docs
          </Button>
        </div>
      )}

      {/* Botão para reabrir QR se foi fechado manualmente */}
      {qrCode && qrDismissed && (
        <div className="mb-2 flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-2.5 text-sm shrink-0">
          <span>📱 WhatsApp aguardando autenticação. Escaneie o QR Code para conectar.</span>
          <Button
            variant="outline"
            size="sm"
            className="border-blue-300 text-blue-700 ml-3 shrink-0"
            onClick={() => setQrDismissed(false)}
          >
            <QrCode className="h-3 w-3 mr-1" /> Ver QR Code
          </Button>
        </div>
      )}

      {/* Layout chat — ocupa espaço restante */}
      <div className="flex-1 min-h-0 border border-border rounded-xl overflow-hidden bg-card">
        <div className="flex h-full">
          <div style={{ width: `${conversationListWidth}px` }} className="shrink-0 overflow-hidden">
            <ConversationList
              conversations={conversations}
              selectedPhone={selectedPhone}
              onSelect={handleSelect}
              onEditLead={handleEditLead}
              onDeleteConversation={(tel) => setDeletePhone(tel)}
            />
          </div>
          <div
            onMouseDown={() => setIsResizing(true)}
            className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors flex-shrink-0"
            title="Arraste para redimensionar"
          />
          <div className="flex-1 min-w-0">
            <ChatWindow
              conversation={selectedConversation}
              messages={messages}
              onSend={handleSend}
              onOpen={handleOpen}
              serverConnected={serverConnected}
              currentLead={currentLead}
              onUpdateLead={onUpdateLead}
              prefilledMessage={prefilledMessage}
              onPrefilledConsumed={() => setPrefilledMessage("")}
            />
          </div>
        </div>
      </div>

      {/* Modal QR Code WhatsApp — abre automaticamente quando QR disponivel */}
      <WhatsAppQRModal
        qrCode={qrCode && !qrDismissed ? qrCode : null}
        onClose={() => setQrDismissed(true)}
      />

      {/* Dialog Editar Lead */}
      {editLeadTarget && (
        <EditLeadDialog
          lead={editLeadTarget}
          open={!!editLeadPhone}
          onClose={() => setEditLeadPhone(null)}
          onSave={(id, updates) => {
            onUpdateLead(id, updates);
            setEditLeadPhone(null);
          }}
        />
      )}

      {/* Confirmação apagar conversa */}
      <AlertDialog open={!!deletePhone} onOpenChange={(open) => !open && setDeletePhone(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens desta conversa serão apagadas permanentemente. O lead no CRM <strong>não</strong> será apagado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "Apagando..." : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
