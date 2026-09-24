import { useState } from "react";
import { ArrowLeft, CalendarDays, LayoutDashboard, Landmark, MessageCircle, RotateCcw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClinicChip } from "@/components/ClinicChip";
import { ClinicCalendar } from "@/components/crm/ClinicCalendar";
import { ClinicConfirmationCenter } from "@/components/crm/ClinicConfirmationCenter";
import { ClinicFinanceDashboardV3 } from "@/components/crm/ClinicFinanceDashboardV3";
import { ClinicOverview } from "@/components/crm/ClinicOverview";
import { ClinicSalesImportPanel, type SaleItem } from "@/components/crm/ClinicSalesImportPanel";
import { ClinicVacancies } from "@/components/crm/ClinicVacancies";
import { ClinicRebookings } from "@/components/crm/ClinicRebookings";
import { ClinicStatusBridge } from "@/components/crm/ClinicStatusBridge";

type MainSection = "overview" | "agenda" | "finance";
type AgendaView = "calendar" | "confirmations" | "vacancies" | "rebookings";

export default function ClinicConfirmationsPage() {
  const navigate = useNavigate();
  const [mainSection, setMainSection] = useState<MainSection>("overview");
  const [agendaView, setAgendaView] = useState<AgendaView>("calendar");
  const [salesItems, setSalesItems] = useState<SaleItem[]>([]);

  const openAgenda = (view: AgendaView) => {
    setAgendaView(view);
    setMainSection("agenda");
  };

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
                <div className="text-xs text-muted-foreground">Agenda, financeiro e operação da clínica organizados por área</div>
              </div>
            </div>
            <ClinicChip />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <MainNavButton active={mainSection === "overview"} onClick={() => setMainSection("overview")} icon={<LayoutDashboard className="h-4 w-4" />} label="Visão geral" />
            <MainNavButton active={mainSection === "agenda"} onClick={() => setMainSection("agenda")} icon={<CalendarDays className="h-4 w-4" />} label="Agenda" />
            <MainNavButton active={mainSection === "finance"} onClick={() => setMainSection("finance")} icon={<Landmark className="h-4 w-4" />} label="Financeiro" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {mainSection === "overview" && (
          <ClinicOverview
            onOpenAgenda={openAgenda}
            onOpenFinance={() => setMainSection("finance")}
          />
        )}

        {mainSection === "agenda" && (
          <div className="space-y-5">
            <div className="rounded-xl border bg-card p-2">
              <div className="flex flex-wrap gap-2">
                <AgendaNavButton active={agendaView === "calendar"} onClick={() => setAgendaView("calendar")} icon={<CalendarDays className="h-4 w-4" />} label="Calendário" />
                <AgendaNavButton active={agendaView === "confirmations"} onClick={() => setAgendaView("confirmations")} icon={<MessageCircle className="h-4 w-4" />} label="Confirmações" />
                <AgendaNavButton active={agendaView === "vacancies"} onClick={() => setAgendaView("vacancies")} icon={<Search className="h-4 w-4" />} label="Vagas" />
                <AgendaNavButton active={agendaView === "rebookings"} onClick={() => setAgendaView("rebookings")} icon={<RotateCcw className="h-4 w-4" />} label="Reagendamentos" />
              </div>
            </div>

            {agendaView === "calendar" && <ClinicCalendar />}
            {agendaView === "confirmations" && <ClinicConfirmationCenter />}
            {agendaView === "vacancies" && <ClinicVacancies />}
            {agendaView === "rebookings" && <ClinicRebookings />}
          </div>
        )}

        {mainSection === "finance" && (
          <div className="space-y-4">
            <ClinicSalesImportPanel onImported={(items) => setSalesItems(items)} />
            <ClinicFinanceDashboardV3 salesItems={salesItems} />
          </div>
        )}
      </main>
    </div>
  );
}

function MainNavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Button variant={active ? "default" : "ghost"} size="sm" className="gap-2" onClick={onClick}>
      {icon}{label}
    </Button>
  );
}

function AgendaNavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Button variant={active ? "secondary" : "ghost"} size="sm" className="gap-2" onClick={onClick}>
      {icon}{label}
    </Button>
  );
}
