import { ClinicFilter, LeadStage, LeadStatus, LeadResposta } from "@/types/crm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface LeadFiltersProps {
  filters: ClinicFilter;
  onFilterChange: (filters: ClinicFilter) => void;
}

const stages: (LeadStage | "Todas")[] = [
  "Todas", "Novo", "Em contato", "Follow-Up 1", "Follow-Up 2", "Follow-Up 3", "Follow-Up 4",
  "Follow-Up 5", "Follow-Up 6", "Follow-Up 7", "Follow-Up 8", "Avaliação agendada", "Fora da região", "Desistência", "Finalizado",
];

const statuses: (LeadStatus | "Todos")[] = ["Todos", "QUENTE", "MORNO", "FRIO"];
const respostas: (LeadResposta | "Todas")[] = ["Todas", "RESPONDEU", "NÃO RESPONDEU"];

export function LeadFilters({ filters, onFilterChange }: LeadFiltersProps) {
  return (
    <div className="flex flex-wrap gap-6 items-center">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar lead..."
          value={filters.busca}
          onChange={(e) => onFilterChange({ ...filters, busca: e.target.value })}
          className="pl-9 bg-card"
        />
      </div>
      <Select value={filters.etapa} onValueChange={(v) => onFilterChange({ ...filters, etapa: v as any })}>
        <SelectTrigger className="min-w-[180px] bg-card">
          <SelectValue placeholder="Etapa" />
        </SelectTrigger>
        <SelectContent>
          {stages.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.status} onValueChange={(v) => onFilterChange({ ...filters, status: v as any })}>
        <SelectTrigger className="min-w-[140px] bg-card">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {statuses.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.resposta} onValueChange={(v) => onFilterChange({ ...filters, resposta: v as any })}>
        <SelectTrigger className="min-w-[180px] bg-card">
          <SelectValue placeholder="Resposta" />
        </SelectTrigger>
        <SelectContent>
          {respostas.map((r) => (
            <SelectItem key={r} value={r}>{r}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
