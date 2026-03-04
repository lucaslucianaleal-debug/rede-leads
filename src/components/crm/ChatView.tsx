import { useState, useEffect } from "react";
import { useConversations } from "@/hooks/useConversations";
import { ConversationList } from "@/components/crm/ConversationList";
import { ChatWindow } from "@/components/crm/ChatWindow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export function ChatView() {
  const {
    conversations,
    serverConnected,
    sendMessage,
    markAsRead,
    useMessages,
  } = useConversations();

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const messages = useMessages(selectedPhone);

  const selectedConversation = conversations.find((c) => c.telefone === selectedPhone) || null;

  // Pedir permissão de notificação ao abrir a aba
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

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
          />
        </div>
      </div>
    </div>
  );
}
