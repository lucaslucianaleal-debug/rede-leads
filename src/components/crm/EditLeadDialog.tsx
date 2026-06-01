import { useState, useEffect } from "react";
import { Lead, LeadStage, LeadStatus, LeadResposta, LeadComparecimento } from "@/types/crm";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { saveLeadWithSync } from "@/lib/crmSync";
import { db } from "@/lib/firebase";
import { maskPhone, isValidPhone } from "@/lib/phone";
import { normalizePhoneTo10Digits } from "@/lib/phone";
import { useLeads } from "@/hooks/useLeads";
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchActiveCampaignList } from "@/services/campaignService";

interface EditLeadDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Lead>) => void;
}

const ETAPAS: LeadStage[] = [
  "Novo", "Em contato",
  "Follow-Up 1", "Follow-Up 2", "Follow-Up 3", "Follow-Up 4",
  "Follow-Up 5", "Follow-Up 6", "Follow-Up 7", "Follow-Up 8",
  "Follow-Up 9", "Follow-Up 10", "Follow-Up 11", "Follow-Up 12",
  "Avaliação agendada", "Fora da região", "Desistência", "Finalizado",
];

const FONTES = ["Online", "Google", "Sorteio Radio", "Site", "Indicação", "Promotora", "Hotleads", "Outro"];
const SERVICOS = ["Implante", "Prótese", "Protocolo", "Facetas", "Ortodontia", "Clínico geral", "Harmonização facial", "Clareamento", "Limpeza"];

