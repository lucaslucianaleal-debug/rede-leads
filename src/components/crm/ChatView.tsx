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
import { normalizePhoneTo10Digits } from "@/lib/phone";

interface ChatViewProps {
  leads: Lead[];
  onUpdateLead: (id: string, updates: Partial<Lead>) => void;
  openTarget?: { phone: string; message?: string } | null;
  onOpenTargetHandled?: () => void;
  onCreateLead?: (lead: Omit<Lead, 'id'>) => void;
}

export function ChatView({ leads, onUpdateLead, openTarget, onOpenTargetHandled, onCreateLead }: ChatViewProps) {
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
  
  // Rastrear conversas criadas localmente (otimistic update antes do Firebase sincronizar)
  const [localConversations, setLocalConversations] = useState<Record<string, import("@/hooks/useConversations").Conversation>>({});
  
  const messages = useMessages(selectedPhone);

  // Combinar conversas do Firebase + conversas locais criadas
    const allConversations = [
    ...conversations,
    ...Object.values(localConversations).filter(
      (local) => !conversations.some((fb) => {
        const fbDigits = fb.telefone.replace(/\D/g, "");
        const localDigits = local.telefone.replace(/\D/g, "");
        return fbDigits.slice(-10) === localDigits.slice(-10);
      })
    ),
  ];

  const selectedConversation = selectedPhone
    ? allConversations.find((c) => {
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
    console.log(`[ChatView] openTarget recebido:`, openTarget);
    
    const digits = openTarget.phone.replace(/\D/g, "");
    console.log(`[ChatView] Dígitos extraídos: ${digits}`);
    
    // Procura conversa existente (FB + locais)
    const match = allConversations.find((c) => {
      const cd = c.telefone.replace(/\D/g, "");
      return cd.slice(-8) === digits.slice(-8);
    });
    
    console.log(`[ChatView] Conversa match encontrada:`, match?.telefone || "NENHUMA");
    
    if (match) {
      // Conversa já existe - abrir diretamente
      console.log(`[ChatView] ✓ Conversa encontrada, abrindo: ${match.telefone}`);
      setSelectedPhone(match.telefone);
      if (openTarget.message) setPrefilledMessage(openTarget.message);
      onOpenTargetHandled?.();
      console.log(`[ChatView] ✓ openTargetHandled chamado - resetando estado`);
      return;
    }
    
    // Conversa não existe - criar nova
    const createConversation = async () => {
      try {
        const lead = leads.find((l) => {
          const ld = l.telefone?.replace(/\D/g, "") || "";
          return ld.length >= 8 && digits.slice(-8) === ld.slice(-8);
        });
        
        console.log(`[ChatView] Lead encontrado para criar conversa:`, lead?.nome || "Nenhum");
        
        // Normalizar para 10 dígitos (padrão atual: DDD + número sem o 9 extra)
        const normalized10 = normalizePhoneTo10Digits(openTarget.phone);
        console.log(`[ChatView] Telefone normalizado para 10 dígitos: ${normalized10}`);

        if (!normalized10) {
          console.error(`[ChatView] FALHA: normalização retornou vazio. Input: ${openTarget.phone}`);
          toast.error("Telefone inválido. Não foi possível abrir conversa.");
          onOpenTargetHandled?.();
          return;
        }
        
        // Adicionar conversa ao estado LOCAL imediatamente (otimistic update)
        const newConversation = {
          telefone: normalized10,
          leadNome: lead?.nome || "Novo Contato",
          lastMessage: "",
          lastMessageAt: null,
          unreadCount: 0,
        };
        setLocalConversations((prev) => ({
          ...prev,
          [normalized10]: newConversation,
        }));
        console.log(`[ChatView] ✓ Conversa adicionada ao estado LOCAL: ${normalized10}`);
        
        // Criar documento no Firebase (merge para not overwrite se já existe)
        const convRef = doc(db, "conversations", normalized10);
        await setDoc(convRef, {
          telefone: normalized10,
          leadNome: lead?.nome || "Novo Contato",
          createdAt: Timestamp.now(),
          lastMessageAt: null,
          unreadCount: 0,
          lastMessage: ""
        }, { merge: true });
        
        console.log(`[ChatView] ✓ Conversa criada no Firebase com ID: ${normalized10}`);
        
        // Abrir a conversa IMEDIATAMENTE (sem esperar sincronização)
        console.log(`[ChatView] ✓ Abrindo conversa criada...`);
        setSelectedPhone(normalized10);
        if (openTarget.message) setPrefilledMessage(openTarget.message);
        onOpenTargetHandled?.();
        console.log(`[ChatView] ✓ openTargetHandled chamado - resetando estado`);
        
        // A conversa permanece em localConversations até sincronizar com Firebase
        // O filter evita duplicatas quando chegar no listener
      } catch (err) {
        console.error(`[ChatView] ✗ Erro ao criar conversa:`, err);
        toast.error("Erro ao criar conversa: " + String(err));
        // Remover do estado local em caso de erro
        setLocalConversations((prev) => {
          const updated = { ...prev };
          delete updated[normalizePhoneTo10Digits(openTarget.phone)];
          return updated;
        });
        onOpenTargetHandled?.();
      }
    };
    
    createConversation();
  }, [openTarget, allConversations, leads]);

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
      // Tenta deletar com o ID EXATO primeiro (pode ser "55unknown...", "55...", etc)
      let success = false;
      let convRef = doc(db, "conversations", deletePhone);
      
      // Tenta deletar com o ID exato
      try {
        // Apaga todas as mensagens com o ID exato
        const msgsSnap = await getDocs(collection(db, "conversations", deletePhone, "messages"));
        if (msgsSnap.docs.length > 0) {
          const batch = writeBatch(db);
          msgsSnap.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          console.log(`Deletadas ${msgsSnap.docs.length} mensagens de ${deletePhone}`);
        }
        
        // Apaga o documento da conversa
        await deleteDoc(convRef);
        success = true;
        console.log(`Conversa deletada: ${deletePhone}`);
      } catch (e) {
        console.warn(`Falha ao deletar com ID exato ${deletePhone}:`, e.message);
        
        // Fallback: se falhou, procura conversas que contenham parte do ID
        // Útil se o ID for "55unknown..." e a conversa tenha sido salva com ID diferente
        const allConvs = await getDocs(collection(db, "conversations"));
        
        for (const convDoc of allConvs.docs) {
          // Se o ID atual é "55unknown...", procura por conversas órfãs similares
          if (deletePhone.includes("unknown")) {
            // Extrai os números após "unknown"
            const unknownMatch = deletePhone.match(/unknown(\d+)/);
            if (unknownMatch && convDoc.id.includes(unknownMatch[1])) {
              // Encontrou conversa órfã similar
              const msgsSnap = await getDocs(
                collection(db, "conversations", convDoc.id, "messages")
              );
              const batch = writeBatch(db);
              msgsSnap.forEach((d) => batch.delete(d.ref));
              await batch.commit();
              
              await deleteDoc(doc(db, "conversations", convDoc.id));
              success = true;
              console.log(`Conversa órfã deletada: ${convDoc.id}`);
              break;
            }
          } else {
            // Para IDs normais, tenta matching por 10 dígitos (DDD + número sem o 9 extra)
            const digits = deletePhone.replace(/\D/g, "");
            const last10 = digits.slice(-10);
            const convDigits = convDoc.id.replace(/\D/g, "");

            if (
              last10.length >= 10 &&
              convDigits.length >= 10 &&
              convDigits.slice(-10) === last10
            ) {
              const msgsSnap = await getDocs(
                collection(db, "conversations", convDoc.id, "messages")
              );
              const batch = writeBatch(db);
              msgsSnap.forEach((d) => batch.delete(d.ref));
              await batch.commit();
              
              await deleteDoc(doc(db, "conversations", convDoc.id));
              success = true;
              console.log(`Conversa deletada por matching: ${convDoc.id}`);
              break;
            }
          }
        }
      }
      
      if (success) {
        if (selectedPhone === deletePhone) setSelectedPhone(null);
        toast.success("Conversa apagada.");
      } else {
        toast.error("Conversa não encontrada para ser deletada.");
      }
    } catch (e) {
      console.error("Erro ao apagar conversa:", e.message);
      toast.error(`Erro ao apagar conversa: ${e.message}`);
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
              conversations={allConversations}
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
              onCreateLead={onCreateLead}
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
