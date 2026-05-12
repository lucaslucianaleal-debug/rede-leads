import { useState } from "react";
import { useTimeline } from "@/hooks/useTimeline";
import { TimelineActivity, TimelineActivityType } from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UnifiedTimelineProps {
  leadId: string;
  leadTelefone?: string;
}

type FilterType = TimelineActivityType | "ALL";

const FILTER_LABELS: Record<FilterType, string> = {
  ALL: "Tudo",
  CALL_LOG: "📞 Ligações",
  FOLLOW_UP: "📋 Follow-Ups",
  WHATSAPP_MESSAGE: "💬 WhatsApp",
  APPOINTMENT: "📅 Agendamentos",
  APPOINTMENT_EDIT: "✏️ Reagendamentos",
  REMINDER_SENT: "🔔 Lembretes",
  NO_SHOW: "❌ Faltou",
  NOTE: "📝 Notas",
};

const TYPE_ICON: Record<TimelineActivityType, string> = {
  CALL_LOG: "📞",
  FOLLOW_UP: "📋",
  WHATSAPP_MESSAGE: "💬",
  APPOINTMENT: "📅",
  APPOINTMENT_EDIT: "✏️",
  REMINDER_SENT: "🔔",
  NO_SHOW: "❌",
  NOTE: "📝",
};

const TYPE_COLOR: Record<TimelineActivityType, string> = {
  CALL_LOG: "bg-blue-100 text-blue-700 border-blue-200",
  FOLLOW_UP: "bg-yellow-100 text-yellow-700 border-yellow-200",
  WHATSAPP_MESSAGE: "bg-green-100 text-green-700 border-green-200",
  APPOINTMENT: "bg-purple-100 text-purple-700 border-purple-200",
  APPOINTMENT_EDIT: "bg-orange-100 text-orange-700 border-orange-200",
  REMINDER_SENT: "bg-gray-100 text-gray-700 border-gray-200",
  NO_SHOW: "bg-red-100 text-red-700 border-red-200",
  NOTE: "bg-slate-100 text-slate-700 border-slate-200",
};

function getTitle(act: TimelineActivity): string {
  switch (act.type) {
    case "CALL_LOG":
      return `Ligação — ${act.data.resultado || "registrada"}`;
    case "FOLLOW_UP":
      return `Follow-Up${act.data.etapa ? ` (${act.data.etapa})` : ""}`;
    case "WHATSAPP_MESSAGE":
      return act.data.from === "clinic" ? "Mensagem enviada" : "Mensagem recebida";
    case "APPOINTMENT":
      return `Agendamento marcado${act.data.dataAgendamento ? `: ${act.data.dataAgendamento}` : ""}`;
    case "APPOINTMENT_EDIT":
      return `Reagendamento${act.data.dataAgendamento ? `: ${act.data.dataAgendamento}` : ""}`;
    case "REMINDER_SENT":
      return `Lembrete enviado (${act.data.reminderTipo || ""})`;
    case "NO_SHOW":
      return "Não compareceu";
    case "NOTE":
      return "Anotação";
    default:
      return "Atividade";
  }
}

function getDescription(act: TimelineActivity): string | null {
  if (act.type === "CALL_LOG" && act.data.observacao) return act.data.observacao;
  if (act.type === "FOLLOW_UP" && act.data.observacao) return act.data.observacao;
  if (act.type === "WHATSAPP_MESSAGE" && act.data.content) {
    const max = 120;
    return act.data.content.length > max
      ? act.data.content.slice(0, max) + "…"
      : act.data.content;
  }
  if (act.type === "APPOINTMENT" && act.data.briefing) return `Briefing: ${act.data.briefing}`;
  if (act.type === "APPOINTMENT_EDIT" && act.data.motivo) return `Motivo: ${act.data.motivo}`;
  if (act.type === "NOTE" && act.data.note) return act.data.note;
  return null;
}

