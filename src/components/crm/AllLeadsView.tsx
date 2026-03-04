import { Lead } from "@/types/crm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadTable } from "./LeadTable";
import { EditLeadDialog } from "./EditLeadDialog";
import { useState, useMemo } from "react";
import { Search, AlertTriangle, Users, CalendarCheck, Clock, UserCheck, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion } from "framer-motion";

interface AllLeadsViewProps {
  leads: Lead[];
  onMarkAttendance: (id: string, value: string) => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => void;
  selectedLeads?: string[];
  onSelectionChange?: (leadIds: string[]) => void;
  onDeleteSelected?: () => void;
  onClearDuplicates?: () => void;
  onSendFollowUp?: (leadId: string, observacao?: string) => void;
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string) => void;
}

type FilterCategory = {
  duplicados?: boolean;
};

export function AllLeadsView({ leads, onMarkAttendance, onUpdateLead, selectedLeads, onSelectionChange, onDeleteSelected, onClearDuplicates, onSendFollowUp, onRegisterCall }: AllLeadsViewProps) {
  const [filters, setFilters] = useState<FilterCategory>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContactMonth, setSelectedContactMonth] = useState<string>("all");
  const [selectedAppointmentMonth, setSelectedAppointmentMonth] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

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
      if (lead.dataAgendamento) {
        const parts = lead.dataAgendamento.split("/");
        const month = parts[1];
        const year = parts[2]?.split(" ")[0]; // strip time if present
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

  // Get available sources
  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    leads.forEach((lead) => {
      sources.add(getSourceGroup(lead.fonteLead));
    });
    return Array.from(sources).sort();
  }, [leads]);

  // First filter by contact month, appointment month, and source
  const leadsFilteredByMonthSource = useMemo(() => {
    let result = leads;

    // Filter by contact month
    if (selectedContactMonth !== "all") {
      result = result.filter((lead) => {
        if (!lead.dataContato) return false;
        const [, month, year] = lead.dataContato.split("/");
        return `${month}/${year}` === selectedContactMonth;
      });
    }

    // Filter by appointment month
    if (selectedAppointmentMonth !== "all") {
      result = result.filter((lead) => {
        if (!lead.dataAgendamento) return false;
        const [, month, year] = lead.dataAgendamento.split("/");
        return `${month}/${year}` === selectedAppointmentMonth;
      });
    }

    // Filter by source
    if (selectedSource !== "all") {
      result = result.filter((lead) => {
        return getSourceGroup(lead.fonteLead) === selectedSource;
      });
    }

    return result;
  }, [leads, selectedContactMonth, selectedAppointmentMonth, selectedSource]);

  // Calculate stats based on month/source filters
  const stats = useMemo(() => {
    const totalLeads = leadsFilteredByMonthSource.length;
    const agendados = leadsFilteredByMonthSource.filter((l) => l.dataAgendamento && l.dataAgendamento !== "").length;
    const followUpsPendentes = leadsFilteredByMonthSource.filter((l) => l.etapaLead.startsWith("Follow-Up")).length;
    const compareceram = leadsFilteredByMonthSource.filter((l) => l.comparecimento === "COMPARECEU").length;
    
    return {
      totalLeads,
      agendados,
      followUpsPendentes,
      compareceram,
    };
  }, [leadsFilteredByMonthSource]);

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
    setSelectedContactMonth("all");
    setSelectedAppointmentMonth("all");
    setSelectedSource("all");
  };

  const hasActiveFilters = searchTerm !== "" || selectedContactMonth !== "all" || selectedAppointmentMonth !== "all" || selectedSource !== "all";

  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    accent: "bg-accent/10 text-accent",
  };

  const statsCards = [
    { key: "totalLeads" as const, label: "Total de Leads", icon: Users, color: "primary" },
    { key: "agendados" as const, label: "Agendados", icon: CalendarCheck, color: "success" },
    { key: "followUpsPendentes" as const, label: "Follow-ups Pend.", icon: Clock, color: "accent" },
    { key: "compareceram" as const, label: "Compareceram", icon: UserCheck, color: "success" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats and Filters Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Visão Geral dos Leads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Month and Source Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Mês Contato:</span>
              <Select value={selectedContactMonth} onValueChange={setSelectedContactMonth}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {availableContactMonths.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Mês Agenda:</span>
              <Select value={selectedAppointmentMonth} onValueChange={setSelectedAppointmentMonth}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {availableAppointmentMonths.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">Fonte:</span>
              <Badge
                variant={selectedSource === "all" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedSource("all")}
              >
                Todas
              </Badge>
              {availableSources.map((source) => (
                <Badge
                  key={source}
                  variant={selectedSource === source ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setSelectedSource(source)}
                >
                  {source}
                </Badge>
              ))}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statsCards.map((card, i) => {
              const Icon = card.icon;
              
              // Calcular porcentagens
              const getPercentage = () => {
                if (card.key === "agendados" && stats.totalLeads > 0) {
                  return `${((stats.agendados / stats.totalLeads) * 100).toFixed(1)}%`;
                }
                if (card.key === "compareceram" && stats.agendados > 0) {
                  return `${((stats.compareceram / stats.agendados) * 100).toFixed(1)}%`;
                }
                return null;
              };
              
              const percentage = getPercentage();
              
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
                    {percentage && (
                      <span className="text-sm font-semibold text-muted-foreground">({percentage})</span>
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

      {/* Search and Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Buscar Leads
            </div>
            <div className="text-sm font-normal text-muted-foreground">
              Exibindo <span className="font-bold text-foreground">{filteredLeads.length}</span> de{" "}
              <span className="font-bold text-foreground">{leadsFilteredByMonthSource.length}</span> leads
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone ou serviço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <div className="flex justify-end">
              <button
                onClick={clearFilters}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Selected Button */}
      {selectedLeads && selectedLeads.length > 0 && onDeleteSelected && (
        <div className="flex justify-end">
          <Button variant="destructive" onClick={onDeleteSelected}>
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir {selectedLeads.length} selecionado{selectedLeads.length > 1 ? 's' : ''}
          </Button>
        </div>
      )}

      {/* Lead Table */}
      <LeadTable 
        leads={filteredLeads} 
        onMarkAttendance={onMarkAttendance}
        selectedLeads={selectedLeads}
        onSelectionChange={onSelectionChange}
        onEditLead={onUpdateLead ? (lead) => setEditingLead(lead) : undefined}
        onSendFollowUp={onSendFollowUp}
        onRegisterCall={onRegisterCall}
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
    </div>
  );
}
