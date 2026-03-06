import { Conversation } from "@/hooks/useConversations";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, MessageCircle, MoreVertical, UserPen, Trash2 } from "lucide-react";
import { useState } from "react";

// Função para limpar nomes técnicos de arquivos na prévia de mensagem
function formatLastMessagePreview(msg: string): string {
  if (!msg) return "";
  if (msg.startsWith("[audio:")) return "🎤 Áudio";
  if (msg.startsWith("[image:")) return "📷 Foto";
  if (msg.startsWith("[video:")) return "🎬 Vídeo";
  if (msg.startsWith("[document:")) return "📄 Documento";
  if (msg === "🎙️ Áudio") return "🎤 Áudio";
  if (msg === "📷 Imagem") return "📷 Foto";
  return msg;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedPhone: string | null;
  onSelect: (telefone: string) => void;
  onEditLead: (telefone: string) => void;
  onDeleteConversation: (telefone: string) => void;
}

export function ConversationList({ conversations, selectedPhone, onSelect, onEditLead, onDeleteConversation }: ConversationListProps) {
  const [search, setSearch] = useState("");

  const filtered = conversations.filter(
    (c) =>
      c.leadNome.toLowerCase().includes(search.toLowerCase()) ||
      c.telefone.includes(search)
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden border-r border-border">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Lista */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <MessageCircle className="h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhuma conversa ainda</p>
            <p className="text-xs text-center px-4 opacity-70">
              Quando uma mensagem chegar no WhatsApp<br />ela aparecerá aqui automaticamente
            </p>
          </div>
        ) : (
          filtered.map((conv) => (
            <div
              key={conv.telefone}
              className={cn(
                "flex items-center border-b border-border/40 hover:bg-accent/50 transition-colors overflow-hidden",
                selectedPhone === conv.telefone && "bg-accent"
              )}
            >
              {/* Área clicável ocupa todo espaço menos o botão */}
              <button
                onClick={() => onSelect(conv.telefone)}
                className="flex-1 min-w-0 overflow-hidden text-left px-3 py-3 flex items-start gap-3"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                    {conv.leadNome.charAt(0).toUpperCase()}
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                      {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                    </span>
                  )}
                </div>

                {/* Texto */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1">
                    <span className={cn("text-sm font-medium truncate block flex-1 min-w-0", conv.unreadCount > 0 && "font-semibold")}>
                      {conv.leadNome}
                    </span>
                    {conv.lastMessageAt && (
                      <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap ml-1 max-w-[84px] truncate">
                        {formatDistanceToNow(conv.lastMessageAt.toDate(), {
                          addSuffix: false,
                          locale: ptBR,
                        })}
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    "text-xs truncate mt-0.5 max-w-full",
                    conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {(() => {
                      const msg = formatLastMessagePreview(conv.lastMessage || "Sem mensagens");
                      const words = msg.trim().split(/\s+/);
                      const preview = words.slice(0, 2).join(" ");
                      return words.length > 2 ? `${preview}...` : preview;
                    })()}
                  </p>
                </div>
              </button>

              {/* Menu ⋯ — inline, nunca cortado */}
              <div className="w-10 shrink-0 flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded-md bg-background/70 hover:bg-muted text-foreground/80 hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => onEditLead(conv.telefone)}>
                      <UserPen className="h-4 w-4 mr-2" />
                      Editar Lead
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDeleteConversation(conv.telefone)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Apagar Conversa
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
