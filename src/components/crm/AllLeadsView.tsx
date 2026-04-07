import { Lead, LeadStage } from "@/types/crm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadTable } from "./LeadTable";
import { EditLeadDialog } from "./EditLeadDialog";
import { CreateLeadDialog } from "./CreateLeadDialog";
import { useState, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, AlertTriangle, Users, CalendarCheck, Clock, UserCheck, Trash2, Plus, Download } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion } from "framer-motion";

interface AllLeadsViewProps {
  leads: Lead[];
  onMarkAttendance: (id: string, value: string) => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => void;
  onCreateLead?: (lead: Omit<Lead, 'id'>) => void;
  selectedLeads?: string[];
  onSelectionChange?: (leadIds: string[]) => void;
  onDeleteSelected?: () => void;
  onClearDuplicates?: () => void;
  onSendFollowUp?: (leadId: string, observacao?: string) => void;
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string) => void;
  onOpenChat?: (phone: string, message?: string) => void;
  onOpenCall?: (phone: string) => void;
  onExport?: (leads: Lead[]) => void;
  onExportRange?: (start: Date, end: Date, leads?: Lead[]) => void;
}

type FilterCategory = {
  duplicados?: boolean;
};

export function AllLeadsView({ leads, onMarkAttendance, onUpdateLead, onCreateLead, selectedLeads, onSelectionChange, onDeleteSelected, onClearDuplicates, onSendFollowUp, onRegisterCall, onOpenChat, onOpenCall, onExport, onExportRange }: AllLeadsViewProps) {
    // Filtro unificado de datas
    const [dateFilterType, setDateFilterType] = useState<'mes' | 'dia' | 'periodo'>('mes');
    const [selectedDateMonth, setSelectedDateMonth] = useState<string>('all');
    const [selectedDateDay, setSelectedDateDay] = useState<string>('all');
  const [reportStart, setReportStart] = useState<Date>(new Date());
  const [reportEnd, setReportEnd] = useState<Date>(new Date());
  const [exporting, setExporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterCategory>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCreationDay, setSelectedCreationDay] = useState<string>("all");
  const [selectedContactMonth, setSelectedContactMonth] = useState<string>("all");
  const [selectedAppointmentMonth, setSelectedAppointmentMonth] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedAttendance, setSelectedAttendance] = useState<string>("all");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedService, setSelectedService] = useState<string>("all");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Detect duplicates by phone number
  const duplicatePhones = useMemo(() => {
    const phoneMap = new Map<string, Lead[]>();
    leads.forEach((lead) => {
      const cleanPhone = lead.telefone.replace(/[^0-9]/g, "");
      if (!phoneMap.has(cleanPhone)) {
        phoneMap.set(cleanPhone, []);
      }
      phoneMap.get(cleanPhone)!.push(lead);
    });
    
    const duplicates = new Set<string>();
    phoneMap.forEach((leadsWithPhone, phone) => {
      if (leadsWithPhone.length > 1) {
        leadsWithPhone.forEach(l => duplicates.add(l.id));
      }
    });
    
    return duplicates;
  }, [leads]);

  // All online sources grouped as "Online"
  const getSourceGroup = (fonte: string): string => {
    if (["Instagram", "Facebook", "WhatsApp"].includes(fonte)) return "Online";
    if (fonte === "Cupom Indicação") return "Indicação";
    return fonte;
  };

  // Generate available months from dataContato
  const availableContactMonths = useMemo(() => {
    const months = new Set<string>();
    leads.forEach((lead) => {
      if (lead.dataContato) {
        const [, month, year] = lead.dataContato.split("/");
        if (month && year) {
          months.add(`${month}/${year}`);
        }
      }
    });
    return Array.from(months).sort((a, b) => {
      const [monthA, yearA] = a.split("/");
      const [monthB, yearB] = b.split("/");
      return yearB.localeCompare(yearA) || monthB.localeCompare(monthA);
    });
  }, [leads]);

  // Generate available months from dataAgendamento
  const availableAppointmentMonths = useMemo(() => {
    const months = new Set<string>();
    leads.forEach((lead) => {
      // Consider both the appointment date and the appointment creation date
      if (lead.dataAgendamento) {
        const parts = lead.dataAgendamento.split("/");
        const month = parts[1];
        const year = parts[2]?.split(" ")[0]; // strip time if present
        if (month && year) months.add(`${month}/${year}`);
      }
      if (lead.dataAgendamentoCriado) {
        const parts = lead.dataAgendamentoCriado.split("/");
        const month = parts[1];
        const year = parts[2];
        if (month && year) months.add(`${month}/${year}`);
      }
    });
    return Array.from(months).sort((a, b) => {
      const [monthA, yearA] = a.split("/");
      const [monthB, yearB] = b.split("/");
      return yearB.localeCompare(yearA) || monthB.localeCompare(monthA);
    });
  }, [leads]);

  // Generate available days from dataCriacao
  const availableCreationDays = useMemo(() => {
    const days = new Set<string>();
    leads.forEach((lead) => {
      if (lead.dataCriacao) {
        days.add(lead.dataCriacao);
      }
    });
    return Array.from(days).sort((a, b) => {
      const [dayA, monthA, yearA] = a.split("/");
      const [dayB, monthB, yearB] = b.split("/");
      const dateA = new Date(parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
      const dateB = new Date(parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
      return dateB.getTime() - dateA.getTime();
    });
  }, [leads]);

  // Get available sources
  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    leads.forEach((lead) => {
      sources.add(getSourceGroup(lead.fonteLead));
    });
    return Array.from(sources).sort();
  }, [leads]);

  // Get available services
  const availableServices = useMemo(() => {
    const services = new Set<string>();
    leads.forEach((lead) => {
      if (lead.servicoProcurado && lead.servicoProcurado.trim() !== "") {
        services.add(lead.servicoProcurado.trim());
      }
    });
    return Array.from(services).sort();
  }, [leads]);

  // Lista fixa de etapas igual ao tipo LeadStage
  const STAGES: LeadStage[] = [
    "Novo",
    "Em contato",
    "Follow-Up 1",
    "Follow-Up 2",
    "Follow-Up 3",
    "Follow-Up 4",
    "Follow-Up 5",
    "Follow-Up 6",
    "Follow-Up 7",
    "Follow-Up 8",
    "Follow-Up 9",
    "Follow-Up 10",
    "Follow-Up 11",
    "Follow-Up 12",
    "Avaliação agendada",
    "Fora da região",
    "Desistência",
    "Finalizado",
  ];

  // First filter by creation day, contact month, appointment month, and source
  const leadsFilteredByMonthSource = useMemo(() => {
    let result = leads;
    // Filtro unificado de datas
    if (dateFilterType === 'mes' && selectedDateMonth !== 'all') {
      result = result.filter((lead) => {
        if (!lead.dataContato) return false;
        const [, month, year] = lead.dataContato.split("/");
        return `${month}/${year}` === selectedDateMonth;
      });
    } else if (dateFilterType === 'dia' && selectedDateDay !== 'all') {
      result = result.filter((lead) => lead.dataCriacao === selectedDateDay);
    } else if (dateFilterType === 'periodo') {
      result = result.filter((lead) => {
        if (!lead.dataCriacao) return false;
        const [d, m, y] = lead.dataCriacao.split("/");
        const leadDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        return leadDate >= reportStart && leadDate <= reportEnd;
      });
    }

    // Filter by appointment month
    if (selectedAppointmentMonth !== "all") {
      result = result.filter((lead) => {
        if (!lead.dataAgendamento) return false;
        const parts = lead.dataAgendamento.split("/");
        const month = parts[1];
        const year = parts[2]?.split(" ")[0];
        return month && year && `${month}/${year}` === selectedAppointmentMonth;
      });
    }

    // Filter by source
    if (selectedSource !== "all") {
      result = result.filter((lead) => {
        return getSourceGroup(lead.fonteLead) === selectedSource;
      });
    }

    // Filtro direto igual aos outros
    if (selectedStage !== "all") {
      result = result.filter((lead) => lead.etapaLead === selectedStage);
    }

    // Filter by appointment attendance/status
    if (selectedAttendance !== "all") {
      result = result.filter((lead) => {
        return lead.comparecimento === selectedAttendance;
      });
    }

    // Filter by service
    if (selectedService !== "all") {
      result = result.filter((lead) => lead.servicoProcurado?.trim() === selectedService);
    }

    return result;
  }, [leads, dateFilterType, selectedDateMonth, selectedDateDay, reportStart, reportEnd, selectedAppointmentMonth, selectedSource, selectedStage, selectedAttendance, selectedService]);

  // Relatório filtrado: todos os cards refletem SEMPRE os filtros ativos
  const stats = useMemo(() => {
    // Verificar se há filtros ativos
    const hasFiltersActive = searchTerm !== "" || selectedCreationDay !== "all" || selectedContactMonth !== "all" || selectedAppointmentMonth !== "all" || selectedSource !== "all" || selectedStage !== "all" || selectedService !== "all";
    
    // Base: leads filtrados pelos filtros ativos (fonte, etapa, etc.)
    const leadsFiltrados = leadsFilteredByMonthSource;

    // Determinar mês/ano do filtro de agendamento (para manter compatibilidade com filtro mensal)
    let month = null, year = null;
    if (selectedAppointmentMonth && selectedAppointmentMonth !== "all") {
      [month, year] = selectedAppointmentMonth.split("/");
    }

    // Leads criados (base dos cards):
    // Se filtro de mês agendado estiver ativo, mostrar todos os leads criados naquele mês (mesmo sem agendamento)
    let leadsCriados = leadsFiltrados;
    if (selectedAppointmentMonth && selectedAppointmentMonth !== "all") {
      const [monthAg, yearAg] = selectedAppointmentMonth.split("/");
      leadsCriados = leadsFiltrados.filter(l => {
        if (!l.dataCriacao) return false;
        const [d, m, y] = l.dataCriacao.split("/");
        return m === monthAg && y === yearAg;
      });
    } else {
      // Se não, mantém filtro padrão (outros filtros já aplicados)
      leadsCriados = leadsFiltrados;
    }

    // Agendamentos realizados no período (dataAgendamentoCriado)
    // Se há filtros ativos (fonte, etapa, etc.), usa leads filtrados; caso contrário, usa todos
    const baseForAppointments = hasFiltersActive ? leadsFiltrados : leads;
    
    let agendamentosNoPeriodo: Lead[] = [];
    if (dateFilterType === 'dia' && selectedDateDay !== 'all') {
      // Filtro por dia exato
      agendamentosNoPeriodo = baseForAppointments.filter(l => l.dataAgendamentoCriado === selectedDateDay);
    } else if (dateFilterType === 'periodo') {
      // Filtro por intervalo de datas
      agendamentosNoPeriodo = baseForAppointments.filter(l => {
        if (!l.dataAgendamentoCriado) return false;
        const [d, m, y] = l.dataAgendamentoCriado.split("/");
        const agDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        return agDate >= reportStart && agDate <= reportEnd;
      });
    } else if (dateFilterType === 'mes' && selectedDateMonth !== 'all') {
      // Filtro por mês/ano
      const [monthAg, yearAg] = selectedDateMonth.split("/");
      agendamentosNoPeriodo = baseForAppointments.filter(l => {
        if (!l.dataAgendamentoCriado) return false;
        const [d, m, y] = l.dataAgendamentoCriado.split("/");
        return m === monthAg && y === yearAg;
      });
    } else {
      // Sem filtro de data, pega todos do base
      agendamentosNoPeriodo = baseForAppointments.filter(l => !!l.dataAgendamentoCriado);
    }

    // Agendados Novos/Recuperados
    let agendadosNovos = 0;
    let agendadosRecuperados = 0;
    agendamentosNoPeriodo.forEach(l => {
      if (l.dataCriacao === l.dataAgendamentoCriado) agendadosNovos++;
      else agendadosRecuperados++;
    });

    // Comparecimentos dos agendamentos do período
    const compareceram = agendamentosNoPeriodo.filter(l => l.comparecimento === "COMPARECEU").length;

    // Conversão: % de leads criados que agendaram (novos + recuperados) e % de agendamentos que compareceram
    const taxaConversaoTotal = leadsCriados.length > 0 ? (((agendadosNovos + agendadosRecuperados) / leadsCriados.length) * 100).toFixed(1) : null;
    const taxaComparecimento = agendamentosNoPeriodo.length > 0 ? ((compareceram / agendamentosNoPeriodo.length) * 100).toFixed(1) : null;

    // Follow-ups realizados (mantém lógica anterior, mas pode ser ajustado)
    const followUpsRealizados = leadsCriados.filter((l) => String(l.etapaLead).toLowerCase().includes("follow-up")).length;

    return {
      entradaLeads: leadsCriados.length,
      followUpsRealizados,
      agendadosNovos,
      agendadosRecuperados,
      agendamentosTotais: agendamentosNoPeriodo.length,
      compareceram,
      taxaConversaoTotal,
      taxaComparecimento,
    };
  }, [leadsFilteredByMonthSource, selectedAppointmentMonth, searchTerm, selectedCreationDay, selectedContactMonth, selectedSource, selectedStage, leads]);

  // Filter leads (apply duplicados and search filters on top of month/source)
  const filteredLeads = useMemo(() => {
    let result = leadsFilteredByMonthSource;

    // Apply duplicados filter
    if (filters.duplicados) {
      result = result.filter((l) => duplicatePhones.has(l.id));
    }

    // Apply search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (l) =>
          l.nome.toLowerCase().includes(term) ||
          l.telefone.includes(term) ||
          l.servicoProcurado.toLowerCase().includes(term)
      );
    }

    return result;
  }, [leadsFilteredByMonthSource, filters.duplicados, searchTerm, duplicatePhones]);

  const toggleFilter = (category: keyof FilterCategory, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [category]: prev[category] === value ? null : value,
    }));
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm("");
    setSelectedCreationDay("all");
    setSelectedContactMonth("all");
    setSelectedAppointmentMonth("all");
    setSelectedSource("all");
    setSelectedStage("all");
    setSelectedService("all");
  };

  const hasActiveFilters = searchTerm !== "" || selectedCreationDay !== "all" || selectedContactMonth !== "all" || selectedAppointmentMonth !== "all" || selectedSource !== "all" || selectedStage !== "all" || selectedService !== "all";

  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    accent: "bg-accent/10 text-accent",
  };

  // Cards de funil detalhado
  const statsCards = [
    { key: "entradaLeads" as const, label: "Leads Criados", icon: Users, color: "primary" },
    { key: "agendamentosTotais" as const, label: "Total Agendamentos", icon: CalendarCheck, color: "success", pct: stats.taxaConversaoTotal },
    { key: "agendadosNovos" as const, label: "Agendados Novos", icon: CalendarCheck, color: "success" },
    { key: "agendadosRecuperados" as const, label: "Agendados Recuperados", icon: CalendarCheck, color: "accent" },
    { key: "compareceram" as const, label: "Comparecimentos", icon: UserCheck, color: "success", pct: stats.taxaComparecimento },
  ];

  return (
    <div className="space-y-6">
      {/* Painel único de filtros, busca e ações */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground mb-1">Datas</span>
                <div className="flex gap-2">
                  <Select value={dateFilterType} onValueChange={v => setDateFilterType(v as 'mes' | 'dia' | 'periodo')}>
                    <SelectTrigger className="w-[120px]"><SelectValue />
                      {dateFilterType === 'mes' && selectedDateMonth !== 'all' ? `Mês: ${selectedDateMonth}` : ''}
                      {dateFilterType === 'dia' && selectedDateDay !== 'all' ? `Dia: ${selectedDateDay}` : ''}
                      {dateFilterType === 'periodo' ? `Período` : ''}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mes">Por mês</SelectItem>
                      <SelectItem value="dia">Por dia</SelectItem>
                      <SelectItem value="periodo">Por período</SelectItem>
                    </SelectContent>
                  </Select>
                  {dateFilterType === 'mes' && (
                    <Select value={selectedDateMonth} onValueChange={setSelectedDateMonth}>
                      <SelectTrigger className="w-[120px]"><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {availableContactMonths.map((month) => (
                          <SelectItem key={month} value={month}>{month}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {dateFilterType === 'dia' && (
                    <Select value={selectedDateDay} onValueChange={setSelectedDateDay}>
                      <SelectTrigger className="w-[120px]"><SelectValue placeholder="Selecione o dia" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {availableCreationDays.map((day) => (
                          <SelectItem key={day} value={day}>{day}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {dateFilterType === 'periodo' && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" aria-label="Data início">
                            <CalendarCheck className="h-4 w-4 mr-1" />
                            {format(reportStart, "dd/MM")}
                          </Button>
                          <Button variant="outline" size="sm" aria-label="Data fim">
                            <CalendarCheck className="h-4 w-4 mr-1" />
                            {format(reportEnd, "dd/MM")}
                          </Button>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 flex gap-2">
                        <Calendar mode="single" selected={reportStart} onSelect={(d) => d && setReportStart(d)} locale={ptBR} />
                        <Calendar mode="single" selected={reportEnd} onSelect={(d) => d && setReportEnd(d)} locale={ptBR} />
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
              {/* Filtro de Mês Agenda removido */}
              <div className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground mb-1">Fonte</span>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {availableSources.map((source) => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground mb-1">Etapa</span>
                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {STAGES.map((st) => (
                      <SelectItem key={st} value={st}>{st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground mb-1">Serviço</span>
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {availableServices.map((service) => (
                      <SelectItem key={service} value={service}>{service}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground mb-1">Comparecimento</span>
                <Select value={selectedAttendance} onValueChange={setSelectedAttendance}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="COMPARECEU">Compareceu</SelectItem>
                    <SelectItem value="NÃO COMPARECEU">Não compareceu</SelectItem>
                    <SelectItem value="AGUARDANDO DATA">Aguardando</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="self-end text-xs">Limpar filtros</Button>
              )}
            </div>
            {/* Busca */}
            <div className="mt-4">
              <Input
                placeholder="Buscar por nome, telefone ou serviço..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            {/* Barra de ações */}
            <div className="flex flex-wrap gap-2 items-center mt-4">
              {onExport && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={() => onExport(filteredLeads)} variant="outline" className="gap-2">
                      <Download className="h-4 w-4" />
                      Exportar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Exporta apenas os leads exibidos na tabela</TooltipContent>
                </Tooltip>
              )}
              {onExportRange && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" aria-label="Data início">
                        <CalendarCheck className="h-4 w-4 mr-1" />
                        {format(reportStart, "dd/MM")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={reportStart} onSelect={(d) => d && setReportStart(d)} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" aria-label="Data fim">
                        <CalendarCheck className="h-4 w-4 mr-1" />
                        {format(reportEnd, "dd/MM")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={reportEnd} onSelect={(d) => d && setReportEnd(d)} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setReportError(null);
                          if (reportStart > reportEnd) {
                            setReportError('Data inicial deve ser anterior ou igual à data final');
                            return;
                          }
                          if (!onExportRange) return;
                          try {
                            setExporting(true);
                            await onExportRange(reportStart, reportEnd, filteredLeads as Lead[]);
                            toast.success('Exportação iniciada — verifique seus downloads');
                          } catch (e) {
                            console.error('Export Range failed', e);
                            toast.error('Falha ao gerar relatório');
                          } finally {
                            setExporting(false);
                          }
                        }}
                        className="gap-2"
                        disabled={exporting}
                      >
                        <CalendarCheck className={`h-4 w-4 ${exporting ? 'animate-spin' : ''}`} />
                        Relatório Período
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Exporta relatório do período selecionado</TooltipContent>
                  </Tooltip>
                </>
              )}
              {onCreateLead && (
                <Button onClick={() => setShowCreateDialog(true)} className="gap-2" variant="default">
                  <Plus className="h-4 w-4" />
                  Novo Lead
                </Button>
              )}
              <Badge variant="secondary" className="ml-2">Exibindo {filteredLeads.length} de {leadsFilteredByMonthSource.length} leads</Badge>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Cards de estatísticas */}
      <Card>
        <CardContent className="py-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 justify-center items-center">
            {statsCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="stat-card"
                >
                  <div className={`inline-flex p-2 rounded-lg mb-2 ${colorMap[card.color]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-heading font-bold text-foreground">{stats[card.key]}</p>
                    {card.pct && (
                      <span className="text-sm font-semibold text-muted-foreground">({card.pct}%)</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{card.label}</p>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Duplicate Alert */}
      {duplicatePhones.size > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>
              <span className="font-semibold">{duplicatePhones.size} leads duplicados</span> detectados (mesmo telefone).{" "}
              <button
                onClick={() => toggleFilter("duplicados", true)}
                className="underline hover:text-primary"
              >
                Clique aqui para visualizar
              </button>
            </span>
            {onClearDuplicates && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearDuplicates}
                className="border-amber-500 text-amber-700 hover:bg-amber-50 shrink-0"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Apagar Duplicatas ({duplicatePhones.size})
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}


      {/* Lead Table e Dialogs */}
      <LeadTable 
        leads={filteredLeads} 
        onMarkAttendance={onMarkAttendance}
        selectedLeads={selectedLeads}
        onSelectionChange={onSelectionChange}
        onEditLead={onUpdateLead ? (lead) => setEditingLead(lead) : undefined}
        onSendFollowUp={onSendFollowUp}
        onRegisterCall={onRegisterCall}
        onOpenChat={onOpenChat}
      />

      {/* Edit Dialog */}
      <EditLeadDialog
        lead={editingLead}
        open={!!editingLead}
        onClose={() => setEditingLead(null)}
        onSave={(id, updates) => {
          onUpdateLead?.(id, updates);
          setEditingLead(null);
        }}
      />

      {/* Create Lead Dialog */}
      <CreateLeadDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSave={(lead) => {
          onCreateLead?.(lead);
          setShowCreateDialog(false);
        }}
        onOpenCall={onOpenCall}
      />
    </div>
  );
}
