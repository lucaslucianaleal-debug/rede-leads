import React, { useState } from "react";
import type { LayerType, PeriodType } from "@/types/commandCenter";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useLeads } from "@/hooks/useLeads";
import Topbar from "./commandcenter/Topbar";
import KPIStrip from "./commandcenter/KPIStrip";
import OperationalLayer from "./commandcenter/OperationalLayer";
import MetaAdsLayer from "./commandcenter/MetaAdsLayer";
import WhatsAppLayer from "./commandcenter/WhatsAppLayer";

export default function CommandCenter() {
  const [layer, setLayer] = useState<LayerType>("ops");
  const [period, setPeriod] = useState<PeriodType>("hoje");
  const [unit, setUnit] = useState("all");

  const { kpis, diagnostics, funnel, loading } = useDashboardData(layer, period);
  const { leads, ticketAverage } = useLeads();

  // Derived briefing data from real leads
  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  const leadsHoje = leads.filter(l => l.dataCriacao?.startsWith(todayStr.split("/").reverse().join("-")) ||
    (l.dataCriacao && (() => {
      const p = l.dataCriacao.split("/");
      return p.length === 3 && p[0] === String(today.getDate()).padStart(2, "0") && p[1] === String(today.getMonth() + 1).padStart(2, "0");
    })())
  ).length;

  const semResponsavel = leads.filter(l => !l.captador || l.captador.trim() === "").length;
  const followupsPend = leads.filter(l => l.etapaLead?.toLowerCase().includes("follow-up") && l.comparecimento !== "COMPARECEU").length;
  const receitaRecuperavel = followupsPend * (ticketAverage || 120);
  const metaMes = 200;
  const agendadosMes = leads.filter(l => l.dataAgendamento).length;
  const metaPct = Math.round((agendadosMes / metaMes) * 100);

  const criticalCount = diagnostics.filter(d => d.type === "crit").length;

  // Semaphore
  const semaphore =
    criticalCount > 0
      ? { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: "🔴", label: "Ação urgente necessária" }
      : followupsPend > 50
      ? { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: "🟡", label: "Atenção — follow-ups acumulando" }
      : { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: "🟢", label: "No caminho certo" };

  const weekday = today.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = today.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const handleAction = (actionId: string) => {
    console.log("[CommandCenter] action:", actionId);
    // TODO: abrir modal/slide-over correspondente
  };

  return (
    <div className="space-y-4">
      {/* Topbar */}
      <Topbar
        layer={layer}
        period={period}
        unit={unit}
        criticalCount={criticalCount}
        onLayerChange={setLayer}
        onPeriodChange={setPeriod}
        onUnitChange={setUnit}
      />

      {/* ── ZONA 1 — Situação agora ── */}
      <div className={`rounded-xl border p-4 ${semaphore.bg}`}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">ZONA 1 — SITUAÇÃO AGORA</p>
            <h2 className="text-lg font-bold mt-0.5 capitalize">
              Briefing do dia — {weekday}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">Atualizado às {timeStr}</span>
        </div>

        {/* Briefing row */}
        <div className="flex items-center gap-6 flex-wrap">
          <div className="text-center">
            <p className="text-2xl font-bold">{leadsHoje}</p>
            <p className="text-[10px] text-muted-foreground">leads hoje</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${followupsPend > 50 ? "text-amber-400" : "text-foreground"}`}>{followupsPend}</p>
            <p className="text-[10px] text-muted-foreground">follow-ups<br/>pendentes</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${semResponsavel > 100 ? "text-red-400" : "text-foreground"}`}>{semResponsavel}</p>
            <p className="text-[10px] text-muted-foreground">sem<br/>responsável</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${metaPct >= 70 ? "text-emerald-400" : metaPct >= 40 ? "text-amber-400" : "text-red-400"}`}>{metaPct}%</p>
            <p className="text-[10px] text-muted-foreground">meta do mês</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">
              {receitaRecuperavel >= 1000
                ? `R$ ${Math.round(receitaRecuperavel / 1000)}k`
                : `R$ ${receitaRecuperavel.toFixed(0)}`}
            </p>
            <p className="text-[10px] text-muted-foreground">previsão mês</p>
          </div>
        </div>

        {/* Semaphore banner */}
        {semResponsavel > 100 && (
          <div className={`mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${semaphore.bg} border`}>
            <span>{semaphore.icon}</span>
            <span>
              Atenção — {semResponsavel} leads sem dono estão represando{" "}
              <strong>
                {receitaRecuperavel >= 1000
                  ? `R$ ${receitaRecuperavel.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
                  : `R$ ${receitaRecuperavel.toFixed(0)}`}
              </strong>{" "}
              de receita recuperável. Ação hoje.
            </span>
          </div>
        )}
      </div>

      {/* ── ZONA 3 — KPI Strip ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          ZONA 3 — PULSO {period === "hoje" ? "DO DIA" : period === "semana" ? "DA SEMANA" : "DO MÊS"}
        </p>
        <KPIStrip kpis={kpis} loading={loading} />
      </div>

      {/* ── Layer content ── */}
      {layer === "ops" && (
        <OperationalLayer diagnostics={diagnostics} funnel={funnel} onAction={handleAction} />
      )}
      {layer === "meta" && (
        <MetaAdsLayer diagnostics={diagnostics} unit={unit} onAction={handleAction} />
      )}
      {layer === "wa" && (
        <WhatsAppLayer diagnostics={diagnostics} unit={unit} onAction={handleAction} />
      )}
    </div>
  );
}
