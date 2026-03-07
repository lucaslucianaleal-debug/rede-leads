import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lead } from "@/types/crm";
import { useMemo } from "react";
import { format } from "date-fns";
import { Clock, Phone, X } from "lucide-react";
import { toast } from "sonner";

interface CalendarViewProps {
  leads: Lead[];
  onMarkReminder: (id: string, type: "h24" | "today") => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => void;
  onOpenChat?: (phone: string, message?: string) => void;
}

export function CalendarView({ leads, onMarkReminder, onUpdateLead, onOpenChat }: CalendarViewProps) {
  const now = new Date();
  const todayStr = format(now, "dd/MM/yyyy");
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowStr = format(tomorrowDate, "dd/MM/yyyy");

  // Filtrar apenas leads de hoje e amanhã
  const relevantLeads = useMemo(
    () =>
      leads.filter(
        (l) =>
          l.dataAgendamento?.startsWith(todayStr) ||
          l.dataAgendamento?.startsWith(tomorrowStr)
      ),
    [leads, todayStr, tomorrowStr]
  );

  // Separar por dia
  const todayLeads = relevantLeads.filter((l) => l.dataAgendamento?.startsWith(todayStr));
  const tomorrowLeads = relevantLeads.filter((l) => l.dataAgendamento?.startsWith(tomorrowStr));

  // Textos fixos dos lembretes
  const getReminder24h = (lead: Lead): string => {
    const data = lead.dataAgendamento?.split(" ")[0] || "amanhã";
    const hora = lead.dataAgendamento?.split(" ")[1] || "09:00";
    return `⏰ Lembrete: Sua ${lead.procedimento?.toLowerCase() || 'consulta'} na OdontoCompany Olimpia é amanhã, ${data} às ${hora}. Confirmado? 💚`;
  };

  const getReminder1h = (lead: Lead): string => {
    const hora = lead.dataAgendamento?.split(" ")[1] || "09:00";
    return `⏰ Falta 1 hora! Já estamos te esperando para sua ${lead.procedimento?.toLowerCase() || 'consulta'} das ${hora}. Até logo! 💚`;
  };

  const handleSend24h = (lead: Lead) => {
    const msg = getReminder24h(lead);
    onOpenChat?.(lead.telefone, msg);
    onMarkReminder(lead.id, "h24");
    toast.success(`✓ ${lead.nome} — Lembrete 24h enviado!`);
  };

  const handleSend1h = (lead: Lead) => {
    const msg = getReminder1h(lead);
    onOpenChat?.(lead.telefone, msg);
    onMarkReminder(lead.id, "today");
    toast.success(`✓ ${lead.nome} — Lembrete 1h enviado!`);
  };

  const handleMarkAbsent = (lead: Lead) => {
    onUpdateLead?.(lead.id, { lembretes: { ...lead.lembretes, disabled: true } });
    toast.info(`✗ ${lead.nome} — Marcado como desistência`);
  };

  const renderLeadCard = (lead: Lead, isToday: boolean) => {
    const [hora, minuto] = (lead.dataAgendamento?.split(" ")[1] || "09:00").split(":");
    const dayLabel = isToday ? "HOJE" : "AMANHÃ";
    const colorBg = isToday ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200";

    return (
      <Card
        key={lead.id}
        className={`relative overflow-hidden transition-all hover:shadow-lg ${colorBg}`}
      >
        <CardContent className="p-4">
          {/* Header com nome, hora e X */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">{lead.nome}</h3>
              <p className="text-sm text-gray-600">{lead.procedimento || "Consulta"}</p>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">
                  {hora}:{minuto}
                </span>
                <Badge
                  variant="outline"
                  className={isToday ? "bg-red-100 text-red-800 border-red-300" : "bg-blue-100 text-blue-800 border-blue-300"}
                >
                  {dayLabel}
                </Badge>
              </div>
            </div>

            {/* Botão X (desistência) */}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-red-200 hover:text-red-700 text-gray-500"
              onClick={() => handleMarkAbsent(lead)}
              title="Marcar como desistência"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Telefone */}
          <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
            <Phone className="h-4 w-4" />
            <span>{lead.telefone}</span>
          </div>

          {/* 2 Botões grandes */}
          <div className="flex gap-2">
            <Button
              onClick={() => handleSend24h(lead)}
              className="flex-1 h-10 bg-green-100 hover:bg-green-200 text-green-800 font-semibold border border-green-300"
              variant="outline"
            >
              <span>📱 Enviar 24h</span>
            </Button>
            <Button
              onClick={() => handleSend1h(lead)}
              className="flex-1 h-10 bg-blue-100 hover:bg-blue-200 text-blue-800 font-semibold border border-blue-300"
              variant="outline"
            >
              <span>📱 Enviar 1h</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-4 max-w-3xl mx-auto">
      {/* Título */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">🎯 Controle de Presença</h1>
        <p className="text-sm text-gray-600 mt-1">Clique nos botões para enviar lembretes via WhatsApp</p>
      </div>

      {/* HOJE */}
      {todayLeads.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-red-700 flex items-center gap-2">
            📅 Hoje ({todayLeads.length} agendamentos)
          </h2>
          <div className="space-y-3">
            {todayLeads.map((lead) => renderLeadCard(lead, true))}
          </div>
        </div>
      )}

      {/* AMANHÃ */}
      {tomorrowLeads.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-blue-700 flex items-center gap-2">
            📅 Amanhã ({tomorrowLeads.length} agendamentos)
          </h2>
          <div className="space-y-3">
            {tomorrowLeads.map((lead) => renderLeadCard(lead, false))}
          </div>
        </div>
      )}

      {/* Vazio */}
      {relevantLeads.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">📭 Nenhum agendamento para hoje ou amanhã</p>
        </div>
      )}
    </div>
  );
}
