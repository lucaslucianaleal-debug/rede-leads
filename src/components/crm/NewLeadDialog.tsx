import { useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lead, LeadStage } from '@/types/crm';
import { format } from 'date-fns';
import { toast } from 'sonner';

const FONTES = ['Online', 'Google', 'Site', 'Indicação', 'Outro'];

export function NewLeadDialog({
  lead,
  clinicId,
  onClose,
  onCreateLead,
}: {
  lead: any;
  clinicId: string;
  onClose: () => void;
  onCreateLead?: (lead: Omit<Lead, 'id'>) => void;
}) {
  const hoje = format(new Date(), 'dd/MM/yyyy');
  const [form, setForm] = useState({
    nome: lead.nome || lead.name || '',
    telefone: lead.telefone || lead.phone || '',
    servicoProcurado: '',
    fonteLead: 'Online',
    observacao: lead.mensagem ? `Primeiro contato via WhatsApp: "${lead.mensagem}"` : '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.telefone) {
      toast.error('Preencha o telefone');
      return;
    }
    setSaving(true);
    try {
      const newLead: Omit<Lead, 'id'> = {
        nome: form.nome || form.telefone,
        telefone: form.telefone,
        servicoProcurado: form.servicoProcurado,
        fonteLead: form.fonteLead,
        observacao: form.observacao,
        etapaLead: 'Novo' as LeadStage,
        status: '',
        respostaLead: 'RESPONDEU',
        comparecimento: '',
        dataCriacao: hoje,
        dataContato: hoje,
        dataAgendamento: '',
        dataAgendamentoCriado: '',
        dataFollowUp: '',
        dataRetornoLigacao: '',
        captador: 'Z-API',
        followUpCount: 0,
        lembretes: { h24: false, today: false },
      };

      onCreateLead?.(newLead);

      // Remove da triagem
      await deleteDoc(doc(db, 'clinics', clinicId, 'triagem', lead.id));

      toast.success('Lead cadastrado com sucesso!');
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/60">
      <div className="w-full max-w-md bg-background rounded-xl shadow-xl p-6 space-y-4">
        <h4 className="font-semibold text-lg">Cadastrar Lead</h4>

        <div className="space-y-1">
          <Label>Nome</Label>
          <Input
            value={form.nome}
            onChange={(e) => set('nome', e.target.value)}
            placeholder="Nome do paciente"
          />
        </div>

        <div className="space-y-1">
          <Label>Telefone</Label>
          <Input value={form.telefone} onChange={(e) => set('telefone', e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>Serviço procurado</Label>
          <Input
            value={form.servicoProcurado}
            onChange={(e) => set('servicoProcurado', e.target.value)}
            placeholder="Ex: Implante, Ortodontia..."
          />
        </div>

        <div className="space-y-1">
          <Label>Fonte</Label>
          <Select value={form.fonteLead} onValueChange={(v) => set('fonteLead', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONTES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Observação</Label>
          <Textarea
            value={form.observacao}
            onChange={(e) => set('observacao', e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Cadastrar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NewLeadDialog;

