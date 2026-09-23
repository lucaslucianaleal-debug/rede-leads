import { useState } from "react";
import { ArrowLeft, CalendarDays, MessageCircleCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClinicChip } from "@/components/ClinicChip";
import { ClinicConfirmations } from "@/components/crm/ClinicConfirmations";
import { ClinicCalendar } from "@/components/crm/ClinicCalendar";
import { ClinicStatusBridge } from "@/components/crm/ClinicStatusBridge";

export default function ClinicConfirmationsPage() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<"calendar" | "confirmations">("calendar");

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
                <div className="text-xs text-muted-foreground">Agenda, confirmações e operação da clínica</div>
              </div>
            </div>
            <ClinicChip />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <Button
              variant={activeView === "calendar" ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              onClick={() => setActiveView("calendar")}
            >
              <CalendarDays className="h-4 w-4" />
              Calendário
            </Button>
            <Button
              variant={activeView === "confirmations" ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              onClick={() => setActiveView("confirmations")}
            >
              <MessageCircleCheck className="h-4 w-4" />
              Confirmações de hoje
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {activeView === "calendar" ? <ClinicCalendar /> : <ClinicConfirmations />}
      </main>
    </div>
  );
}
