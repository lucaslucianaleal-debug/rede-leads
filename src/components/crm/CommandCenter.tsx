import React, { useRef, useState, useEffect } from "react";
import type { LayerType, PeriodType } from "@/types/commandCenter";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useOperationalMetrics } from "@/hooks/useOperationalMetrics";
import { useMetaAds } from "@/hooks/useMetaAds";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useActions } from "@/hooks/useActions";
import { useExport } from "@/hooks/useExport";
import Topbar from "./commandcenter/Topbar";
import KPIStrip from "./commandcenter/KPIStrip";
import DiagnosticCard from "./commandcenter/DiagnosticCard";
import FunnelCard from "./commandcenter/FunnelCard";
import CampaignCard from "./commandcenter/CampaignCard";

// Mapear unit IDs para clinic IDs no Firestore
const unitToClinicId: Record<string, string> = {
  olimpia: "odontocompany-olimpia",
  badybassit: "odontocompany-badybassit",
  novohorizonte: "odontocompany-novohorizonte",
  all: "odontocompany-olimpia", // Default para "Toda a rede" — mostra Olimpia por enquanto
};
import ConversationCard from "./commandcenter/ConversationCard";
import HistoryChart from "./commandcenter/HistoryChart";
import AutomationCard from "./commandcenter/AutomationCard";
import UnitsRankingSection from "./commandcenter/UnitsRankingSection";
import PerformanceByChannelCard from "./commandcenter/PerformanceByChannelCard";
import RecentLeadsTable from "./commandcenter/RecentLeadsTable";
import ConsultorRanking from "./commandcenter/ConsultorRanking";

