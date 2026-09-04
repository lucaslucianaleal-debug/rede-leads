import { useState } from "react";
import { BarChart3, BookOpen } from "lucide-react";
import { Lead, LeadStage } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FollowUpOperationsPanel } from "./FollowUpOperationsPanel";
import { FollowUpInsightsPanel } from "./FollowUpInsightsPanel";

interface FollowUpRulerProps {
  leads: Lead[];
  allLeads?: Lead[];
  onSendFollowUp: (leadId: string, observacao?: string, etapa?: LeadStage) => void;
  onRegisterCall?: (leadId: string, outcome: string, obs: string, returnDate?: string, nextStage?: LeadStage) => void;
  onDeleteLead?: (leadId: string) => void;
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void;
}

type InsightsTab = "cadencia" | "metricas";

export function FollowUpRuler(props: FollowUpRulerProps) {
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insightsTab, setInsightsTab] = useState<InsightsTab>("cadencia");
  const allLeads = props.allLeads || props.leads;

  const openInsights = (tab: InsightsTab) => {
    setInsightsTab(tab);
    setInsightsOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => openInsights("cadencia")}>
          <BookOpen className="h-4 w-4 mr-1.5" />
          Cadência
        </Button>
        <Button size="sm" variant="outline" onClick={() => openInsights("metricas")}>
          <BarChart3 className="h-4 w-4 mr-1.5" />
          Métricas
        </Button>
      </div>

      <FollowUpOperationsPanel leads={props.leads} allLeads={props.allLeads} onUpdateLead={props.onUpdateLead} />

      <Dialog open={insightsOpen} onOpenChange={setInsightsOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {insightsTab === "cadencia" ? <BookOpen className="h-5 w-5 text-primary" /> : <BarChart3 className="h-5 w-5 text-primary" />}
              Cadência e métricas da régua
            </DialogTitle>
          </DialogHeader>
          <FollowUpInsightsPanel key={insightsTab} leads={allLeads} initialTab={insightsTab} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
