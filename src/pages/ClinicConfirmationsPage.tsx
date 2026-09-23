import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClinicChip } from "@/components/ClinicChip";
import { ClinicConfirmations } from "@/components/crm/ClinicConfirmations";
import { ClinicStatusBridge } from "@/components/crm/ClinicStatusBridge";

export default function ClinicConfirmationsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <ClinicStatusBridge />
      <header className="sticky top-0 z-50 border-b border-border bg-card/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Voltar ao Rede Leads">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="font-heading text-lg font-bold">Clínica</div>
              <div className="text-xs text-muted-foreground">Agenda e confirmações de consulta</div>
            </div>
          </div>
          <ClinicChip />
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <ClinicConfirmations />
      </main>
    </div>
  );
}
