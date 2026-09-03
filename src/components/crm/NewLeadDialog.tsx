import { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
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
import { addCustomService, resolveServiceOptions } from '@/lib/serviceCatalog';
import { fetchActiveCampaignList } from '@/services/campaignService';

const ETAPAS: LeadStage[] = [
  'Novo', 'Em contato',
  'Follow-Up 1', 'Follow-Up 2', 'Follow-Up 3', 'Follow-Up 4',
  'Follow-Up 5', 'Follow-Up 6', 'Follow-Up 7', 'Follow-Up 8',
  'Follow-Up 9', 'Follow-Up 10', 'Follow-Up 11', 'Follow-Up 12',
  'Avaliação agendada', 'Fora da região', 'Desistência', 'Finalizado',
];

const FONTES = ['Online', 'Google', 'Sorteio Radio', 'Site', 'Indicação', 'Promotora', 'Hotleads', 'Outro'];

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

  const dataLead = (() => {
    if (lead.createdAt) {
      return format(new Date(lead.createdAt), 'dd/MM/yyyy');
    }
    if (lead.dataRecebimento) {
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
    fonteLead: lead.fonteLead || 'Online',
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
    metaCampanhaId: lead.metaCampanhaId || '',
    metaCampanhaNome: lead.metaCampanhaNome || '',
  });
  const [saving, setSaving] = useState(false);
  const [customServiceInput, setCustomServiceInput] = useState('');
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const clinicMeta = JSON.parse(localStorage.getItem('crm_clinic_cache') || 'null');
    const nextOptions = resolveServiceOptions(
      clinicMeta && clinicMeta.id === clinicId ? clinicMeta : { module: 'corretor' },
      []
    );
    setServiceOptions(nextOptions);
    fetchActiveCampaignList(clinicId).then(setCampaigns).catch(() => setCampaigns([]));
  }, [clinicId]);

  const selectValue = (val: any) => (val === '' || val === undefined ? 'none' : String(val));
  const fromSelect = (val: string) => (val === 'none' ? '' : val);
  const set = (key: keyof typeof form, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleAddCustomService = async () => {
    const value = customServiceInput.trim();
    if (!value) return;
    const updated = addCustomService(serviceOptions, value);
    setServiceOptions(updated);
    setForm((f) => ({ ...f, servicoProcurado: value }));
    setCustomServiceInput('');

    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      await updateDoc(doc(db, 'clinics', clinicId), { customServices: updated });
    } catch {
      // ignore
    }
  };

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
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={form.nome || ''} onChange={(e) => set('nome', e.target.value)} placeholder="Nome do contato" />
          </div>

          <div className="space-y-1">
            <Label>Telefone *</Label>
            <Input value={form.telefone || ''} onChange={(e) => set('telefone', maskPhone(e.target.value))} placeholder="(17) 99999-9999" />
          </div>

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

          <div className="space-y-1">
            <Label>Serviço Procurado</Label>
            <Select value={selectValue(form.servicoProcurado)} onValueChange={(v) => set('servicoProcurado', fromSelect(v))}>
              <SelectTrigger><SelectValue placeholder="Selecione ou adicione um serviço" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {serviceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2 mt-2">
              <Input
                value={customServiceInput}
                onChange={(e) => setCustomServiceInput(e.target.value)}
                placeholder="Adicionar serviço personalizado"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomService();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddCustomService}>Adicionar</Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Captador</Label>
            <Input value={form.captador || ''} onChange={(e) => set('captador', e.target.value)} placeholder="Quem captou o lead" />
          </div>

          <div className="space-y-1">
            <Label>Fonte</Label>
            <Select value={selectValue(form.fonteLead)} onValueChange={(v) => set('fonteLead', fromSelect(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTES.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Campanha Meta Ads</Label>
            <Select
              value={selectValue(form.metaCampanhaId)}
              onValueChange={(v) => {
                if (v === 'none') {
                  setForm((f) => ({ ...f, metaCampanhaId: '', metaCampanhaNome: '' }));
                  return;
                }
                const campaign = campaigns.find((item) => item.id === v);
                setForm((f) => ({ ...f, metaCampanhaId: v, metaCampanhaNome: campaign?.name || '' }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Não identificada" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não identificada</SelectItem>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.metaCampanhaNome && (
              <p className="text-xs text-emerald-600">Identificada automaticamente: {form.metaCampanhaNome}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Etapa</Label>
            <Select value={selectValue(form.etapaLead)} onValueChange={(v) => set('etapaLead', fromSelect(v) as LeadStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

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
