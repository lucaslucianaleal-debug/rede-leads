import { useMemo } from "react";
import { Lead } from "@/types/crm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, User, Stethoscope, CalendarCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";

interface AgendaDoDiaProps {
  leads: Lead[];
  onMarkAttendance: (id: string, value: "COMPARECEU" | "NÃO COMPARECEU") => void;
}

export function AgendaDoDia({ leads, onMarkAttendance }: AgendaDoDiaProps) {
  const today = format(new Date(), "dd/MM/yyyy");

  const leadsHoje = useMemo(() => {
    return leads.filter((lead) => {
      if (!lead.dataAgendamento) return false;
      // dataAgendamento pode ser "DD/MM/YYYY" ou "DD/MM/YYYY HH:MM"
      return lead.dataAgendamento.startsWith(today);
    }).sort((a, b) => {
      // Ordena por horário se disponível
      const timeA = a.dataAgendamento.split(" ")[1] || "00:00";
      const timeB = b.dataAgendamento.split(" ")[1] || "00:00";
      return timeA.localeCompare(timeB);
    });
  }, [leads, today]);

  const compareceram = leadsHoje.filter((l) => l.comparecimento === "COMPARECEU").length;
  const naoCompareceram = leadsHoje.filter((l) => l.comparecimento === "NÃO COMPARECEU").length;
  const pendentes = leadsHoje.filter((l) => !l.comparecimento).length;

  return (
    <div className="space-y-6">
      {/* Header do dia */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Agenda do Dia</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>

        {/* Resumo */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-2">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{leadsHoje.length} agendados</span>
          </div>
          <div className="flex items-center gap-1.5 bg-green-100 text-green-800 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">{compareceram} compareceram</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-100 text-red-800 rounded-lg px-3 py-2">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{naoCompareceram} faltaram</span>
          </div>
          {pendentes > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-100 text-amber-800 rounded-lg px-3 py-2">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">{pendentes} pendentes</span>
            </div>
          )}
        </div>
      </div>

      {/* Lista de leads */}
      {leadsHoje.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarCheck className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
            <p className="text-lg font-medium text-muted-foreground">Nenhum paciente agendado para hoje</p>
            <p className="text-sm text-muted-foreground mt-1">Os agendamentos do dia aparecerão aqui</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leadsHoje.map((lead, index) => {
            const horario = lead.dataAgendamento.split(" ")[1];
            const jaConfirmado = !!lead.comparecimento;

            return (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <Card className={`border-2 transition-colors ${
                  lead.comparecimento === "COMPARECEU"
                    ? "border-green-400 bg-green-50/50"
                    : lead.comparecimento === "NÃO COMPARECEU"
                    ? "border-red-300 bg-red-50/50"
                    : "border-border hover:border-primary/40"
                }`}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <CardTitle className="text-base leading-tight truncate">{lead.nome}</CardTitle>
                      </div>
                      {horario && (
                        <Badge variant="outline" className="shrink-0 text-xs gap-1">
                          <Clock className="h-3 w-3" />
                          {horario}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{lead.servicoProcurado || "Não informado"}</span>
                    </div>

                    {/* Status já confirmado */}
                    {jaConfirmado ? (
                      <div className={`flex items-center justify-center gap-2 rounded-lg py-2.5 font-medium text-sm ${
                        lead.comparecimento === "COMPARECEU"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        {lead.comparecimento === "COMPARECEU" ? (
                          <><CheckCircle2 className="h-4 w-4" /> Compareceu</>
                        ) : (
                          <><XCircle className="h-4 w-4" /> Não Compareceu</>
                        )}
                        <button
                          className="ml-auto text-xs underline opacity-60 hover:opacity-100"
                          onClick={() => onMarkAttendance(lead.id, lead.comparecimento === "COMPARECEU" ? "NÃO COMPARECEU" : "COMPARECEU")}
                        >
                          desfazer
                        </button>
                      </div>
                    ) : (
                      /* Botões de ação */
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          onClick={() => onMarkAttendance(lead.id, "COMPARECEU")}
                          className="bg-green-600 hover:bg-green-700 text-white h-10 text-xs font-semibold"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Compareceu
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onMarkAttendance(lead.id, "NÃO COMPARECEU")}
                          className="border-red-300 text-red-700 hover:bg-red-50 h-10 text-xs font-semibold"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Não Veio
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
