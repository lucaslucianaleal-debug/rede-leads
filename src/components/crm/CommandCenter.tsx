import React, { useRef, useState, useEffect } from "react";
import type { LayerType, PeriodType } from "@/types/commandCenter";
import { useMetaAds } from "@/hooks/useMetaAds";
import { useMetaFinance } from "@/hooks/useMetaFinance";
import { useActions } from "@/hooks/useActions";
import { useExport } from "@/hooks/useExport";
import { useAuth } from "@/hooks/useAuth";
import Topbar from "./commandcenter/Topbar";
import DiagnosticCard from "./commandcenter/DiagnosticCard";
import CampaignCard from "./commandcenter/CampaignCard";
import MetaFinanceCard from "./commandcenter/MetaFinanceCard";

// Mapear unit IDs para clinic IDs no Firestore
const unitToClinicId: Record<string, string> = {
  olimpia: "odontocompany-olimpia",
  badybassit: "odontocompany-badybassit",
  novohorizonte: "odontocompany-novohorizonte",
};
export default function CommandCenter() {
  const { currentClinic, clinicMeta } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<LayerType>("meta");
  const [period, setPeriod] = useState<PeriodType>("operacao");
  const [unit, setUnit] = useState("all");
  const [ticketMedio, setTicketMedio] = useState(() => {
    try {
      const saved = localStorage.getItem("ticketMedio");
      return saved ? parseInt(saved, 10) : 1800;
    } catch {
      return 1800;
    }
  });
  // Salvar ticket médio no localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ticketMedio", ticketMedio.toString());
    } catch {
      // Ignorar erros de localStorage
    }
  }, [ticketMedio]);

  const clinicId =
    unit === "all"
      ? (currentClinic || "odontocompany-olimpia")
      : (unitToClinicId[unit] || currentClinic || "odontocompany-olimpia");
  const {
    campaigns,
    diagnostics: metaDiagnostics,
    reload: reloadCampaigns,
    handleAddCampaign,
    handleSaveDailyMetric,
    handleDeleteDailyMetric,
    handleSaveCampaignFinance,
    handleToggleActive,
    handleDeleteCampaign,
    handleSyncMetaAds,
    metaSyncing,
  } = useMetaAds(unit, clinicId, ticketMedio, period);
  const { metaFinance, metaFinanceLoading, refreshMetaFinance } = useMetaFinance(clinicId);
  const { execute } = useActions(unit);
  const { exportPDF, exporting } = useExport();

  const criticalCount = metaDiagnostics.filter(d => d.type === "crit").length
    + (metaFinance?.financial?.alertLevel === "critical" ? 1 : 0);

  const handleExport = () => {
    exportPDF(containerRef as React.RefObject<HTMLElement>, period);
  };

  const handleSyncMetaAndFinance = async () => {
    try {
      await handleSyncMetaAds();
    } finally {
      await refreshMetaFinance();
    }
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
        brandName={clinicMeta?.name || (currentClinic ? "Rede Leads" : "Rede Leads")}
        onLayerChange={setLayer}
        onPeriodChange={setPeriod}
        onUnitChange={setUnit}
        onExportPDF={handleExport}
        exporting={exporting}
      />

      {/* Main content */}
      <div className="px-3 sm:px-4 md:px-6 py-4 md:py-6">
        <div className="w-full max-w-[1600px] mx-auto space-y-4 md:space-y-6">
          {/* META ADS */}
          {layer === "meta" && (
            <div className="space-y-6">
              {/* Diagnósticos Meta */}
              {period !== "operacao" && metaDiagnostics.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest">
                      Diagnósticos
                    </h3>
                    <span style={{ color: "#999" }} className="text-xs">
                      {metaDiagnostics.filter(d => d.type === "crit").length} urgentes
                    </span>
                  </div>
                  <DiagnosticCard diagnostics={metaDiagnostics} onAction={execute} />
                </section>
              )}

              {/* Campanhas */}
              <section>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest">
                    {period === "operacao" ? "Execução" : period === "ciclo" ? "Ciclo Atual" : "Histórico"}
                  </h3>
                  <button
                    type="button"
                    onClick={handleSyncMetaAndFinance}
                    disabled={metaSyncing}
                    style={{
                      background: metaSyncing ? "#333" : "#134D48",
                      border: "0.5px solid #1FB6A6",
                      color: metaSyncing ? "#888" : "#1FB6A6",
                      fontSize: "11px",
                    }}
                    className="px-3 py-1.5 rounded font-medium hover:opacity-90 disabled:cursor-not-allowed"
                  >
                    {metaSyncing ? "Sincronizando Meta..." : "↻ Sincronizar Meta"}
                  </button>
                </div>
                <MetaFinanceCard status={metaFinance} loading={metaFinanceLoading} />
                <CampaignCard
                  campaigns={campaigns}
                  clinicId={clinicId}
                  ticketMedio={ticketMedio}
                  period={period}
                  onAddCampaign={handleAddCampaign}
                  onSaveDailyMetric={handleSaveDailyMetric}
                  onDeleteDailyMetric={handleDeleteDailyMetric}
                  onToggleActive={handleToggleActive}
                  onDeleteCampaign={handleDeleteCampaign}
                  onSaveCampaignFinance={handleSaveCampaignFinance}
                  onReload={reloadCampaigns}
                />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
