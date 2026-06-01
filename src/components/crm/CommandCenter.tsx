import React, { useRef, useState } from "react";
import type { LayerType, PeriodType } from "@/types/commandCenter";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useMetaAds } from "@/hooks/useMetaAds";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useActions } from "@/hooks/useActions";
import { useExport } from "@/hooks/useExport";
import { useLeads } from "@/hooks/useLeads";
import { MOCK_HISTORY } from "@/data/commandCenterMock";
import Topbar from "./commandcenter/Topbar";
import KPIStrip from "./commandcenter/KPIStrip";
import DiagnosticCard from "./commandcenter/DiagnosticCard";
import FunnelCard from "./commandcenter/FunnelCard";
import CampaignCard from "./commandcenter/CampaignCard";
import ConversationCard from "./commandcenter/ConversationCard";
import HistoryChart from "./commandcenter/HistoryChart";

export default function CommandCenter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<LayerType>("ops");
  const [period, setPeriod] = useState<PeriodType>("hoje");
  const [unit, setUnit] = useState("all");

  const { kpis, diagnostics, funnel } = useDashboardData(period);
  const { campaigns } = useMetaAds(unit);
  const { messages } = useWhatsApp(unit);
  const { execute } = useActions(unit);
  const { exportPDF, exporting } = useExport();
  const { leads } = useLeads();

  const today = new Date();
  const criticalCount = diagnostics.filter(d => d.type === "crit").length;

  const handleExport = () => {
    exportPDF(containerRef as React.RefObject<HTMLElement>, period);
  };

  return (
    <div
      ref={containerRef}
      style={{ background: "#1a1a1a", color: "#fff", minHeight: "100vh" }}
      className="pb-12"
    >
      {/* Topbar */}
      <Topbar
        layer={layer}
        period={period}
        unit={unit}
        criticalCount={criticalCount}
        onLayerChange={setLayer}
        onPeriodChange={setPeriod}
        onUnitChange={setUnit}
        onExportPDF={handleExport}
        exporting={exporting}
      />

      {/* Main content */}
      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* OPERACIONAL */}
          {layer === "ops" && (
            <>
              {/* KPI Strip */}
              <section>
                <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest mb-3">
                  Pulso {period === "hoje" ? "do dia" : period === "semana" ? "da semana" : "do mês"}
                </h3>
                <KPIStrip kpis={kpis} />
              </section>

              {/* Diagnósticos */}
              {diagnostics.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest">
                      Diagnósticos & Ações
                    </h3>
                    {criticalCount > 0 && (
                      <span style={{ color: "#999" }} className="text-xs">
                        {criticalCount} urgentes
                      </span>
                    )}
                  </div>
                  <DiagnosticCard diagnostics={diagnostics} onAction={execute} />
                </section>
              )}

              {/* Funil */}
              {funnel && (
                <section>
                  <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest mb-3">
                    Funil de Conversão
                  </h3>
                  <FunnelCard funnel={funnel} />
                  <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="mt-4 rounded-lg p-4">
                    <HistoryChart data={MOCK_HISTORY} />
                  </div>
                </section>
              )}
            </>
          )}

          {/* META ADS */}
          {layer === "meta" && (
            <section>
              <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest mb-3">
                Campanhas Meta Ads
              </h3>
              <CampaignCard campaigns={campaigns} />
            </section>
          )}

          {/* WHATSAPP */}
          {layer === "wa" && (
            <section>
              <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest mb-3">
                Conversas Recentes
              </h3>
              <ConversationCard messages={messages} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
