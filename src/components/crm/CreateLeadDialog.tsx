import { useState } from "react";
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

interface CreateLeadDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (lead: Omit<Lead, 'id'>) => void;
}

const ETAPAS: LeadStage[] = [
  "Novo", "Em contato",
  "Follow-Up 1", "Follow-Up 2", "Follow-Up 3", "Follow-Up 4",
  "Follow-Up 5", "Follow-Up 6", "Follow-Up 7", "Follow-Up 8",
  "Follow-Up 9", "Follow-Up 10", "Follow-Up 11", "Follow-Up 12",
  "Avaliação agendada", "Desistência", "Finalizado",
];

const FONTES = ["Online", "Google", "Sorteio Radio", "Site", "Indicação", "Outro"];

const STATUSES: LeadStatus[] = ["QUENTE", "MORNO", "FRIO"];

const RESPOSTAS: LeadResposta[] = ["RESPONDEU", "NÃO RESPONDEU"];

const COMPARECIMENTOS: LeadComparecimento[] = ["COMPARECEU", "NÃO COMPARECEU", "AGUARDANDO DATA"];

export function CreateLeadDialog({ open, onClose, onSave }: CreateLeadDialogProps) {
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
    dataFollowUp: "",
    dataAgendamento: "",
    dataRetornoLigacao: "",
    observacao: "",
    followUpCount: 0,
    lembretes: { h24: false, today: false },
  });

  const selectValue = (val: any) => (val === "" || val === undefined ? "none" : String(val));
  const fromSelect = (val: string) => (val === "none" ? "" : val);
  const set = (key: keyof typeof form, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
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

    // Validar formato do telefone (apenas dígitos)
    const cleanPhone = form.telefone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Telefone inválido (mínimo 10 dígitos)");
      return;
    }

    onSave(form);
    toast.success(`Lead "${form.nome}" criado com sucesso!`);
    
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
      dataFollowUp: "",
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
              onChange={(e) => set("telefone", e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="(17) 99999-9999"
            />
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
            <Input
              value={form.servicoProcurado || ""}
              onChange={(e) => set("servicoProcurado", e.target.value)}
              placeholder="Ex: Implante, Limpeza, etc"
            />
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
          <Button onClick={handleSave}>Criar Lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
