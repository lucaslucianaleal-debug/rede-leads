import { Lead, LeadStage, LeadStatus, LeadComparecimento } from "@/types/crm";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, ChevronUp, ChevronDown, Pencil } from "lucide-react";
import { useState } from "react";

interface LeadTableProps {
  leads: Lead[];
  onMarkAttendance?: (id: string, value: LeadComparecimento) => void;
  selectedLeads?: string[];
  onSelectionChange?: (leadIds: string[]) => void;
  onEditLead?: (lead: Lead) => void;
}

const statusColor: Record<LeadStatus | "", string> = {
  "QUENTE": "bg-destructive/15 text-destructive border-destructive/20",
  "MORNO": "bg-warning/15 text-warning border-warning/20",
  "FRIO": "bg-info/15 text-info border-info/20",
  "": "bg-muted text-muted-foreground border-border",
};

type SortField = 'nome' | 'telefone' | 'servicoProcurado' | 'fonteLead' | 'etapaLead' | 'status' | 'respostaLead' | 'comparecimento' | 'dataFollowUp' | 'dataAgendamento';
type SortDirection = 'asc' | 'desc' | null;

export function LeadTable({ leads, onMarkAttendance, selectedLeads = [], onSelectionChange, onEditLead }: LeadTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  const allSelected = leads.length > 0 && selectedLeads.length === leads.length;
  const someSelected = selectedLeads.length > 0 && selectedLeads.length < leads.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange?.([]);
    } else {
      onSelectionChange?.(leads.map(l => l.id));
    }
  };

  const handleSelectLead = (leadId: string) => {
    if (selectedLeads.includes(leadId)) {
      onSelectionChange?.(selectedLeads.filter(id => id !== leadId));
    } else {
      onSelectionChange?.([...selectedLeads, leadId]);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortedLeads = () => {
    if (!sortField || !sortDirection) return leads;

    return [...leads].sort((a, b) => {
      let aValue = a[sortField] || '';
      let bValue = b[sortField] || '';

      // Convert to string for comparison
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();

      if (sortDirection === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-3 w-3 ml-1 text-muted-foreground" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp className="h-3 w-3 ml-1" />;
    }
    return <ChevronDown className="h-3 w-3 ml-1" />;
  };

  const sortedLeads = getSortedLeads();

  // Função para normalizar telefone (apenas números)
  const normalizePhone = (phone: string) => phone.replace(/\D/g, '');

  // Detectar duplicatas por telefone normalizado
  const phoneCountMap = new Map<string, number>();
  leads.forEach(lead => {
    const normalizedPhone = normalizePhone(lead.telefone);
    if (normalizedPhone) {
      phoneCountMap.set(normalizedPhone, (phoneCountMap.get(normalizedPhone) || 0) + 1);
    }
  });

  const isDuplicate = (phone: string) => {
    const normalized = normalizePhone(phone);
    return normalized ? (phoneCountMap.get(normalized) || 0) > 1 : false;
  };
  
  const getDuplicateCount = (phone: string) => {
    const normalized = normalizePhone(phone);
    return normalized ? (phoneCountMap.get(normalized) || 0) : 0;
  };

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {onSelectionChange && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Selecionar todos"
                    className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
                  />
                </TableHead>
              )}
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('nome')} className="flex items-center hover:text-primary transition-colors">
                  Nome <SortIcon field="nome" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('telefone')} className="flex items-center hover:text-primary transition-colors">
                  Telefone <SortIcon field="telefone" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('servicoProcurado')} className="flex items-center hover:text-primary transition-colors">
                  Serviço <SortIcon field="servicoProcurado" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('fonteLead')} className="flex items-center hover:text-primary transition-colors">
                  Fonte <SortIcon field="fonteLead" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('etapaLead')} className="flex items-center hover:text-primary transition-colors">
                  Etapa <SortIcon field="etapaLead" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('status')} className="flex items-center hover:text-primary transition-colors">
                  Status <SortIcon field="status" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('respostaLead')} className="flex items-center hover:text-primary transition-colors">
                  Resposta <SortIcon field="respostaLead" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('comparecimento')} className="flex items-center hover:text-primary transition-colors">
                  Comparecimento <SortIcon field="comparecimento" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('dataFollowUp')} className="flex items-center hover:text-primary transition-colors">
                  Follow-up <SortIcon field="dataFollowUp" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">
                <button onClick={() => handleSort('dataAgendamento')} className="flex items-center hover:text-primary transition-colors">
                  Agendamento <SortIcon field="dataAgendamento" />
                </button>
              </TableHead>
              <TableHead className="font-heading font-semibold">Observação</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={onSelectionChange ? 12 : 11} className="text-center py-8 text-muted-foreground">
                  Nenhum lead encontrado
                </TableCell>
              </TableRow>
            ) : (
              sortedLeads.map((lead) => {
                const isLeadDuplicate = isDuplicate(lead.telefone);
                const duplicateCount = getDuplicateCount(lead.telefone);
                
                return (
                <TableRow 
                  key={lead.id} 
                  className={`hover:bg-muted/30 transition-colors relative ${isLeadDuplicate ? 'border-l-4 border-l-amber-500' : ''}`}
                >
                  {onSelectionChange && (
                    <TableCell>
                      <Checkbox
                        checked={selectedLeads.includes(lead.id)}
                        onCheckedChange={() => handleSelectLead(lead.id)}
                        aria-label={`Selecionar ${lead.nome}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {lead.nome}
                      {isLeadDuplicate && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                          ×{duplicateCount}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{lead.telefone}</TableCell>
                  <TableCell className="text-sm">{lead.servicoProcurado}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{lead.fonteLead}</TableCell>
                  <TableCell>
                    <span className="text-xs font-medium">{lead.etapaLead}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`badge-stage ${statusColor[lead.status]}`}>
                      {lead.status || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{lead.respostaLead || "—"}</TableCell>
                  <TableCell className="text-xs flex items-center gap-2">
                    {lead.comparecimento === "COMPARECEU" && <span className="text-success font-medium">✓ Compareceu</span>}
                    {lead.comparecimento === "NÃO COMPARECEU" && <span className="text-destructive font-medium">✗ Não compareceu</span>}
                    {!lead.comparecimento && "—"}
                    {onMarkAttendance && (
                      <div className="flex gap-1 ml-2">
                        <button
                          title="Marcar compareceu"
                          className="text-success hover:bg-success/10 rounded-full p-1"
                          onClick={() => onMarkAttendance(lead.id, "COMPARECEU")}
                        >
                          ✓
                        </button>
                        <button
                          title="Marcar não compareceu"
                          className="text-destructive hover:bg-destructive/10 rounded-full p-1"
                          onClick={() => onMarkAttendance(lead.id, "NÃO COMPARECEU")}
                        >
                          ✗
                        </button>
                        <button
                          title="Limpar"
                          className="text-muted hover:bg-muted/10 rounded-full p-1"
                          onClick={() => onMarkAttendance(lead.id, "")}
                        >
                          –
                        </button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{lead.dataFollowUp || "—"}</TableCell>
                  <TableCell className="text-xs">{lead.dataAgendamento || "—"}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate" title={lead.observacao}>{lead.observacao || "—"}</TableCell>
                  {onEditLead && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={() => onEditLead(lead)}
                        title="Editar lead"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
