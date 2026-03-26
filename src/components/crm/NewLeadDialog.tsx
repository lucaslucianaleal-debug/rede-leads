import { useState } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { normalizePhoneTo10Digits } from '@/lib/phone';

export function NewLeadDialog({ lead, onClose }: { lead: any; onClose: () => void }) {
  const [form, setForm] = useState<any>({
    name: lead.name || lead.nome || '',
    phone: lead.phone || lead.telefone || '',
    email: lead.email || '',
    servico: lead.servico || '',
    observacao: lead.observacao || lead.rawMessage || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const phoneNorm = normalizePhoneTo10Digits(form.phone || '');
      // use phone-based id to avoid duplicates when possible
      const leadRef = doc(db, 'leads', phoneNorm || lead.id);
      await setDoc(leadRef, {
        nome: form.name,
        telefone: form.phone,
        email: form.email,
        servicoProcurado: form.servico,
        observacao: form.observacao,
        source: 'whatsapp',
        createdAt: serverTimestamp(),
      }, { merge: true });

      // mark new_leads as processed
      try {
        const newRef = doc(db, 'new_leads', lead.id);
        await updateDoc(newRef, { status: 'processed', processedAt: serverTimestamp() });
      } catch (e) {
        // ignore
      }

      onClose();
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white rounded shadow-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold">Editar lead</h4>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-xs">Nome</label>
            <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="text-xs">Telefone</label>
            <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="text-xs">E-mail</label>
            <input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="text-xs">Serviço</label>
            <input value={form.servico} onChange={(e) => setForm({...form, servico: e.target.value})} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="text-xs">Observação</label>
            <textarea value={form.observacao} onChange={(e) => setForm({...form, observacao: e.target.value})} className="w-full border p-2 rounded" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar e finalizar'}</Button>
        </div>
      </div>
    </div>
  );
}

export default NewLeadDialog;