export default function CommandCenter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<LayerType>("ops");
  const [period, setPeriod] = useState<PeriodType>("mes");
  const [unit, setUnit] = useState("all");
  const [ticketMedio, setTicketMedio] = useState(() => {
    try {
      const saved = localStorage.getItem("ticketMedio");
      return saved ? parseInt(saved, 10) : 1800;
    } catch {
      return 1800;
    }
  });
  const [editingTicket, setEditingTicket] = useState(false);
  const [ticketInput, setTicketInput] = useState("1800");

  // Salvar ticket médio no localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ticketMedio", ticketMedio.toString());
      setTicketInput(ticketMedio.toString());
    } catch {
      // Ignorar erros de localStorage
    }
  }, [ticketMedio]);

  const clinicId = unitToClinicId[unit] || "odontocompany-olimpia";
  const { kpis, diagnostics, funnel, history, recentLeads, consultores } = useDashboardData(period, clinicId, ticketMedio);
  const { channels, ranking } = useOperationalMetrics();
  const { campaigns, diagnostics: metaDiagnostics, reload: reloadCampaigns, handleAddCampaign, handleSaveDailyMetric, handleToggleActive } = useMetaAds(unit, clinicId, ticketMedio, period);
  const { messages, kpis: waKpis, diagnostics: waDiagnostics } = useWhatsApp(unit);
  const { execute } = useActions(unit);
  const { exportPDF, exporting } = useExport();

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
          {/* OPERACIONAL - 2 Colunas */}
          {layer === "ops" && (
            <div className="grid grid-cols-3 gap-6">
              {/* COLUNA ESQUERDA */}
              <div className="col-span-2 space-y-6">
                {/* KPI Strip */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest">
                      Pulso {period === "hoje" ? "do dia" : period === "semana" ? "da semana" : "do mês"}
                    </h3>
                    {/* Ticket médio editável */}
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: "#666", fontSize: "11px" }}>Ticket médio:</span>
                      {editingTicket ? (
                        <input
                          type="number"
                          value={ticketInput}
                          onChange={e => setTicketInput(e.target.value)}
                          onBlur={() => {
                            const v = parseInt(ticketInput, 10);
                            if (!isNaN(v) && v > 0) setTicketMedio(v);
                            else setTicketInput(ticketMedio.toString());
                            setEditingTicket(false);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") { setTicketInput(ticketMedio.toString()); setEditingTicket(false); }
                          }}
                          autoFocus
                          style={{ background: "#2a2a2a", border: "1px solid #D4537E", color: "#fff", fontSize: "11px", width: "72px" }}
                          className="px-2 py-0.5 rounded text-right"
                        />
                      ) : (
                        <button
                          onClick={() => { setTicketInput(ticketMedio.toString()); setEditingTicket(true); }}
                          style={{ color: "#D4537E", fontSize: "11px" }}
                          className="font-medium hover:underline"
                          title="Clique para editar o ticket médio"
                        >
                          R$ {ticketMedio.toLocaleString("pt-BR")}
                        </button>
                      )}
                    </div>
                  </div>
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

                {/* Ranking de Captadores */}
                <section>
                  <ConsultorRanking consultores={consultores} period={period} />
                </section>

                {/* Funil */}
                {funnel && (
                  <section>
                    <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest mb-3">
                      Funil de Conversão
                    </h3>
                    <FunnelCard funnel={funnel} period={period} />
                    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="mt-4 rounded-lg p-4">
                      <HistoryChart data={history} />
                    </div>
                  </section>
                )}

                {/* Ranking de Unidades */}
                <section>
                  <UnitsRankingSection units={ranking} />
                </section>

                {/* Performance por Canal */}
                <section>
                  <PerformanceByChannelCard channels={channels} />
                </section>
              </div>

              {/* COLUNA DIREITA */}
              <div className="col-span-1 space-y-6">
                {/* Automações */}
                <section>
                  <AutomationCard />
                </section>

                {/* Leads Recentes */}
                <section>
                  <RecentLeadsTable leads={recentLeads} />
                </section>
              </div>
            </div>
          )}

          {/* META ADS */}
          {layer === "meta" && (
            <div className="space-y-6 max-w-4xl">
              {/* Diagnósticos Meta */}
              {metaDiagnostics.length > 0 && (
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
                <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest mb-3">
                  Campanhas
                </h3>
                <CampaignCard
                  campaigns={campaigns}
                  clinicId={clinicId}
                  ticketMedio={ticketMedio}
                  onAddCampaign={handleAddCampaign}
                  onSaveDailyMetric={handleSaveDailyMetric}
                  onToggleActive={handleToggleActive}
                  onReload={reloadCampaigns}
                />
              </section>
            </div>
          )}

          {/* WHATSAPP */}
          {layer === "wa" && (
            <div className="grid grid-cols-3 gap-6">
              {/* COLUNA ESQUERDA */}
              <div className="col-span-2 space-y-6">
                {/* KPI Strip */}
                <section>
                  <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest mb-3">
                    Métricas WhatsApp
                  </h3>
                  <KPIStrip kpis={waKpis.length > 0 ? waKpis.slice(0, 4) : []} />
                </section>

                {/* Diagnósticos WhatsApp */}
                {waDiagnostics.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest">
                        Diagnóstico WhatsApp
                      </h3>
                      <span style={{ color: "#999" }} className="text-xs">
                        {waDiagnostics.filter(d => d.type === "crit").length} críticos
                      </span>
                    </div>
                    <DiagnosticCard diagnostics={waDiagnostics} onAction={execute} />
                  </section>
                )}

                {/* Conversas */}
                <section>
                  <h3 style={{ color: "#999" }} className="text-xs font-semibold uppercase tracking-widest mb-3">
                    Conversas recentes
                  </h3>
                  <ConversationCard messages={messages} />
                </section>
              </div>

              {/* COLUNA DIREITA */}
              <div className="col-span-1 space-y-6">
                {/* WhatsApp Status */}
                <section style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
                  <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold mb-4">Status Tempo Real</h4>
                  <div className="space-y-3">
                    {[
                      { label: "Pendentes agora", value: "8", color: "#ef4444" },
                      { label: "Respondidas", value: "24", color: "#10b981" },
                      { label: "Automáticas", value: "31", color: "#378ADD" },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between pb-3" style={{ borderBottom: idx < 2 ? "0.5px solid #3a3a3a" : "none" }}>
                        <span style={{ color: "#999", fontSize: "11px" }}>{item.label}</span>
                        <span style={{ color: item.color, fontSize: "13px", fontWeight: "700" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Automações WA */}
                <section>
                  <AutomationCard />
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
