import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, LayoutDashboard, Landmark, MessageCircle, RotateCcw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClinicChip } from "@/components/ClinicChip";
import { ClinicCalendar } from "@/components/crm/ClinicCalendar";
import { ClinicConfirmationCenter } from "@/components/crm/ClinicConfirmationCenter";
import { ClinicFinanceDashboardV4 } from "@/components/crm/ClinicFinanceDashboardV4";
import { ClinicFinanceRecoveryCenter } from "@/components/crm/ClinicFinanceRecoveryCenter";
import { ClinicFinanceStateGuard } from "@/components/crm/ClinicFinanceStateGuard";
import { ClinicOverviewV2 } from "@/components/crm/ClinicOverviewV2";
import { ClinicSalesImportPanel, type SaleItem } from "@/components/crm/ClinicSalesImportPanel";
import { ClinicVacancies } from "@/components/crm/ClinicVacancies";
import { ClinicRebookings } from "@/components/crm/ClinicRebookings";
import { ClinicStatusBridge } from "@/components/crm/ClinicStatusBridge";
import { useAuth } from "@/hooks/useAuth";

type MainSection = "overview" | "agenda" | "finance";
type AgendaView = "calendar" | "confirmations" | "vacancies" | "rebookings";

function primaryClinicFromProfile(profile: any): string | null {
  if (!profile) return null;
  if (typeof profile.clinicId === "string" && profile.clinicId.trim()) return profile.clinicId.trim();
  const candidates = [
    ...(Array.isArray(profile.clinicIds) ? profile.clinicIds : []),
    ...(Array.isArray(profile.clinics) ? profile.clinics : []),
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return candidates[0]?.trim() || null;
}

export default function ClinicConfirmationsPage() {
  const navigate = useNavigate();
  const { currentClinic, userProfile, setSelectedClinic } = useAuth();
  const [mainSection, setMainSection] = useState<MainSection>("overview");
  const [agendaView, setAgendaView] = useState<AgendaView>("calendar");
  const [salesItems, setSalesItems] = useState<SaleItem[]>([]);

  useEffect(() => {
    if (currentClinic || !userProfile) return;
    const primaryClinic = primaryClinicFromProfile(userProfile);
    if (primaryClinic) setSelectedClinic(primaryClinic);
  }, [currentClinic, setSelectedClinic, userProfile]);

  const openAgenda = (view: AgendaView) => {
    setAgendaView(view);
    setMainSection("agenda");
  };

  return (
    <div className="min-h-screen bg-background">
      <ClinicStatusBridge />
      <ClinicFinanceStateGuard />
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
        {!currentClinic && userProfile && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Recuperando a clínica vinculada ao seu perfil…
          </div>
        )}

        {mainSection === "overview" && (
          <ClinicOverviewV2
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
            <ClinicFinanceRecoveryCenter salesItems={salesItems} />
            <ClinicFinanceDashboardV4 salesItems={salesItems} />
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