export function EditLeadDialog({ lead, open, onClose, onSave }: EditLeadDialogProps) {
  const { allLeads } = useLeads();
  const { currentClinic, selectedClinic } = useAuth();
  const clinicId = currentClinic || selectedClinic || "";
  const [duplicateWarning, setDuplicateWarning] = useState<{ nome: string; etapa: string } | null>(null);
  const [form, setForm] = useState<Partial<Lead>>({});
  const [agendamentoTime, setAgendamentoTime] = useState("09:00");
  const [agendamentoDate, setAgendamentoDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [previousPhone, setPreviousPhone] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const fetchedClinic = useRef("");

  useEffect(() => {
    if (!clinicId || clinicId === fetchedClinic.current) return;
    fetchedClinic.current = clinicId;
    fetchActiveCampaignList(clinicId).then(setCampaigns);
  }, [clinicId]);

  useEffect(() => {
    if (lead) {
      setForm({ ...lead });
      setPreviousPhone(lead.telefone || "");
      // Parse existing dataAgendamento
      if (lead.dataAgendamento) {
        const parts = lead.dataAgendamento.split(" ");
        const datePart = parts[0];
        const timePart = parts[1] || "09:00";
        setAgendamentoTime(timePart);
        try {
          const parsed = parse(datePart, "dd/MM/yyyy", new Date());
          if (isValid(parsed)) setAgendamentoDate(parsed);
          else setAgendamentoDate(undefined);
        } catch {
          setAgendamentoDate(undefined);
        }
      } else {
        setAgendamentoDate(undefined);
        setAgendamentoTime("09:00");
      }
    }
  }, [lead]);

  if (!lead) return null;

  const set = (field: keyof Lead, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // previousPhone já declarado acima, não redeclarar

  const NONE = "__none__";

  const selectValue = (v: string | undefined) => v || NONE;
  const fromSelect = (v: string) => v === NONE ? "" : v;

  const handleSave = async () => {

    const { followUpCount, ...safeUpdates } = form as Lead;
    const finalAgendamento = agendamentoDate
      ? `${format(agendamentoDate, "dd/MM/yyyy")} ${agendamentoTime}`
      : "";
    let updates: any = { ...safeUpdates, dataAgendamento: finalAgendamento };

    // Se está criando ou alterando agendamento, registrar corretamente
    if (finalAgendamento) {
      const hoje = format(new Date(), "dd/MM/yyyy HH:mm");
      const hojeDate = format(new Date(), "dd/MM/yyyy");
      const agendamentoAnterior = lead.dataAgendamento;

      if (!agendamentoAnterior) {
        // Lead não tinha agendamento — primeiro agendamento
        if (!form.dataAgendamentoCriado) updates.dataAgendamentoCriado = hojeDate;
      } else if (agendamentoAnterior !== finalAgendamento) {
        // Lead já tinha agendamento e mudou — reagendamento
        updates.dataAgendamentoAlterado = hojeDate;
        const historicoAtual: any[] = Array.isArray(lead.historicoAgendamentos) ? lead.historicoAgendamentos : [];
        updates.historicoAgendamentos = [
          ...historicoAtual,
          { data: agendamentoAnterior, registradoEm: hoje },
        ];
        // Se dataAgendamentoCriado nunca foi setado (lead antigo), usa a data anterior
        // para não contar como novo agendamento hoje
        if (!form.dataAgendamentoCriado) {
          updates.dataAgendamentoCriado = agendamentoAnterior.split(' ')[0];
        }
      }
      // Se agendamentoAnterior === finalAgendamento → apenas editando outros campos, sem mudança de rastreamento
    } else {
      // Se removeu o agendamento, limpa o campo criado
      updates.dataAgendamentoCriado = "";
      updates.dataAgendamentoAlterado = "";
    }

    // Validação básica do telefone antes de chamar o sync
    const phoneDigits = String(updates.telefone || "").replace(/\D/g, "");
    if (!phoneDigits) {
      toast.error('Telefone é obrigatório');
      return;
    }
    if (!isValidPhone(String(updates.telefone || ""))) {
      toast.error('Telefone inválido — use o formato (XX) XXXXX-XXXX');
      return;
    }

    try {
      const result = await saveLeadWithSync(db, updates, { previousPhone });
      // Notify and update parent state
      toast.success("Lead sincronizado com sucesso!");
      onSave(lead.id, updates);
      onClose();
    } catch (e: any) {
      console.error('Erro ao salvar lead com sync', e);
      toast.error('Falha ao salvar lead. Veja console para detalhes.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Lead — {lead.nome}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Editar as informações do lead</DialogDescription>
          </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Nome */}
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={form.nome || ""} onChange={(e) => set("nome", e.target.value)} />
          </div>

          {/* Telefone */}
          <div className="space-y-1">
            <Label>Telefone</Label>
            <Input
              value={form.telefone || ""}
              onChange={(e) => {
                const masked = maskPhone(e.target.value);
                set("telefone", masked);
                const norm = normalizePhoneTo10Digits(masked);
                if (norm) {
                  const found = allLeads.find(l => l.id !== lead.id && normalizePhoneTo10Digits(l.telefone) === norm);
                  setDuplicateWarning(found ? { nome: found.nome, etapa: found.etapaLead } : null);
                } else {
                  setDuplicateWarning(null);
                }
              }}
              className={duplicateWarning ? "border-yellow-400 focus-visible:ring-yellow-400" : ""}
            />
            {duplicateWarning && (
              <div className="flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5 mt-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Telefone já cadastrado: <strong>{duplicateWarning.nome}</strong> ({duplicateWarning.etapa})</span>
              </div>
            )}
          </div>

          {/* Data de Criação */}
          <div className="space-y-1">
            <Label>Data de Criação</Label>
            <Input
              type="date"
              value={form.dataCriacao?.split("/").reverse().join("-") || ""}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month, day] = e.target.value.split("-");
                  set("dataCriacao", `${day}/${month}/${year}`);
                }
              }}
            />
          </div>

          {/* Data de Contato */}
          <div className="space-y-1">
            <Label>Data de Contato</Label>
            <Input
              type="date"
              value={form.dataContato?.split("/").reverse().join("-") || ""}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month, day] = e.target.value.split("-");
                  set("dataContato", `${day}/${month}/${year}`);
                }
              }}
            />
          </div>

          {/* Serviço */}
          <div className="space-y-1">
            <Label>Serviço Procurado</Label>
            <Select value={selectValue(form.servicoProcurado)} onValueChange={(v) => set("servicoProcurado", fromSelect(v))}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value={"__none__"}>—</SelectItem>
                {SERVICOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Captador */}
          <div className="space-y-1">
            <Label>Captador</Label>
            <Input value={form.captador || ""} onChange={(e) => set("captador", e.target.value)} />
          </div>

          {/* Fonte */}
          <div className="space-y-1">
            <Label>Fonte</Label>
            <Select value={selectValue(form.fonteLead)} onValueChange={(v) => set("fonteLead", fromSelect(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Campanha Meta Ads */}
          <div className="space-y-1">
            <Label>Campanha Meta Ads</Label>
            <Select
              value={form.metaCampanhaId || "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  set("metaCampanhaId", "");
                  set("metaCampanhaNome", "");
                } else {
                  const c = campaigns.find(c => c.id === v);
                  set("metaCampanhaId", v);
                  set("metaCampanhaNome", c?.name || "");
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nenhuma</SelectItem>
                {campaigns.length > 0 ? campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>) : <SelectItem value="_disabled" disabled>Nenhuma campanha ativa</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {/* Etapa */}
          <div className="space-y-1">
            <Label>Etapa</Label>
            <Select value={selectValue(form.etapaLead)} onValueChange={(v) => set("etapaLead", fromSelect(v) as LeadStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={selectValue(form.status)} onValueChange={(v) => set("status", fromSelect(v) as LeadStatus)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                <SelectItem value="QUENTE">QUENTE</SelectItem>
                <SelectItem value="MORNO">MORNO</SelectItem>
                <SelectItem value="FRIO">FRIO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Resposta */}
          <div className="space-y-1">
            <Label>Resposta</Label>
            <Select value={selectValue(form.respostaLead)} onValueChange={(v) => set("respostaLead", fromSelect(v) as LeadResposta)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                <SelectItem value="RESPONDEU">RESPONDEU</SelectItem>
                <SelectItem value="NÃO RESPONDEU">NÃO RESPONDEU</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Comparecimento */}
          <div className="space-y-1">
            <Label>Comparecimento</Label>
            <Select value={selectValue(form.comparecimento)} onValueChange={(v) => set("comparecimento", fromSelect(v) as LeadComparecimento)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                <SelectItem value="AGUARDANDO DATA">AGUARDANDO DATA</SelectItem>
                <SelectItem value="COMPARECEU">COMPARECEU</SelectItem>
                <SelectItem value="NÃO COMPARECEU">NÃO COMPARECEU</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Data Agendamento */}
          <div className="space-y-1 col-span-2">
            <Label>Data/Hora do Agendamento</Label>
            <div className="flex gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {agendamentoDate
                      ? format(agendamentoDate, "dd/MM/yyyy", { locale: ptBR })
                      : <span className="text-muted-foreground">Selecionar data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={agendamentoDate}
                    onSelect={(date) => {
                      setAgendamentoDate(date);
                      setCalendarOpen(false);
                    }}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                value={agendamentoTime}
                onChange={(e) => setAgendamentoTime(e.target.value)}
                className="w-32"
              />
              {agendamentoDate && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setAgendamentoDate(undefined); setAgendamentoTime("09:00"); }}
                  title="Limpar"
                >
                  ×
                </Button>
              )}
            </div>
          </div>

          {/* Observação */}
          <div className="space-y-1 col-span-2">
            <Label>Observação</Label>
            <Textarea
              value={form.observacao || ""}
              onChange={(e) => set("observacao", e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
