import { useState } from "react";
import { ArrowLeft, CalendarDays, Landmark, MessageCircle, RotateCcw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClinicChip } from "@/components/ClinicChip";
import { ClinicCalendar } from "@/components/crm/ClinicCalendar";
import { ClinicConfirmationCenter } from "@/components/crm/ClinicConfirmationCenter";
import { ClinicFinanceDashboardV2 } from "@/components/crm/ClinicFinanceDashboardV2";
import { ClinicSalesImportPanel, type SaleItem } from "@/components/crm/ClinicSalesImportPanel";
import { ClinicVacancies } from "@/components/crm/ClinicVacancies";
import { ClinicRebookings } from "@/components/crm/ClinicRebookings";
import { ClinicStatusBridge } from "@/components/crm/ClinicStatusBridge";

type ClinicView = "calendar" | "confirmations" | "vacancies" | "rebookings" | "finance";

export default function ClinicConfirmationsPage() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<ClinicView>("calendar");
  const [salesItems, setSalesItems] = useState<SaleItem[]>([]);

  return (
    <div className="min-h-screen bg-background">
      <ClinicStatusBridge />
      <header className="sticky top-0 z-50 border-b border-border bg-card/90 backdrop-blur-sm">
        <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Voltar ao Rede Leads">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="font-heading text-lg font-bold">Clínica</div>
                <div className="text-xs text-muted-foreground">Agenda, confirmações, vagas, financeiro e operação da clínica</div>
              </div>
            </div>
            <ClinicChip />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <NavButton active={activeView === "calendar"} onClick={() => setActiveView("calendar")} icon={<CalendarDays className="h-4 w-4" />} label="Calendário" />
            <NavButton active={activeView === "confirmations"} onClick={() => setActiveView("confirmations")} icon={<MessageCircle className="h-4 w-4" />} label="Confirmações" />
            <NavButton active={activeView === "vacancies"} onClick={() => setActiveView("vacancies")} icon={<Search className="h-4 w-4" />} label="Vagas" />
            <NavButton active={activeView === "rebookings"} onClick={() => setActiveView("rebookings")} icon={<RotateCcw className="h-4 w-4" />} label="Reagendamentos" />
            <NavButton active={activeView === "finance"} onClick={() => setActiveView("finance")} icon={<Landmark className="h-4 w-4" />} label="Financeiro" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {activeView === "calendar" && <ClinicCalendar />}
        {activeView === "confirmations" && <ClinicConfirmationCenter />}
        {activeView === "vacancies" && <ClinicVacancies />}
        {activeView === "rebookings" && <ClinicRebookings />}
        {activeView === "finance" && (
          <div className="space-y-4">
            <ClinicSalesImportPanel onImported={(items) => setSalesItems(items)} />
            <ClinicFinanceDashboardV2 salesItems={salesItems} />
          </div>
        )}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <Button variant={active ? "default" : "ghost"} size="sm" className="gap-2" onClick={onClick}>{icon}{label}</Button>;
}
