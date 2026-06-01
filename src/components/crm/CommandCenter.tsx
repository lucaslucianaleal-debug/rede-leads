import React, { useRef, useState } from "react";
import type { PeriodType } from "@/types/commandCenter";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useMetaAds } from "@/hooks/useMetaAds";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import { useActions } from "@/hooks/useActions";
import { useExport } from "@/hooks/useExport";
import { useLeads } from "@/hooks/useLeads";
import { MOCK_HISTORY, MOCK_AUTOMATIONS, MOCK_UNITS } from "@/data/commandCenterMock";
import Topbar from "./commandcenter/Topbar";
import KPIStrip from "./commandcenter/KPIStrip";
import DiagnosticCard from "./commandcenter/DiagnosticCard";
import FunnelCard from "./commandcenter/FunnelCard";
import CampaignCard from "./commandcenter/CampaignCard";
import ConversationCard from "./commandcenter/ConversationCard";
import HistoryChart from "./commandcenter/HistoryChart";

// ─── AutomationsSection — inline (needs action integration) ──────────────────
function AutomationsSection({ unitId }: { unitId: string }) {
  const { execute, isLoading } = useActions(unitId);
  const [automations, setAutomations] = React.useState(MOCK_AUTOMATIONS);

  const toggle = async (id: string) => {
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, on: !a.on } : a));
    await execute("toggleAutomation");
  };

  return (
    <section>
      <SectionHeader title="Automações" meta={`${automations.filter(a => a.on).length}/${automations.length} ativas`} />
      <div className="rounded-xl border border-border/50 bg-card p-4">
        <div className="space-y-2">
          {automations.map(a => (
            <div
              key={a.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${a.on ? "border-emerald-500/20 bg-emerald-500/5" : "border-border/30 bg-muted/10"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{a.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${a.impactType === "positive" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"}`}>
                    {a.impact}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{a.description}</p>
              </div>
              <button
                onClick={() => toggle(a.id)}
                disabled={isLoading("toggleAutomation")}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${a.on ? "bg-emerald-500" : "bg-muted"}`}
                aria-label={a.on ? "Desativar" : "Ativar"}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${a.on ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── UnitsRankingSection ──────────────────────────────────────────────────────
const UNITS_RANK = [
  { name: "Catanduva", leads: 132, comparecimento: 52, meta: 50 },
  { name: "Olímpia", leads: 98, comparecimento: 44, meta: 50 },
  { name: "Votuporanga", leads: 87, comparecimento: 41, meta: 50 },
  { name: "Novo Horizonte", leads: 111, comparecimento: 38, meta: 50 },
];

function UnitsRankingSection() {
  const [sortBy, setSortBy] = useState<"leads" | "comparecimento">("comparecimento");
  const sorted = [...UNITS_RANK].sort((a, b) => b[sortBy] - a[sortBy]);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Ranking de unidades</h3>
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setSortBy("comparecimento")}
            className={`px-2 py-0.5 rounded ${sortBy === "comparecimento" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            % comp.
          </button>
          <button
            onClick={() => setSortBy("leads")}
            className={`px-2 py-0.5 rounded ${sortBy === "leads" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            leads
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        {sorted.map((u, i) => {
          const pct = u.comparecimento;
          const ok = pct >= u.meta;
          return (
            <div key={u.name} className={`flex items-center gap-3 px-4 py-3 ${i < sorted.length - 1 ? "border-b border-border/30" : ""}`}>
              <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
              <span className="text-sm font-medium flex-1">{u.name}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{u.leads} leads</span>
                <span className={`font-bold ${ok ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-red-400"}`}>
                  {pct}% comp. {ok ? "✅" : "⚠️"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Small helper ─────────────────────────────────────────────────────────────
function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
    </div>
  );
}

// ─── CommandCenter ─────────────────────────────────────────────────────────────
export default function CommandCenter() {
  const [period, setPeriod] = useState<PeriodType>("hoje");
  const [unit, setUnit] = useState("all");
  const containerRef = useRef<HTMLDivElement>(null);

  const { kpis, diagnostics, funnel, loading } = useDashboardData(period);
  const { campaigns } = useMetaAds(unit);
  const { messages, metrics } = useWhatsApp(unit);
  const { execute, isLoading, resultFor } = useActions(unit);
  const { exportPDF, exporting } = useExport();
  const { leads, ticketAverage } = useLeads();

  // Semaphore / Briefing computed from real leads
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  const leadsHoje = leads.filter(l => {
    if (!l.dataCriacao) return false;
    const p = l.dataCriacao.split("/");
    return p.length === 3 && p[0] === String(today.getDate()).padStart(2, "0") && p[1] === String(today.getMonth() + 1).padStart(2, "0");
  }).length;

  const semResponsavel = leads.filter(l => !l.captador || l.captador.trim() === "").length;
  const followupsPend = leads.filter(l => l.etapaLead?.toLowerCase().includes("follow-up") && l.comparecimento !== "COMPARECEU").length;
  const receitaRecuperavel = followupsPend * (ticketAverage || 120);
  const agendadosMes = leads.filter(l => l.dataAgendamento).length;
  const metaPct = Math.round((agendadosMes / 200) * 100);

  const criticalCount = diagnostics.filter(d => d.type === "crit").length;

  const semaphore =
    criticalCount > 0
      ? { bg: "bg-red-500/10 border-red-500/20", icon: "🔴", label: "Ação urgente necessária" }
      : followupsPend > 50
      ? { bg: "bg-amber-500/10 border-amber-500/20", icon: "🟡", label: "Atenção — follow-ups acumulando" }
      : { bg: "bg-emerald-500/10 border-emerald-500/20", icon: "🟢", label: "No caminho certo" };

  const weekday = today.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const timeStr = today.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // WhatsApp filter tabs state
  const [waFilter, setWaFilter] = useState<"all" | "pending" | "responded">("all");
  const filteredMessages = waFilter === "all" ? messages
    : waFilter === "pending" ? messages.filter(m => m.status === "pending")
    : messages.filter(m => m.status === "responded");

  const handleAction = async (actionId: string) => {
    await execute(actionId);
  };

  const handleExport = () => {
    exportPDF(containerRef as React.RefObject<HTMLElement>, period);
  };

  return (
    <div ref={containerRef} className="space-y-6 pb-12">
      {/* TOPBAR */}
      <Topbar
        period={period}
        unit={unit}
        criticalCount={criticalCount}
        onPeriodChange={setPeriod}
        onUnitChange={setUnit}
        onExportPDF={handleExport}
        exporting={exporting}
      />

      {/* ── ZONA 1 — Briefing / Semáforo ── */}
      <section>
        <SectionHeader title={`Briefing do dia — ${weekday}`} meta={`Atualizado às ${timeStr}`} />
        <div className={`rounded-xl border p-4 ${semaphore.bg}`}>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <p className="text-2xl font-bold">{leadsHoje}</p>
              <p className="text-[10px] text-muted-foreground">leads hoje</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${followupsPend > 50 ? "text-amber-400" : ""}`}>{followupsPend}</p>
              <p className="text-[10px] text-muted-foreground">follow-ups pend.</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${semResponsavel > 100 ? "text-red-400" : ""}`}>{semResponsavel}</p>
              <p className="text-[10px] text-muted-foreground">sem responsável</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${metaPct >= 70 ? "text-emerald-400" : metaPct >= 40 ? "text-amber-400" : "text-red-400"}`}>{metaPct}%</p>
              <p className="text-[10px] text-muted-foreground">meta do mês</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">
                {receitaRecuperavel >= 1000 ? `R$ ${Math.round(receitaRecuperavel / 1000)}k` : `R$ ${Math.round(receitaRecuperavel)}`}
              </p>
              <p className="text-[10px] text-muted-foreground">previsão mês</p>
            </div>
          </div>
          {semResponsavel > 100 && (
            <div className={`mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${semaphore.bg} border`}>
              <span>{semaphore.icon}</span>
              <span>
                {semResponsavel} leads sem dono represando{" "}
                <strong>R$ {receitaRecuperavel.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</strong> de receita. Ação hoje.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ── KPI BRIEFING — 4 cards ── */}
      <section>
        <SectionHeader title={`Pulso ${period === "hoje" ? "do dia" : period === "semana" ? "da semana" : "do mês"}`} />
        <KPIStrip kpis={kpis} loading={loading} />
      </section>

      {/* ── DIAGNÓSTICOS ── */}
      <section>
        <SectionHeader title="Diagnósticos & ações" meta={`${criticalCount} urgentes`} />
        <div className="space-y-2">
          {diagnostics.map((d, i) => {
            const result = d.actionId ? resultFor(d.actionId) : null;
            return (
              <div key={i}>
                <DiagnosticCard
                  diagnostics={[d]}
                  onAction={handleAction}
                />
                {result && (
                  <div className={`mt-1 ml-3 text-xs px-3 py-1.5 rounded-lg border ${result.success ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                    {result.success ? "✅" : "❌"} {result.message}
                  </div>
                )}
                {d.actionId && isLoading(d.actionId) && (
                  <div className="mt-1 ml-3 text-xs px-3 py-1.5 rounded-lg border border-border/30 text-muted-foreground">
                    ⏳ Executando...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── FUNIL + HISTÓRICO ── */}
      <section>
        <SectionHeader title="Funil de conversão" />
        {funnel && <FunnelCard funnel={funnel} />}
        <div className="mt-4 rounded-xl border border-border/50 bg-card p-4">
          <HistoryChart data={MOCK_HISTORY} />
        </div>
      </section>

      {/* ── META ADS ── */}
      <section>
        <SectionHeader title="Campanhas Meta Ads" meta="últimos 7 dias" />
        <CampaignCard campaigns={campaigns} />
      </section>

      {/* ── WHATSAPP ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">WhatsApp</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{metrics?.avgResponseTime ?? "—"}min resp.</span>
            <span className="text-red-400">{messages.filter(m => m.status === "pending").length} aguardando</span>
          </div>
        </div>
        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-2">
          {(["all", "pending", "responded"] as const).map(f => (
            <button
              key={f}
              onClick={() => setWaFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${waFilter === f ? "bg-foreground/10 border-foreground/20" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              {f === "all" ? "Todos" : f === "pending" ? "Aguardando" : "Respondidos"}
              {f === "pending" && messages.filter(m => m.status === "pending").length > 0 && (
                <span className="ml-1.5 px-1 py-0 rounded-full bg-red-500 text-white text-[9px]">
                  {messages.filter(m => m.status === "pending").length}
                </span>
              )}
            </button>
          ))}
        </div>
        <ConversationCard messages={filteredMessages} />
      </section>

      {/* ── AUTOMAÇÕES ── */}
      <AutomationsSection unitId={unit} />

      {/* ── RANKING DE UNIDADES ── */}
      <UnitsRankingSection />
    </div>
  );
}
