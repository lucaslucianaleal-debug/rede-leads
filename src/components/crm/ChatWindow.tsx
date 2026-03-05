import { useEffect, useRef, useState } from "react";
import { ChatMessage, Conversation } from "@/hooks/useConversations";
import { Lead } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, MessageCircle, CheckCheck, Wifi, WifiOff, UserPen, X, Save } from "lucide-react";
import { toast } from "sonner";

const SERVICOS = ["Implante", "Prótese", "Protocolo", "Facetas", "Ortodontia", "Clínico geral", "Harmonização facial", "Clareamento"];
const FONTES = ["Indicação", "Online", "Sorteio Radio"];

interface ChatWindowProps {
  conversation: Conversation | null;
  messages: ChatMessage[];
  onSend: (message: string) => Promise<boolean>;
  onOpen: () => void;
  serverConnected: boolean | null;
  currentLead: Lead | null;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => void;
}

export function ChatWindow({ conversation, messages, onSend, onOpen, serverConnected, currentLead, onUpdateLead }: ChatWindowProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showLeadPanel, setShowLeadPanel] = useState(false);
  const [leadForm, setLeadForm] = useState<Partial<Lead>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll apenas dentro do container de mensagens
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Marcar como lido ao abrir
  useEffect(() => {
    if (conversation) onOpen();
  }, [conversation?.telefone]);

  // Pré-preencher formulário quando o lead muda
  useEffect(() => {
    if (currentLead) {
      setLeadForm({ ...currentLead });
    } else if (conversation) {
      // Lead novo ainda não cadastrado — pré-preenche com dados da conversa
      setLeadForm({
        nome: conversation.leadNome,
        telefone: formatPhone(conversation.telefone),
        servicoProcurado: "",
        captador: "",
        fonteLead: "",
        dataRetornoLigacao: "",
        dataAgendamento: "",
        observacao: "",
      });
    }
  }, [currentLead, conversation?.telefone]);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || !conversation) return;
    setText("");
    setSending(true);
    await onSend(msg);
    setSending(false);
  };

  const handleSaveLead = () => {
    if (!currentLead || !onUpdateLead) return;
    onUpdateLead(currentLead.id, leadForm);
    toast.success("Lead atualizado!");
    setShowLeadPanel(false);
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
    <div className="flex h-full overflow-hidden">
      {/* Coluna principal: header + msgs + input */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* Header da conversa */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
            {conversation.leadNome.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm">{conversation.leadNome}</p>
            <p className="text-xs text-muted-foreground">{formatPhone(conversation.telefone)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Botão editar lead */}
          <button
            onClick={() => setShowLeadPanel((v) => !v)}
            title="Editar lead"
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
          >
            <UserPen className="h-4 w-4" />
          </button>
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
              <><WifiOff className="h-3 w-3" /> Offline</>
            ) : (
              <span>Verificando...</span>
            )}
          </div>
        </div>
      </div>

      {/* Mensagens — scroll só aqui */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 bg-[#ece5dd] dark:bg-background/50"
      >
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
                    <div className={cn(
                      "max-w-[75%] px-3 py-2 rounded-2xl shadow-sm text-sm",
                      msg.fromMe
                        ? "bg-[#dcf8c6] dark:bg-primary text-foreground dark:text-primary-foreground rounded-br-sm"
                        : "bg-white dark:bg-card text-foreground rounded-bl-sm"
                    )}
                    >
                      {renderMessageBody(msg.body)}
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
      </div>

      {/* Input de envio */}
      <div className="p-3 border-t border-border bg-card flex items-center gap-2 shrink-0">
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
      </div>{/* fim coluna principal */}

      {/* Painel lateral: editar lead */}
      {showLeadPanel && (
        <div className="w-72 border-l border-border bg-card flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="font-semibold text-sm">Dados do Lead</p>
            <button onClick={() => setShowLeadPanel(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Nome</Label>
                <Input value={leadForm.nome || ""} onChange={(e) => setLeadForm((f) => ({ ...f, nome: e.target.value }))} className="h-8 mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Telefone</Label>
                <Input value={leadForm.telefone || ""} onChange={(e) => setLeadForm((f) => ({ ...f, telefone: e.target.value }))} className="h-8 mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Serviço procurado</Label>
                <Select
                  value={leadForm.servicoProcurado || ""}
                  onValueChange={(v) => setLeadForm((f) => ({ ...f, servicoProcurado: v }))}
                >
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICOS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Fonte do Lead</Label>
                <Select
                  value={leadForm.fonteLead || ""}
                  onValueChange={(v) => setLeadForm((f) => ({ ...f, fonteLead: v }))}
                >
                  <SelectTrigger className="h-8 mt-1">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {FONTES.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Ligação realizada em</Label>
                <Input
                  type="datetime-local"
                  value={leadForm.dataRetornoLigacao || ""}
                  onChange={(e) => setLeadForm((f) => ({ ...f, dataRetornoLigacao: e.target.value }))}
                  className="h-8 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Agendar para</Label>
                <Input
                  type="date"
                  value={leadForm.dataAgendamento || ""}
                  onChange={(e) => setLeadForm((f) => ({ ...f, dataAgendamento: e.target.value }))}
                  className="h-8 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Observação</Label>
                <Textarea
                  value={leadForm.observacao || ""}
                  onChange={(e) => setLeadForm((f) => ({ ...f, observacao: e.target.value }))}
                  className="mt-1 text-sm min-h-[80px] resize-none"
                />
              </div>
            </div>
          </ScrollArea>
          {currentLead && onUpdateLead && (
            <div className="p-3 border-t border-border">
              <Button className="w-full h-8" onClick={handleSaveLead}>
                <Save className="h-3.5 w-3.5 mr-1.5" /> Salvar
              </Button>
            </div>
          )}
          {!currentLead && (
            <p className="text-xs text-muted-foreground text-center p-3">Lead ainda nao cadastrado no CRM</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Renderiza o corpo da mensagem — detecta audio
function renderMessageBody(body: string) {
  if (!body) return null;
  // Formato: [audio:filename.ogg] ou [audio:http://...]
  const audioMatch = body.match(/^\[audio:(.+)\]$/);
  if (audioMatch) {
    const src = audioMatch[1].startsWith("http")
      ? audioMatch[1]
      : `http://localhost:3001/media/${audioMatch[1]}`;
    return (
      <audio
        controls
        src={src}
        className="max-w-[220px] h-10 rounded"
        preload="metadata"
      />
    );
  }
  return <p className="whitespace-pre-wrap break-words">{body}</p>;
}

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
