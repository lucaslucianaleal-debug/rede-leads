import { Lead, LeadStage } from "@/types/crm";
import { FollowUpOperationsPanel } from "./FollowUpOperationsPanel";
import { FollowUpRuler as FollowUpRulerLegacy } from "./FollowUpRulerLegacy";

interface FollowUpRulerProps {
  leads: Lead[];
  allLeads?: Lead[];
  onSendFollowUp: (leadId: string, observacao?: string, etapa?: LeadStage) => void;
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string, nextStage?: LeadStage) => void;
  onDeleteLead?: (leadId: string) => void;
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
}

export function FollowUpRuler(props: FollowUpRulerProps) {
  return (
    <div className="space-y-4">
      <FollowUpOperationsPanel leads={props.leads} allLeads={props.allLeads} />

      <details className="rounded-xl border bg-card/60">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
          Cadência, métricas e rotina anterior
        </summary>
        <div className="p-3 pt-0">
          <FollowUpRulerLegacy {...props} />
        </div>
      </details>
    </div>
  );
}
