import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { normalizePhoneTo10Digits } from '@/lib/phone';
import NewLeadDialog from './NewLeadDialog';

export function NewLeadsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = collection(db, 'new_leads');
    const unsub = onSnapshot(q, (snap) => {
      const arr: any[] = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      arr.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setLeads(arr);
    });
    return () => unsub();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
      <div className="w-full max-w-3xl bg-white rounded shadow-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Novos leads</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {leads.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum novo lead</div>
          ) : (
            <ul className="space-y-2">
              {leads.map(l => (
                <li key={l.id} className="p-2 border rounded flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.name || l.nome || '—'}</div>
                    <div className="text-xs text-muted-foreground">{l.phone || l.telefone || l.rawMessage}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setSelected(l)}>Abrir</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <NewLeadDialog lead={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

export default NewLeadsPanel;
