import React from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMPCDataStore } from "@/hooks/useMPCDataStore";
import { useMPCDashboardData } from "@/hooks/useMPCDashboardData";
import MPCDashboard from "@/components/crm/MPCDashboard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

const FALLBACK_CLINIC_ID = "odontocompany-olimpia";

export default function MPCToolPage() {
  const { currentClinic } = useAuth();
  const clinicId = currentClinic || FALLBACK_CLINIC_ID;

  const {
    store,
    setStore,
    addDentist,
    updateDentist,
    removeDentist,
    recordAppointment,
    addSurvey,
    saveNow,
    loading,
  } = useMPCDataStore(clinicId);

  const { data, isLoading } = useMPCDashboardData(store);

  const mutations = {
    setStore,
    addDentist,
    updateDentist,
    removeDentist,
    recordAppointment,
    addSurvey,
    saveNow,
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Ferramenta paralela</p>
            <h1 className="text-lg font-semibold text-slate-900">MPC Tool Standalone</h1>
            <p className="text-xs text-slate-500">Clinica ativa: {clinicId}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao CRM
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir CRM em nova aba
              </a>
            </Button>
          </div>
        </div>
      </div>

      <MPCDashboard data={data} isLoading={loading || isLoading} store={store} mutations={mutations} />
    </div>
  );
}
