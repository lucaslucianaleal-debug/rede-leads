import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lead } from '@/types/crm';
import { Phone, MessageSquare, Trash2 } from 'lucide-react';
import NewLeadDialog from './NewLeadDialog';
import { motion } from 'framer-motion';

interface NewLeadsTabProps {
  onCreateLead?: (lead: Omit<Lead, 'id'>) => void;
  onCountChange?: (count: number) => void;
}

export function NewLeadsTab({ onCreateLead, onCountChange }: NewLeadsTabProps) {
  const { currentClinic } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    if (!currentClinic) return;
    const q = collection(db, 'clinics', currentClinic, 'triagem');
    const unsub = onSnapshot(q, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!data.convertido) arr.push({ id: d.id, ...data });
      });
      arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setLeads(arr);
      onCountChange?.(arr.length);
    });
    return () => unsub();
  }, [currentClinic]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentClinic) return;
    try {
      await deleteDoc(doc(db, 'clinics', currentClinic, 'triagem', id));
    } catch (err) {
      console.error('Erro ao deletar lead de triagem:', err);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Novos Leads via WhatsApp</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {leads.length} lead{leads.length !== 1 ? 's' : ''} aguardando cadastro
              </p>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground font-medium">Nenhum novo lead</p>
                <p className="text-sm text-muted-foreground">
                  Novos leads aparecerão aqui quando receberem mensagens WhatsApp
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 max-h-[calc(100vh-300px)] overflow-y-auto">
              {leads.map((l, idx) => (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card
                    className="cursor-pointer transition-all hover:shadow-md hover:bg-muted/50"
                    onClick={() => setSelected(l)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Phone className="h-4 w-4 text-green-500 shrink-0" />
                            <span className="font-semibold text-lg">{l.telefone}</span>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                              {l.dataRecebimento}
                            </span>
                          </div>
                          {l.mensagem && (
                            <div className="flex items-start gap-2 mt-2 p-2 bg-muted rounded">
                              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <span className="text-sm text-muted-foreground break-words">
                                "{l.mensagem}"
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="default"
                            className="whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(l);
                            }}
                          >
                            Cadastrar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => handleDelete(l.id, e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
