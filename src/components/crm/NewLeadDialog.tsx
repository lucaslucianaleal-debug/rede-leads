import { useState } from 'react';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { maskPhone } from '@/lib/phone';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Lead, LeadStage, LeadStatus, LeadResposta, LeadComparecimento } from '@/types/crm';
import { format } from 'date-fns';
import { toast } from 'sonner';

const ETAPAS: LeadStage[] = [
  'Novo', 'Em contato',
  'Follow-Up 1', 'Follow-Up 2', 'Follow-Up 3', 'Follow-Up 4',
  'Follow-Up 5', 'Follow-Up 6', 'Follow-Up 7', 'Follow-Up 8',
  'Follow-Up 9', 'Follow-Up 10', 'Follow-Up 11', 'Follow-Up 12',
  'Avaliação agendada', 'Fora da região', 'Desistência', 'Finalizado',
];

const SERVICOS = ['Implante', 'Prótese', 'Protocolo', 'Facetas', 'Ortodontia', 'Clínico geral', 'Harmonização facial', 'Clareamento'];

const FONTES = ['Online', 'Google', 'Sorteio Radio', 'Site', 'Indicação', 'Influenciadora', 'Influenciador', 'Hotleads', 'Outro'];

const STATUSES: LeadStatus[] = ['QUENTE', 'MORNO', 'FRIO'];
const RESPOSTAS: LeadResposta[] = ['RESPONDEU', 'NÃO RESPONDEU'];
const COMPARECIMENTOS: LeadComparecimento[] = ['COMPARECEU', 'NÃO COMPARECEU', 'AGUARDANDO DATA'];

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

  // Extrair data do lead recebido: preferir createdAt (timestamp), depois dataRecebimento ("dd/MM/yyyy, HH:mm:ss")
  const dataLead = (() => {
    if (lead.createdAt) {
      return format(new Date(lead.createdAt), 'dd/MM/yyyy');
    }
    if (lead.dataRecebimento) {
      // formato "31/03/2026, 23:32:31" → pegar só a data
      return lead.dataRecebimento.split(',')[0].trim();
    }
    return hoje;
  })();

  const [form, setForm] = useState<Omit<Lead, 'id'>>({
    dataCriacao: dataLead,
    dataContato: dataLead,
    nome: lead.nome || lead.name || '',
    telefone: lead.telefone || lead.phone || '',
    servicoProcurado: '',
    captador: '',
    fonteLead: 'Online',
    etapaLead: 'Novo',
    status: '',
    respostaLead: 'RESPONDEU',
    comparecimento: '',
    dataFollowUp: dataLead,
    dataAgendamento: '',
    dataRetornoLigacao: '',
    observacao: lead.mensagem ? `Primeiro contato via WhatsApp: "${lead.mensagem}"` : '',
    followUpCount: 0,
    lembretes: { h24: false, today: false },
  });
  const [saving, setSaving] = useState(false);

  const selectValue = (val: any) => (val === '' || val === undefined ? 'none' : String(val));
  const fromSelect = (val: string) => (val === 'none' ? '' : val);
  const set = (key: keyof typeof form, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.telefone.trim()) {
      toast.error('Telefone é obrigatório');
      return;
    }
    setSaving(true);
    try {
      onCreateLead?.(form);
      await setDoc(doc(db, 'clinics', clinicId, 'triagem', lead.id), { convertido: true }, { merge: true });
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Lead</DialogTitle>
          <div className="text-xs text-muted-foreground mt-1">Lead recebido via WhatsApp</div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Nome */}
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={form.nome || ''} onChange={(e) => set('nome', e.target.value)} placeholder="Nome do contato" />
          </div>

          {/* Telefone */}
          <div className="space-y-1">
            <Label>Telefone *</Label>
            <Input value={form.telefone || ''} onChange={(e) => set('telefone', maskPhone(e.target.value))} placeholder="(17) 99999-9999" />
          </div>

          {/* Data de Criação */}
          <div className="space-y-1">
            <Label>Data de Criação</Label>
            <Input
              type="date"
              value={form.dataCriacao?.split('/').reverse().join('-') || ''}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month, day] = e.target.value.split('-');
                  set('dataCriacao', `${day}/${month}/${year}`);
                }
              }}
            />
          </div>

          {/* Data de Contato */}
          <div className="space-y-1">
            <Label>Data de Contato</Label>
            <Input
              type="date"
              value={form.dataContato?.split('/').reverse().join('-') || ''}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month, day] = e.target.value.split('-');
                  set('dataContato', `${day}/${month}/${year}`);
                }
              }}
            />
          </div>

          {/* Serviço Procurado */}
          <div className="space-y-1">
            <Label>Serviço Procurado</Label>
            <Select value={selectValue(form.servicoProcurado)} onValueChange={(v) => set('servicoProcurado', fromSelect(v))}>
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
            <Input value={form.captador || ''} onChange={(e) => set('captador', e.target.value)} placeholder="Quem captou o lead" />
          </div>

          {/* Fonte */}
          <div className="space-y-1">
            <Label>Fonte</Label>
            <Select value={selectValue(form.fonteLead)} onValueChange={(v) => set('fonteLead', fromSelect(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Etapa */}
          <div className="space-y-1">
            <Label>Etapa</Label>
            <Select value={selectValue(form.etapaLead)} onValueChange={(v) => set('etapaLead', fromSelect(v) as LeadStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={selectValue(form.status)} onValueChange={(v) => set('status', fromSelect(v) as LeadStatus)}>
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
            <Select value={selectValue(form.respostaLead)} onValueChange={(v) => set('respostaLead', fromSelect(v) as LeadResposta)}>
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
            <Select value={selectValue(form.comparecimento)} onValueChange={(v) => set('comparecimento', fromSelect(v) as LeadComparecimento)}>
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
              value={form.observacao || ''}
              onChange={(e) => set('observacao', e.target.value)}
              rows={2}
              placeholder="Notas sobre o lead"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Cadastrar e Ligar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewLeadDialog;

