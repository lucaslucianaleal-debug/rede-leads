import { useState } from "react";
import { ArrowLeft, CalendarDays, MessageCircle, RotateCcw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClinicChip } from "@/components/ClinicChip";
import { ClinicCalendar } from "@/components/crm/ClinicCalendar";
import { ClinicConfirmationCenter } from "@/components/crm/ClinicConfirmationCenter";
import { ClinicVacancies } from "@/components/crm/ClinicVacancies";
import { ClinicRebookings } from "@/components/crm/ClinicRebookings";
import { ClinicStatusBridge } from "@/components/crm/ClinicStatusBridge";
import { ClinicAutomationControl } from "@/components/crm/ClinicAutomationControl";
import { ClinicProfessionalManager } from "@/components/crm/ClinicProfessionalManager";
import { ClinicSyncReconciler } from "@/components/crm/ClinicSyncReconciler";
import { OperationsBell } from "@/components/crm/OperationsBell";

type ClinicView = "calendar" | "confirmations" | "vacancies" | "rebookings";

export default function ClinicConfirmationsPage() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<ClinicView>("calendar");

  return (
    <div className="min-h-screen bg-background">
      <ClinicStatusBridge />
      <ClinicSyncReconciler />
      <header className="sticky top-0 z-50 border-b border-border bg-card/90 backdrop-blur-sm">
        <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Voltar ao Rede Leads">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="font-heading text-lg font-bold">Clínica</div>
                <div className="text-xs text-muted-foreground">Agenda, confirmações, vagas e operação da clínica</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <OperationsBell />
              <ClinicAutomationControl />
              <ClinicProfessionalManager />
              <ClinicChip />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <NavButton active={activeView === "calendar"} onClick={() => setActiveView("calendar")} icon={<CalendarDays className="h-4 w-4" />} label="Calendário" />
            <NavButton active={activeView === "confirmations"} onClick={() => setActiveView("confirmations")} icon={<MessageCircle className="h-4 w-4" />} label="Confirmações" />
            <NavButton active={activeView === "vacancies"} onClick={() => setActiveView("vacancies")} icon={<Search className="h-4 w-4" />} label="Vagas" />
            <NavButton active={activeView === "rebookings"} onClick={() => setActiveView("rebookings")} icon={<RotateCcw className="h-4 w-4" />} label="Reagendamentos" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {activeView === "calendar" && <ClinicCalendar />}
        {activeView === "confirmations" && <ClinicConfirmationCenter />}
        {activeView === "vacancies" && <ClinicVacancies />}
        {activeView === "rebookings" && <ClinicRebookings />}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <Button variant={active ? "default" : "ghost"} size="sm" className="gap-2" onClick={onClick}>{icon}{label}</Button>;
}
