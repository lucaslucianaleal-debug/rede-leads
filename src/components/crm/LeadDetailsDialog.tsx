import { Lead } from "@/types/crm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { formatPhoneNumber } from "@/lib/phone";

interface LeadDetailsDialogProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (lead: Lead) => void;
}

const statusColor: Record<string, string> = {
  "QUENTE": "bg-destructive/15 text-destructive border-destructive/20",
  "MORNO": "bg-warning/15 text-warning border-warning/20",
  "FRIO": "bg-info/15 text-info border-info/20",
  "": "bg-muted text-muted-foreground border-border",
};

const comparecimentoColor: Record<string, string> = {
  "COMPARECEU": "text-success font-medium",
  "NÃO COMPARECEU": "text-destructive font-medium",
  "AGUARDANDO DATA": "text-warning font-medium",
  "": "text-muted-foreground",
};

export function LeadDetailsDialog({ lead, open, onClose, onEdit }: LeadDetailsDialogProps) {
  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{lead.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Contato */}
          <div>
            <h3 className="font-heading font-semibold text-sm mb-3 text-foreground">Informações de Contato</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Telefone</p>
                <p className="text-sm font-mono font-semibold">{formatPhoneNumber(lead.telefone)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Serviço Procurado</p>
                <p className="text-sm font-medium">{lead.servicoProcurado || "—"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Status e Etapa */}
          <div>
            <h3 className="font-heading font-semibold text-sm mb-3 text-foreground">Status do Lead</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Etapa</p>
                <p className="text-sm font-medium">{lead.etapaLead}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Status</p>
                <Badge variant="outline" className={`badge-stage ${statusColor[lead.status]} w-fit`}>
                  {lead.status || "—"}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Resposta</p>
                <Badge variant={lead.respostaLead === "RESPONDEU" ? "default" : "outline"}>
                  {lead.respostaLead || "—"}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Comparecimento</p>
                <p className={`text-sm ${comparecimentoColor[lead.comparecimento] || comparecimentoColor[""]}`}>
                  {lead.comparecimento || "—"}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Datas */}
          <div>
            <h3 className="font-heading font-semibold text-sm mb-3 text-foreground">Datas Importantes</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Data de Criação</p>
                <p className="text-sm font-medium">{lead.dataCriacao}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Data de Contato</p>
                <p className="text-sm font-medium">{lead.dataContato || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Próximo Follow-up</p>
                <p className="text-sm font-medium">{lead.dataFollowUp || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Data de Agendamento</p>
                <p className="text-sm font-medium">{lead.dataAgendamento || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Retorno de Ligação</p>
                <p className="text-sm font-medium">{lead.dataRetornoLigacao || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Follow-up Count</p>
                <p className="text-sm font-medium">{lead.followUpCount}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Origem */}
          <div>
            <h3 className="font-heading font-semibold text-sm mb-3 text-foreground">Origem e Proprietário</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Fonte do Lead</p>
                <p className="text-sm font-medium">{lead.fonteLead}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Captador</p>
                <p className="text-sm font-medium">{lead.captador || "—"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Observações */}
          {lead.observacao && (
            <div>
              <h3 className="font-heading font-semibold text-sm mb-2 text-foreground">Observações</h3>
              <div className="bg-muted/50 rounded-lg p-3 border border-border">
                <p className="text-xs whitespace-pre-wrap text-foreground">{lead.observacao}</p>
              </div>
            </div>
          )}

          {/* Lembretes */}
          {(lead.lembretes.h24 || lead.lembretes.today) && (
            <div>
              <h3 className="font-heading font-semibold text-sm mb-2 text-foreground">Lembretes Ativados</h3>
              <div className="flex gap-2">
                {lead.lembretes.h24 && <Badge variant="secondary">Lembrete 24h</Badge>}
                {lead.lembretes.today && <Badge variant="secondary">Lembrete Hoje</Badge>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {onEdit && (
            <Button onClick={() => {
              onEdit(lead);
              onClose();
            }} className="mr-auto">
              Editar Lead
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
