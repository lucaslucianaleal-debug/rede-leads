import React, { useState } from "react";
import { MPCDashboardData } from "@/types/mpc";
import { useMPCDataStore } from "@/hooks/useMPCDataStore";
import MPCKPIStrip from "./mpc/MPCKPIStrip";
import MPCAlertsFeed from "./mpc/MPCAlertsFeed";
import MPCDentistPerformance from "./mpc/MPCDentistPerformance";
import MPCSectorHealth from "./mpc/MPCSectorHealth";
import MPCWeeklyFocus from "./mpc/MPCWeeklyFocus";
import MPCRecommendedDecisions from "./mpc/MPCRecommendedDecisions";
import MPCDataPanel from "./mpc/MPCDataPanel";

type MPCDashboardProps = {
  data: MPCDashboardData | null;
  isLoading?: boolean;
  clinicId?: string | null;
};

export default function MPCDashboard({ data, isLoading = false, clinicId = null }: MPCDashboardProps) {
  const { store } = useMPCDataStore(clinicId || "demo");
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-slate-600 text-lg animate-pulse">Carregando dashboard...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-slate-600 text-lg">Nenhum dado disponível</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Painel Executivo MPC</h1>
              <p className="text-sm text-slate-500 mt-1">
                Última atualização: {data.generatedAt.toLocaleTimeString("pt-BR")}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    data.metrics.metaGeral >= 85 ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                <span className="text-sm text-slate-600">
                  Meta geral: {Math.round(data.metrics.metaGeral)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 1. Data Input Panel */}
        <section className="mb-8">
          <MPCDataPanel clinicId={clinicId} />
        </section>

        {/* 2. KPI Strip (Resumo Executivo) */}
        <section className="mb-8">
          <MPCKPIStrip metrics={data.metrics} />
        </section>

        {/* 3. Alertas MPC (Área Crítica) */}
        <section className="mb-8">
          <MPCAlertsFeed alerts={data.alerts} />
        </section>

        {/* 4. Performance por Dentista */}
        <section className="mb-8">
          <MPCDentistPerformance dentists={data.dentistPerformance} />
        </section>

        {/* 5. Saúde dos Setores */}
        <section className="mb-8">
          <MPCSectorHealth sectors={data.sectorHealth} />
        </section>

        {/* 6. Foco da Semana + Decisões Recomendadas (Side by side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <section>
            <MPCWeeklyFocus focus={data.weeklyFocus} />
          </section>
          <section>
            <MPCRecommendedDecisions decisions={data.recommendedDecisions} />
          </section>
        </div>
      </div>
    </div>
  );
}