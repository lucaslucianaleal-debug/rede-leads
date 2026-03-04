import { useState, useEffect } from "react";
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
  "Avaliação agendada", "Desistência", "Finalizado",
];

const FONTES = ["Online", "Google", "Cupom Indicação", "Sorteio Radio", "Site", "Indicação", "Outro"];

export function EditLeadDialog({ lead, open, onClose, onSave }: EditLeadDialogProps) {
  const [form, setForm] = useState<Partial<Lead>>({});

  useEffect(() => {
    if (lead) setForm({ ...lead });
  }, [lead]);

  if (!lead) return null;

  const set = (field: keyof Lead, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const NONE = "__none__";

  const selectValue = (v: string | undefined) => v || NONE;
  const fromSelect = (v: string) => v === NONE ? "" : v;

  const handleSave = () => {
    onSave(lead.id, form);
    toast.success("Lead atualizado!");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lead — {lead.nome}</DialogTitle>
          <div className="text-xs text-muted-foreground mt-1">
            Lead criado em <strong>{form.dataCriacao}</strong>
          </div>
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
            <Input value={form.telefone || ""} onChange={(e) => set("telefone", e.target.value)} />
          </div>

          {/* Serviço */}
          <div className="space-y-1">
            <Label>Serviço Procurado</Label>
            <Input value={form.servicoProcurado || ""} onChange={(e) => set("servicoProcurado", e.target.value)} />
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
                <SelectItem value="COMPARECEU">COMPARECEU</SelectItem>
                <SelectItem value="NÃO COMPARECEU">NÃO COMPARECEU</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Data Contato */}
          <div className="space-y-1">
            <Label>Data do Contato (dd/mm/aaaa)</Label>
            <Input
              value={form.dataContato || ""}
              onChange={(e) => set("dataContato", e.target.value)}
              placeholder="01/01/2026"
            />
          </div>

          {/* Data Follow-Up */}
          <div className="space-y-1">
            <Label>Data do Follow-Up (dd/mm/aaaa)</Label>
            <Input
              value={form.dataFollowUp || ""}
              onChange={(e) => set("dataFollowUp", e.target.value)}
              placeholder="01/01/2026"
            />
          </div>

          {/* Data Agendamento */}
          <div className="space-y-1">
            <Label>Data/Hora do Agendamento (dd/mm/aaaa hh:mm)</Label>
            <Input
              value={form.dataAgendamento || ""}
              onChange={(e) => set("dataAgendamento", e.target.value)}
              placeholder="01/01/2026 17:00"
            />
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
