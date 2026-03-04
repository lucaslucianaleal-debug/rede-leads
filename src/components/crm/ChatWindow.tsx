import { useEffect, useRef, useState } from "react";
import { ChatMessage, Conversation } from "@/hooks/useConversations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, MessageCircle, CheckCheck, Wifi, WifiOff } from "lucide-react";

interface ChatWindowProps {
  conversation: Conversation | null;
  messages: ChatMessage[];
  onSend: (message: string) => Promise<boolean>;
  onOpen: () => void; // chamado quando a janela é aberta (marcar como lido)
  serverConnected: boolean | null;
}

export function ChatWindow({ conversation, messages, onSend, onOpen, serverConnected }: ChatWindowProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Rolar para o fim quando novas msgs chegam
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Marcar como lido ao abrir
  useEffect(() => {
    if (conversation) {
      onOpen();
    }
  }, [conversation?.telefone]);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || !conversation) return;
    setText("");
    setSending(true);
    await onSend(msg);
    setSending(false);
  };

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <MessageCircle className="h-16 w-16 opacity-20" />
        <div className="text-center">
          <p className="font-medium">Selecione uma conversa</p>
          <p className="text-sm opacity-70 mt-1">Escolha um lead na lista ao lado</p>
        </div>
      </div>
    );
  }

  const groupedMessages = groupByDate(messages);

  return (
    <div className="flex flex-col h-full">
      {/* Header da conversa */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
            {conversation.leadNome.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm">{conversation.leadNome}</p>
            <p className="text-xs text-muted-foreground">{formatPhone(conversation.telefone)}</p>
          </div>
        </div>
        {/* Status do servidor */}
        <div className={cn(
          "flex items-center gap-1.5 text-xs px-2 py-1 rounded-full",
          serverConnected === true ? "bg-green-100 text-green-700" :
          serverConnected === false ? "bg-red-100 text-red-600" :
          "bg-muted text-muted-foreground"
        )}>
          {serverConnected === true ? (
            <><Wifi className="h-3 w-3" /> Conectado</>
          ) : serverConnected === false ? (
            <><WifiOff className="h-3 w-3" /> Servidor offline</>
          ) : (
            <span>Verificando...</span>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <ScrollArea className="flex-1 px-4 py-3 bg-[#ece5dd] dark:bg-background/50">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Nenhuma mensagem ainda
          </div>
        ) : (
          Object.entries(groupedMessages).map(([dateLabel, msgs]) => (
            <div key={dateLabel}>
              {/* Separador de data */}
              <div className="flex items-center justify-center my-3">
                <span className="bg-white/70 dark:bg-card text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
                  {dateLabel}
                </span>
              </div>

              {msgs.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex mb-1.5",
                    msg.fromMe ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] px-3 py-2 rounded-2xl shadow-sm text-sm",
                      msg.fromMe
                        ? "bg-[#dcf8c6] dark:bg-primary text-foreground dark:text-primary-foreground rounded-br-sm"
                        : "bg-white dark:bg-card text-foreground rounded-bl-sm"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <div className={cn(
                      "flex items-center gap-1 mt-0.5",
                      msg.fromMe ? "justify-end" : "justify-start"
                    )}>
                      <span className="text-[10px] text-muted-foreground">
                        {msg.timestamp
                          ? format(msg.timestamp.toDate(), "HH:mm")
                          : ""}
                      </span>
                      {msg.fromMe && (
                        <CheckCheck className={cn("h-3 w-3", msg.read ? "text-blue-500" : "text-muted-foreground")} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </ScrollArea>

      {/* Input de envio */}
      <div className="p-3 border-t border-border bg-card flex items-center gap-2">
        <Input
          placeholder={serverConnected === false ? "Servidor offline..." : "Digite uma mensagem..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={sending || serverConnected === false}
          className="flex-1 rounded-full"
        />
        <Button
          size="icon"
          className="rounded-full shrink-0"
          onClick={handleSend}
          disabled={!text.trim() || sending || serverConnected === false}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByDate(messages: ChatMessage[]): Record<string, ChatMessage[]> {
  const result: Record<string, ChatMessage[]> = {};

  messages.forEach((msg) => {
    if (!msg.timestamp) return;
    const date = msg.timestamp.toDate();
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    let label: string;
    if (isSameDay(date, today)) label = "Hoje";
    else if (isSameDay(date, yesterday)) label = "Ontem";
    else label = format(date, "dd 'de' MMMM", { locale: ptBR });

    if (!result[label]) result[label] = [];
    result[label].push(msg);
  });

  return result;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

function formatPhone(tel: string) {
  const d = tel.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return tel;
}
