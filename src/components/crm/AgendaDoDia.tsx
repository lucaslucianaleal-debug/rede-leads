import { useMemo, useState, useRef } from "react";
import { Lead } from "@/types/crm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { captureCardAsImage } from "@/lib/captureCard";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CheckCircle2, XCircle, Clock, User, Stethoscope, CalendarCheck, Phone, Share2, ChevronRight, ChevronLeft, CalendarDays, Copy } from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { useUserPermissions } from "@/hooks/useUserPermissions";

interface AgendaDoDiaProps {
  leads: Lead[];
  onMarkAttendance: (id: string, value: "COMPARECEU" | "NÃO COMPARECEU" | "") => void;
  onExportWeek?: (date?: Date) => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => void;
  variant?: "default" | "sidepanel";
}

export function AgendaDoDia({ leads, onMarkAttendance, onExportWeek, onUpdateLead, variant = "default" }: AgendaDoDiaProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const dateStr = format(selectedDate, "dd/MM/yyyy");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState<string>(""); // yyyy-mm-dd
  const [editTime, setEditTime] = useState<string>("09:00");
  const [editBriefing, setEditBriefing] = useState<string>("");
  const [appendToObs, setAppendToObs] = useState<boolean>(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  
  // Filtro por período de datas
  const [dataInicio, setDataInicio] = useState<Date | null>(null);
  const [dataFim, setDataFim] = useState<Date | null>(null);

  const leadsHoje = useMemo(() => {
    return leads.filter((lead) => {
      if (!lead.dataAgendamento) return false;
      
      // Filtro por período de datas
      const [datePart] = lead.dataAgendamento.split(" ");
      if (!datePart) return false;
      
      if (dataInicio || dataFim) {
        const leadDate = datePart; // dd/MM/yyyy
        if (dataInicio && leadDate < format(dataInicio, "dd/MM/yyyy")) return false;
        if (dataFim && leadDate > format(dataFim, "dd/MM/yyyy")) return false;
      } else {
        // Se não há filtro, mostrar apenas a data selecionada
        if (!lead.dataAgendamento.startsWith(dateStr)) return false;
      }
      
      return true;
    }).sort((a, b) => {
      // Ordena por horário se disponível
      const timeA = a.dataAgendamento.split(" ")[1] || "00:00";
      const timeB = b.dataAgendamento.split(" ")[1] || "00:00";
      return timeA.localeCompare(timeB);
    });
  }, [leads, dateStr, dataInicio, dataFim]);

  // Para slots extras na agenda lateral
  const totalSlots = 10;
  const slotsToFill = variant === "sidepanel" ? Math.max(0, totalSlots - leadsHoje.length) : 0;

  const { isReceptionist } = useUserPermissions();

  const compareceram = leadsHoje.filter((l) => l.comparecimento === "COMPARECEU").length;
  const naoCompareceram = leadsHoje.filter((l) => l.comparecimento === "NÃO COMPARECEU").length;
  const pendentes = leadsHoje.filter((l) => !l.comparecimento).length;


  return (
    <div className={variant === "sidepanel" ? "space-y-4 w-full max-w-full overflow-x-hidden" : "space-y-6 w-full max-w-full overflow-x-hidden"} style={{overflowX:'hidden'}}>
      {variant === "sidepanel" ? (
        <div className="flex flex-col items-center gap-3 pb-2 w-full">
          {/* Botão combinado: Hoje - data (centralizado) */}
          <div className="w-full flex justify-center mb-1">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="text-sm px-4 py-2 rounded bg-primary/10 text-primary border border-primary hover:bg-primary/20 transition font-semibold flex items-center gap-3"
                >
                  <span>Hoje -</span>
                  <span className="text-sm font-bold text-foreground bg-muted rounded px-2 py-0.5">
                    {format(selectedDate, "dd MMM yyyy", { locale: ptBR })}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setCalendarOpen(false); } }}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          {/* Cards resumo, centralizados em linha */}
          {variant === "sidepanel" ? (
            <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 items-center" style={{width:'100%'}}>
              <div className="flex flex-col items-center gap-1 bg-green-100 text-green-800 rounded-lg px-2 py-2 min-w-0 w-full">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-xs font-medium">{compareceram}</span>
                <span className="text-[11px] text-muted-foreground">compareceram</span>
              </div>
              <div className="flex flex-col items-center gap-1 bg-muted rounded-lg px-2 py-2 min-w-0 w-full">
                <CalendarCheck className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium">{leadsHoje.length}</span>
                <span className="text-[11px] text-muted-foreground">agendados</span>
              </div>
              <div className="flex flex-col items-center gap-1 bg-red-100 text-red-800 rounded-lg px-2 py-2 min-w-0 w-full">
                <XCircle className="h-5 w-5" />
                <span className="text-xs font-medium">{naoCompareceram}</span>
                <span className="text-[11px] text-muted-foreground">faltaram</span>
              </div>
              <div className="flex flex-col items-center gap-1 bg-amber-100 text-amber-800 rounded-lg px-2 py-2 min-w-0 w-full">
                <Clock className="h-5 w-5" />
                <span className="text-xs font-medium">{pendentes}</span>
                <span className="text-[11px] text-muted-foreground">pendentes</span>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 flex-wrap w-full">
              <div className="flex flex-col items-center gap-1 bg-green-100 text-green-800 rounded-lg px-3 py-2 min-w-[110px]">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">{compareceram} compareceram</span>
              </div>
              <div className="flex flex-col items-center gap-1 bg-muted rounded-lg px-3 py-2 min-w-[110px]">
                <CalendarCheck className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">{leadsHoje.length} agendados</span>
              </div>
              <div className="flex flex-col items-center gap-1 bg-red-100 text-red-800 rounded-lg px-3 py-2 min-w-[110px]">
                <XCircle className="h-5 w-5" />
                <span className="text-sm font-medium">{naoCompareceram} faltaram</span>
              </div>
              <div className="flex flex-col items-center gap-1 bg-amber-100 text-amber-800 rounded-lg px-3 py-2 min-w-[110px]">
                <Clock className="h-5 w-5" />
                <span className="text-sm font-medium">{pendentes} pendentes</span>
              </div>
            </div>
          )}
        </div>
      ) : (
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
      )}

      {/* Filtro por período discreto */}
      <div className="flex gap-2 items-center text-xs">
        <span className="text-muted-foreground">Período:</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-normal">
              {dataInicio ? format(dataInicio, "dd MMM", { locale: ptBR }) : "Início"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dataInicio ?? undefined}
              onSelect={(d) => { if (d) { setDataInicio(d); } }}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground">—</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-normal">
              {dataFim ? format(dataFim, "dd MMM", { locale: ptBR }) : "Fim"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dataFim ?? undefined}
              onSelect={(d) => { if (d) { setDataFim(d); } }}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
        {(dataInicio || dataFim) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDataInicio(null); setDataFim(null); }}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </Button>
        )}
      </div>

      {/* Lista de agendamentos do dia */}
      {variant === "sidepanel" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Render cards de agendamento reais */}
          {leadsHoje.length === 0 && slotsToFill === 0 && (
            <div className="text-sm text-muted-foreground col-span-full">Nenhum agendamento para esta data.</div>
          )}
          {leadsHoje.map((lead) => (
            <motion.div key={lead.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className={`h-full flex flex-col justify-between border-2 transition-colors ${lead.comparecimento === 'COMPARECEU' ? 'bg-green-50 border-green-400' : ''} ${lead.comparecimento === 'NÃO COMPARECEU' ? 'bg-red-50 border-red-400' : ''}`}>
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-base leading-tight break-words">{lead.nome}</div>
                    <div className="text-xs text-muted-foreground break-words">{lead.servicoProcurado}</div>
                  </div>
                  <div className="flex flex-col items-end min-w-[70px]">
                    <span className="text-sm font-bold text-primary bg-muted rounded px-2 py-0.5 mt-1">{lead.dataAgendamento.split(' ')[1] || ''}</span>
                    <span className="text-[11px] text-muted-foreground">{lead.dataAgendamento.split(' ')[0]}</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-row flex-wrap gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={() => onMarkAttendance(lead.id, lead.comparecimento === "COMPARECEU" ? "" : "COMPARECEU")}
                      variant={lead.comparecimento === "COMPARECEU" ? "default" : "outline"}
                      className={lead.comparecimento === "COMPARECEU" ? "bg-green-600 text-white" : ""}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Compareceu
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onMarkAttendance(lead.id, lead.comparecimento === "NÃO COMPARECEU" ? "" : "NÃO COMPARECEU")}
                      variant={lead.comparecimento === "NÃO COMPARECEU" ? "default" : "outline"}
                      className={lead.comparecimento === "NÃO COMPARECEU" ? "bg-red-600 text-white" : ""}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Não Veio
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedLead(lead)}>
                      Detalhes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {/* Render slots vazios clicáveis */}
          {Array.from({ length: slotsToFill }).map((_, idx) => (
            <motion.div key={`slot-vazio-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="h-full flex flex-col justify-center items-center border-2 border-dashed border-primary/40 bg-muted/40 text-primary/80 min-h-[120px]">
                <CardContent className="flex flex-col items-center justify-center gap-2 py-6">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full border-primary/60 text-primary/80 hover:bg-primary/10"
                    title="Agendar Atendimento"
                    onClick={() => {
                      // Dispara evento customizado para abrir modal de agendamento
                      const event = new CustomEvent('abrirAgendamentoDoDia', { detail: { date: selectedDate } });
                      window.dispatchEvent(event);
                    }}
                  >
                    <CalendarCheck className="h-6 w-6" />
                  </Button>
                  <span className="text-xs mt-1">Agendar Atendimento</span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leadsHoje.length === 0 ? (
            <div className="text-sm text-muted-foreground col-span-full">Nenhum agendamento para esta data.</div>
          ) : (
            leadsHoje.map((lead) => (
              <motion.div key={lead.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className={`h-full flex flex-col justify-between border-2 transition-colors ${lead.comparecimento === 'COMPARECEU' ? 'bg-green-50 border-green-400' : ''} ${lead.comparecimento === 'NÃO COMPARECEU' ? 'bg-red-50 border-red-400' : ''}`}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-base leading-tight break-words">{lead.nome}</div>
                      <div className="text-xs text-muted-foreground break-words">{lead.servicoProcurado}</div>
                    </div>
                    <div className="flex flex-col items-end min-w-[70px]">
                      <span className="text-sm font-bold text-primary bg-muted rounded px-2 py-0.5 mt-1">{lead.dataAgendamento.split(' ')[1] || ''}</span>
                      <span className="text-[11px] text-muted-foreground">{lead.dataAgendamento.split(' ')[0]}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-row flex-wrap gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() => onMarkAttendance(lead.id, lead.comparecimento === "COMPARECEU" ? "" : "COMPARECEU")}
                        variant={lead.comparecimento === "COMPARECEU" ? "default" : "outline"}
                        className={lead.comparecimento === "COMPARECEU" ? "bg-green-600 text-white" : ""}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Compareceu
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onMarkAttendance(lead.id, lead.comparecimento === "NÃO COMPARECEU" ? "" : "NÃO COMPARECEU")}
                        variant={lead.comparecimento === "NÃO COMPARECEU" ? "default" : "outline"}
                        className={lead.comparecimento === "NÃO COMPARECEU" ? "bg-red-600 text-white" : ""}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Não Veio
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedLead(lead)}>
                        Detalhes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto" ref={detailsRef}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              {selectedLead?.nome}
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4 pt-1" ref={detailsRef}>
              {/* Edit button */}
              <div className="flex justify-end">
                {!isReceptionist && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (!selectedLead) return;
                    // initialize edit fields from selectedLead
                    const [datePart, timePart] = (selectedLead.dataAgendamento || "").split(" ");
                    // convert dd/MM/yyyy to yyyy-mm-dd for input[type=date]
                    const isoDate = datePart ? datePart.split('/').reverse().join('-') : format(new Date(), 'yyyy-MM-dd');
                    setEditDate(isoDate);
                    setEditTime(timePart || '09:00');
                    // open with blank briefing by default (user requested)
                    setEditBriefing('');
                    setAppendToObs(false);
                    setEditing(true);
                  }}>
                    Editar
                  </Button>
                )}
              </div>
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

                {/* Briefing (mostra) */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <User className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Briefing (Recepção)</p>
                    <p className="font-medium text-sm">{selectedLead.briefingRecepcao || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    const cardText = `👤 ${selectedLead.nome}\n📱 ${selectedLead.telefone}${selectedLead.servicoProcurado ? `\n🏥 ${selectedLead.servicoProcurado}` : ""}${selectedLead.dataAgendamento ? `\n📅 ${selectedLead.dataAgendamento}` : ""}${selectedLead.briefingRecepcao ? `\n💬 ${selectedLead.briefingRecepcao}` : ""}`;
                    navigator.clipboard.writeText(cardText);
                    toast.success("Card copiado!");
                  }}
                  variant="outline"
                  title="Copiar card para enviar no WhatsApp"
                >
                  <Copy className="h-4 w-4 mr-1" /> Copiar
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => captureCardAsImage({
                    nome: selectedLead.nome,
                    telefone: selectedLead.telefone,
                    servico: selectedLead.servicoProcurado,
                    fonte: selectedLead.fonteLead,
                    agendamento: selectedLead.dataAgendamento,
                    briefing: selectedLead.briefingRecepcao,
                  })}
                  variant="outline"
                  title="Copiar screenshot para enviar no WhatsApp"
                >
                  📸 Imagem
                </Button>
                <Button className="flex-1" onClick={() => setSelectedLead(null)}>
                  Fechar
                </Button>
              </div>

              {/* Edit modal inline */}
              {editing && (
                <div className="mt-4 p-4 border border-border rounded-lg bg-background max-w-full">
                  <p className="text-sm font-medium mb-2">Editar Agendamento e Briefing</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="input input-bordered w-full"
                    />
                    <input
                      type="time"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="input input-bordered w-full"
                    />
                  </div>
                  <textarea
                    placeholder="Briefing para recepção"
                    value={editBriefing}
                    onChange={(e) => setEditBriefing(e.target.value)}
                    className="w-full p-2 border border-gray-200 rounded resize-none mb-2"
                    rows={4}
                  />
                  <label className="flex items-center gap-2 text-sm mb-2">
                    <input type="checkbox" checked={appendToObs} onChange={(e) => setAppendToObs(e.target.checked)} />
                    <span className="text-xs">Anexar ao histórico (observação)</span>
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setEditing(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => {
                        if (!selectedLead) return;
                        // format date yyyy-mm-dd and time hh:mm -> dd/MM/yyyy HH:mm
                        const [yyyy, mm, dd] = editDate.split('-');
                        const formatted = `${dd}/${mm}/${yyyy} ${editTime}`;
                        const now = new Date();
                        const ts = format(now, "dd/MM/yyyy HH:mm");
                        const tsDate = format(now, "dd/MM/yyyy");
                        const obsEntry = editBriefing && appendToObs ? `[Briefing ${ts}] ${editBriefing}` : '';
                        const newObs = obsEntry ? (selectedLead.observacao ? `${selectedLead.observacao} | ${obsEntry}` : obsEntry) : selectedLead.observacao;
                        // Se a data mudou → registrar reagendamento no histórico
                        const reagendamentoUpdates: any = {};
                        if (formatted !== selectedLead.dataAgendamento && selectedLead.dataAgendamento) {
                          reagendamentoUpdates.dataAgendamentoAlterado = tsDate;
                          const historicoAtual = Array.isArray(selectedLead.historicoAgendamentos) ? selectedLead.historicoAgendamentos : [];
                          reagendamentoUpdates.historicoAgendamentos = [
                            ...historicoAtual,
                            { data: selectedLead.dataAgendamento, registradoEm: ts },
                          ];
                        }
                        // call update handler
                        onUpdateLead?.(selectedLead.id, { dataAgendamento: formatted, briefingRecepcao: editBriefing, observacao: newObs, ...reagendamentoUpdates });
                        setEditing(false);
                        setSelectedLead(null);
                      }}
                      className="flex-1"
                    >
                      Salvar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