function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = parseISO(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function UnifiedTimeline({ leadId, leadTelefone }: UnifiedTimelineProps) {
  const { activities, loading } = useTimeline(leadId, leadTelefone);
  const [filter, setFilter] = useState<FilterType>("ALL");
  const [showAll, setShowAll] = useState(false);
  const PAGE_SIZE = 20;

  const filtered = filter === "ALL"
    ? activities
    : activities.filter((a) => a.type === filter);

  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);

  // Montar conjunto de tipos presentes para mostrar somente filtros relevantes
  const presentTypes = Array.from(new Set(activities.map((a) => a.type)));
  const filterOptions: FilterType[] = ["ALL", ...presentTypes];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="animate-spin w-4 h-4" />
        <span className="text-sm">Carregando histórico…</span>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <span className="text-3xl">🗂️</span>
        <p className="text-sm">Nenhuma atividade registrada ainda.</p>
        <p className="text-xs">Ligações, follow-ups e mensagens aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {filterOptions.map((f) => {
          const count = f === "ALL" ? activities.length : activities.filter((a) => a.type === f).length;
          return (
            <button
              key={f}
              onClick={() => { setFilter(f); setShowAll(false); }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:bg-accent"
              }`}
            >
              {f === "ALL" ? `Tudo (${count})` : `${FILTER_LABELS[f]} (${count})`}
            </button>
          );
        })}
      </div>

      {/* Lista de atividades */}
      <div className="relative space-y-3">
        {/* Linha vertical conectora */}
        {visible.length > 1 && (
          <div className="absolute left-[19px] top-8 bottom-8 w-px bg-border" />
        )}

        {visible.map((act) => {
          const desc = getDescription(act);
          return (
            <div key={act.id} className="flex gap-3 items-start">
              {/* Ícone */}
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full border flex items-center justify-center text-base z-10 bg-background ${TYPE_COLOR[act.type]}`}
              >
                {TYPE_ICON[act.type]}
              </div>

              {/* Conteúdo */}
              <div className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2.5">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground leading-snug">
                    {getTitle(act)}
                  </span>
                  <div className="flex flex-col items-end shrink-0">
                    <span
                      className="text-xs text-muted-foreground whitespace-nowrap"
                      title={formatDateTime(act.timestamp)}
                    >
                      {formatRelative(act.timestamp)}
                    </span>
                    {act.createdByName && (
                      <span className="text-[10px] text-muted-foreground/70 mt-0.5">
                        por {act.createdByName}
                      </span>
                    )}
                  </div>
                </div>

                {desc && (
                  <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap break-words leading-relaxed">
                    {desc}
                  </p>
                )}

                {/* Badge de status do lead para call logs */}
                {act.type === "CALL_LOG" && act.data.statusLead && (
                  <Badge
                    variant="outline"
                    className="mt-1.5 text-[10px] px-1.5 py-0"
                  >
                    {act.data.statusLead}
                  </Badge>
                )}

                {/* Retorno agendado */}
                {act.type === "CALL_LOG" && act.data.retornoAgendado && (
                  <p className="text-[10px] text-blue-600 mt-1">
                    🗓 Retorno: {act.data.retornoAgendado}
                  </p>
                )}

                {/* WhatsApp: direcional */}
                {act.type === "WHATSAPP_MESSAGE" && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                      act.data.from === "clinic"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-green-50 text-green-700 border-green-200"
                    }`}>
                      {act.data.from === "clinic" ? "⬆ Enviado" : "⬇ Recebido"}
                    </span>
                    {act.data.deliveryStatus && (
                      <span className="text-[10px] text-muted-foreground">
                        · {act.data.deliveryStatus}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length > PAGE_SIZE && !showAll && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll(true)}
              className="text-xs"
            >
              Ver mais {filtered.length - PAGE_SIZE} atividades
            </Button>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Nenhuma atividade nessa categoria.
          </div>
        )}
      </div>
    </div>
  );
}
