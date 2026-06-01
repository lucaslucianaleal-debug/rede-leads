import { useState, useEffect, useRef } from "react";
import { Lead, LeadStage, LeadStatus, LeadResposta, LeadComparecimento } from "@/types/crm";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { maskPhone, isValidPhone } from "@/lib/phone";
import { useLeads } from "@/hooks/useLeads";
import { normalizePhoneTo10Digits } from "@/lib/phone";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchActiveCampaignList } from "@/services/campaignService";

interface CreateLeadDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (lead: Omit<Lead, 'id'>) => void;
  onOpenCall?: (phone: string) => void;
}

const ETAPAS: LeadStage[] = [
  "Novo", "Em contato",
  "Follow-Up 1", "Follow-Up 2", "Follow-Up 3", "Follow-Up 4",
  "Follow-Up 5", "Follow-Up 6", "Follow-Up 7", "Follow-Up 8",
  "Follow-Up 9", "Follow-Up 10", "Follow-Up 11", "Follow-Up 12",
  "Avaliação agendada", "Fora da região", "Desistência", "Finalizado",
];

const SERVICOS = ["Implante", "Prótese", "Protocolo", "Facetas", "Ortodontia", "Clínico geral", "Harmonização facial", "Clareamento", "Limpeza"];

const FONTES = ["Online", "Google", "Sorteio Radio", "Site", "Indicação", "Promotora", "Hotleads", "Outro"];

const STATUSES: LeadStatus[] = ["QUENTE", "MORNO", "FRIO"];

const RESPOSTAS: LeadResposta[] = ["RESPONDEU", "NÃO RESPONDEU"];

const COMPARECIMENTOS: LeadComparecimento[] = ["COMPARECEU", "NÃO COMPARECEU", "AGUARDANDO DATA"];

export function CreateLeadDialog({ open, onClose, onSave, onOpenCall }: CreateLeadDialogProps) {
  const { allLeads } = useLeads();
  const { currentClinic, selectedClinic } = useAuth();
  const clinicId = currentClinic || selectedClinic || "";
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const fetchedClinic = useRef("");
  const [duplicateWarning, setDuplicateWarning] = useState<{ nome: string; etapa: string } | null>(null);
  const [form, setForm] = useState<Omit<Lead, 'id'>>({
    dataCriacao: format(new Date(), "dd/MM/yyyy"),
    dataContato: format(new Date(), "dd/MM/yyyy"),
    nome: "",
    telefone: "",
    servicoProcurado: "",
    captador: "",
    fonteLead: "Outro",
    etapaLead: "Novo",
    status: "",
    respostaLead: "",
    comparecimento: "",
    dataFollowUp: format(new Date(), "dd/MM/yyyy"), // Default hoje para aparecer na fila de follow-up
    dataAgendamento: "",
    dataRetornoLigacao: "",
    observacao: "",
    followUpCount: 0,
    lembretes: { h24: false, today: false },
  });

  useEffect(() => {
    if (!clinicId || clinicId === fetchedClinic.current) return;
    fetchedClinic.current = clinicId;
    fetchActiveCampaignList(clinicId).then(setCampaigns);
  }, [clinicId]);

  const selectValue = (val: any) => (val === "" || val === undefined ? "none" : String(val));
  const fromSelect = (val: string) => (val === "none" ? "" : val);
  const set = (key: keyof typeof form, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const checkDuplicate = (phone: string) => {
    const norm = normalizePhoneTo10Digits(phone);
    if (!norm) { setDuplicateWarning(null); return; }
    const found = allLeads.find(l => normalizePhoneTo10Digits(l.telefone) === norm);
    setDuplicateWarning(found ? { nome: found.nome, etapa: found.etapaLead } : null);
  };

  const handleSave = () => {
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (!form.telefone.trim()) {
      toast.error("Telefone é obrigatório");
      return;
    }
    if (!isValidPhone(form.telefone)) {
      toast.error("Telefone inválido — use o formato (XX) XXXXX-XXXX");
      return;
    }

    onSave(form);
    toast.success(`Lead "${form.nome}" criado com sucesso!`);
    
    // Abrir diálogo de ligação com o novo lead (após criar)
    if (onOpenCall) {
      onOpenCall(form.telefone);
    }
    
    // Reset form
    setForm({
      dataCriacao: format(new Date(), "dd/MM/yyyy"),
      dataContato: format(new Date(), "dd/MM/yyyy"),
      nome: "",
      telefone: "",
      servicoProcurado: "",
      captador: "",
      fonteLead: "Outro",
      etapaLead: "Novo",
      status: "",
      respostaLead: "",
      comparecimento: "",
      dataFollowUp: format(new Date(), "dd/MM/yyyy"),
      dataAgendamento: "",
      dataRetornoLigacao: "",
      observacao: "",
      followUpCount: 0,
      lembretes: { h24: false, today: false },
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Novo Lead</DialogTitle>
          <div className="text-xs text-muted-foreground mt-1">
            Preencha os campos abaixo para adicionar um novo lead
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Nome */}
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input
              value={form.nome || ""}
              onChange={(e) => set("nome", e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nome do contato"
            />
          </div>

          {/* Telefone */}
          <div className="space-y-1">
            <Label>Telefone *</Label>
            <Input
              value={form.telefone || ""}
              onChange={(e) => {
                const masked = maskPhone(e.target.value);
                set("telefone", masked);
                checkDuplicate(masked);
              }}
              onKeyDown={handleKeyDown}
              placeholder="(17) 99999-9999"
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

          {/* Serviço Procurado */}
          <div className="space-y-1">
            <Label>Serviço Procurado</Label>
            <Select value={selectValue(form.servicoProcurado)} onValueChange={(v) => set("servicoProcurado", fromSelect(v))}>
              <SelectTrigger><SelectValue placeholder="Selecione um serviço" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {SERVICOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Captador */}
          <div className="space-y-1">
            <Label>Captador</Label>
            <Input
              value={form.captador || ""}
              onChange={(e) => set("captador", e.target.value)}
              placeholder="Quem captou o lead"
            />
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
          {campaigns.length > 0 && (
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
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhuma</SelectItem>
                  {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

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
                <SelectItem value="none">—</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Resposta */}
          <div className="space-y-1">
            <Label>Resposta</Label>
            <Select value={selectValue(form.respostaLead)} onValueChange={(v) => set("respostaLead", fromSelect(v) as LeadResposta)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {RESPOSTAS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Comparecimento */}
          <div className="space-y-1">
            <Label>Comparecimento</Label>
            <Select value={selectValue(form.comparecimento)} onValueChange={(v) => set("comparecimento", fromSelect(v) as LeadComparecimento)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {COMPARECIMENTOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Observação */}
          <div className="space-y-1 col-span-2">
            <Label>Observação</Label>
            <Textarea
              value={form.observacao || ""}
              onChange={(e) => set("observacao", e.target.value)}
              rows={2}
              placeholder="Notas sobre o lead"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Criar e Ligar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
