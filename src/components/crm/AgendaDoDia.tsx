import { useMemo, useState } from "react";
import { Lead } from "@/types/crm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CheckCircle2, XCircle, Clock, User, Stethoscope, CalendarCheck, Phone, Share2, ChevronRight, ChevronLeft, CalendarDays } from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";

interface AgendaDoDiaProps {
  leads: Lead[];
  onMarkAttendance: (id: string, value: "COMPARECEU" | "NÃO COMPARECEU" | "") => void;
  onExportWeek?: (date?: Date) => void;
}

export function AgendaDoDia({ leads, onMarkAttendance }: AgendaDoDiaProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const dateStr = format(selectedDate, "dd/MM/yyyy");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const leadsHoje = useMemo(() => {
    return leads.filter((lead) => {
      if (!lead.dataAgendamento) return false;
      return lead.dataAgendamento.startsWith(dateStr);
    }).sort((a, b) => {
      // Ordena por horário se disponível
      const timeA = a.dataAgendamento.split(" ")[1] || "00:00";
      const timeB = b.dataAgendamento.split(" ")[1] || "00:00";
      return timeA.localeCompare(timeB);
    });
  }, [leads, dateStr]);

  const compareceram = leadsHoje.filter((l) => l.comparecimento === "COMPARECEU").length;
  const naoCompareceram = leadsHoje.filter((l) => l.comparecimento === "NÃO COMPARECEU").length;
  const pendentes = leadsHoje.filter((l) => !l.comparecimento).length;

  return (
    <div className="space-y-6">
      {/* Header do dia */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedDate(d => subDays(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 px-3 gap-2 font-normal min-w-0 flex-1 sm:flex-none justify-start">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-semibold truncate">
                  {isToday(selectedDate) ? "Hoje — " : ""}{format(selectedDate, "EEE, d MMM yyyy", { locale: ptBR })}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => { if (d) { setSelectedDate(d); setCalendarOpen(false); } }}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedDate(d => addDays(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday(selectedDate) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={() => setSelectedDate(new Date())}>
              Hoje
            </Button>
          )}
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
          <div>
            <Button size="sm" variant="outline" onClick={() => onExportWeek?.(selectedDate)}>
              Exportar Semana
            </Button>
          </div>
        </div>
      </div>

      {/* Lista de leads */}
      {leadsHoje.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarCheck className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
            <p className="text-lg font-medium text-muted-foreground">Nenhum paciente agendado para {isToday(selectedDate) ? "hoje" : dateStr}</p>
            <p className="text-sm text-muted-foreground mt-1">Os agendamentos do dia aparecerão aqui</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leadsHoje.map((lead, index) => {
            const horario = lead.dataAgendamento.split(" ")[1];

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
                    <div
                      className="flex items-start justify-between gap-2 cursor-pointer group"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <CardTitle className="text-base leading-tight truncate group-hover:text-primary transition-colors">{lead.nome}</CardTitle>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {horario && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Clock className="h-3 w-3" />
                            {horario}
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{lead.servicoProcurado || "Não informado"}</span>
                    </div>

                    {/* Botões sempre visíveis, clicar no ativo desfaz a seleção */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        onClick={() => onMarkAttendance(lead.id, lead.comparecimento === "COMPARECEU" ? "" : "COMPARECEU")}
                        className={`h-10 text-xs font-semibold transition-all ${
                          lead.comparecimento === "COMPARECEU"
                            ? "bg-green-600 hover:bg-green-700 text-white ring-2 ring-green-400"
                            : "bg-white border border-gray-300 text-gray-500 hover:bg-green-50 hover:border-green-400 hover:text-green-700"
                        }`}
                        variant="outline"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Compareceu
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onMarkAttendance(lead.id, lead.comparecimento === "NÃO COMPARECEU" ? "" : "NÃO COMPARECEU")}
                        className={`h-10 text-xs font-semibold transition-all ${
                          lead.comparecimento === "NÃO COMPARECEU"
                            ? "bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-400"
                            : "bg-white border border-gray-300 text-gray-500 hover:bg-red-50 hover:border-red-400 hover:text-red-700"
                        }`}
                        variant="outline"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Não Veio
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              {selectedLead?.nome}
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4 pt-1">
              {/* Info rows */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Phone className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="font-medium text-sm">{selectedLead.telefone}</p>
                  </div>
                  <a
                    href={`https://wa.me/${selectedLead.telefone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-green-600 hover:text-green-700"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </a>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Stethoscope className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Serviço</p>
                    <p className="font-medium text-sm">{selectedLead.servicoProcurado || "Não informado"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Share2 className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Fonte</p>
                    <p className="font-medium text-sm">{selectedLead.fonteLead || "Não informado"}</p>
                  </div>
                </div>

                {selectedLead.dataAgendamento && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Agendamento</p>
                      <p className="font-medium text-sm">{selectedLead.dataAgendamento}</p>
                    </div>
                  </div>
                )}
              </div>

              <Button className="w-full" onClick={() => setSelectedLead(null)}>
                Fechar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
