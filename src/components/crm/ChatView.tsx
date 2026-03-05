import { useState, useEffect } from "react";
import { useConversations } from "@/hooks/useConversations";
import { ConversationList } from "@/components/crm/ConversationList";
import { ChatWindow } from "@/components/crm/ChatWindow";
import { WhatsAppQRModal } from "@/components/crm/WhatsAppQRModal";
import { Button } from "@/components/ui/button";
import { ExternalLink, QrCode } from "lucide-react";
import { Lead } from "@/types/crm";

interface ChatViewProps {
  leads: Lead[];
  onUpdateLead: (id: string, updates: Partial<Lead>) => void;
}

export function ChatView({ leads, onUpdateLead }: ChatViewProps) {
  const {
    conversations,
    serverConnected,
    qrCode,
    sendMessage,
    markAsRead,
    useMessages,
  } = useConversations();

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  // Permite fechar o modal manualmente; reabre automaticamente quando o QR girar
  const [qrDismissed, setQrDismissed] = useState(false);
  const messages = useMessages(selectedPhone);

  const selectedConversation = conversations.find((c) => c.telefone === selectedPhone) || null;

  // Encontrar lead correspondente pelo telefone (ultimos 8 digitos)
  const currentLead = selectedPhone
    ? leads.find((l) => {
        const ld = l.telefone?.replace(/\D/g, "") || "";
        const sd = selectedPhone.replace(/\D/g, "");
        return ld.length >= 8 && sd.slice(-8) === ld.slice(-8);
      }) || null
    : null;

  // Pedir permissão de notificação ao abrir a aba
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Reabre o modal automaticamente quando chegar um QR novo
  useEffect(() => {
    if (qrCode) {
      setQrDismissed(false);
    }
  }, [qrCode]);

  const handleSelect = (telefone: string) => {
    setSelectedPhone(telefone);
  };

  const handleSend = async (message: string) => {
    if (!selectedPhone) return false;
    return sendMessage(selectedPhone, message);
  };

  const handleOpen = () => {
    if (selectedPhone) {
      markAsRead(selectedPhone);
    }
  };

  return (
    <div className="mt-6">
      {/* Banner se servidor offline */}
      {serverConnected === false && (
        <div className="mb-3 flex items-center justify-between bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm">
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
        <div className="mb-3 flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-2.5 text-sm">
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

      {/* Layout chat */}
      <div className="border border-border rounded-xl overflow-hidden bg-card" style={{ height: "calc(100vh - 220px)", minHeight: 500 }}>
        <div className="grid h-full" style={{ gridTemplateColumns: "300px 1fr" }}>
          {/* Lista de conversas */}
          <ConversationList
            conversations={conversations}
            selectedPhone={selectedPhone}
            onSelect={handleSelect}
          />

          {/* Janela de chat */}
          <ChatWindow
            conversation={selectedConversation}
            messages={messages}
            onSend={handleSend}
            onOpen={handleOpen}
            serverConnected={serverConnected}
            currentLead={currentLead}
            onUpdateLead={onUpdateLead}
          />
        </div>
      </div>

      {/* Modal QR Code WhatsApp — abre automaticamente quando QR disponivel */}
      <WhatsAppQRModal
        qrCode={qrCode && !qrDismissed ? qrCode : null}
        onClose={() => setQrDismissed(true)}
      />
    </div>
  );
}
