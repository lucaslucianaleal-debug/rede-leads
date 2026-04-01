import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Lead } from '@/types/crm';
import { Phone, MessageSquare, X } from 'lucide-react';
import NewLeadDialog from './NewLeadDialog';

export function NewLeadsPanel({
  open,
  onClose,
  onCreateLead,
}: {
  open: boolean;
  onClose: () => void;
  onCreateLead?: (lead: Omit<Lead, 'id'>) => void;
}) {
  const { currentClinic } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    if (!open || !currentClinic) return;
    const q = collection(db, 'clinics', currentClinic, 'triagem');
    const unsub = onSnapshot(q, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setLeads(arr);
    });
    return () => unsub();
  }, [open, currentClinic]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-6 bg-black/50">
      <div className="w-full max-w-lg bg-background rounded-xl shadow-lg p-4 mt-12">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">Novos leads via WhatsApp</h3>
            <p className="text-sm text-muted-foreground">{leads.length} aguardando cadastro</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {leads.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhum novo lead aguardando cadastro
            </div>
          ) : (
            leads.map((l) => (
              <div
                key={l.id}
                className="p-3 border rounded-lg flex items-center justify-between hover:bg-muted/50 cursor-pointer"
                onClick={() => setSelected(l)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="font-medium">{l.telefone}</span>
                    <span className="text-xs text-muted-foreground">{l.dataRecebimento}</span>
                  </div>
                  {l.mensagem && (
                    <div className="flex items-center gap-1 mt-1 ml-6">
                      <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground truncate">"{l.mensagem}"</span>
                    </div>
                  )}
                </div>
                <Button size="sm" variant="default" className="ml-3 shrink-0">
                  Cadastrar
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {selected && (
        <NewLeadDialog
          lead={selected}
          clinicId={currentClinic!}
          onClose={() => setSelected(null)}
          onCreateLead={onCreateLead}
        />
      )}
    </div>
  );
}

export default NewLeadsPanel;

