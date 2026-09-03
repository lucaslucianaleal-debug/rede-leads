// Compatibilidade temporária com a interface antiga de Chat.
//
// O chat legado lia a coleção inteira de `conversations`, reabria listeners
// e consultava um servidor em localhost. Isso foi desativado no WhatsApp Agent v2.
// O novo fluxo usa uma fila pequena no backend e um agente local somente como ponte.

export interface ChatMessage {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: any;
  read: boolean;
  replyTo?: {
    messageId: string;
    bodyPreview: string;
    fromMe: boolean;
  };
}

export interface Conversation {
  telefone: string;
  leadNome: string;
  lastMessage: string;
  lastMessageAt: any;
  unreadCount: number;
}

export function useConversations() {
  const useMessages = (_telefone: string | null): ChatMessage[] => [];

  return {
    conversations: [] as Conversation[],
    totalUnread: 0,
    serverConnected: false as boolean | null,
    qrCode: null as string | null,
    refreshConversations: () => {},
    sendMessage: async (_telefone: string, _message: string) => false,
    markAsRead: async (_telefone: string) => {},
    useMessages,
  };
}
