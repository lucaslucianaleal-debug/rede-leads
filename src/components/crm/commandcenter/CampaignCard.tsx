import React, { useState } from "react";
import type { Campaign, CampaignDailyMetric } from "@/types/commandCenter";
import CampaignDailyModal from "./CampaignDailyModal";
import CampaignFinanceModal from "./CampaignFinanceModal";
import CreateCampaignModal from "./CreateCampaignModal";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { buildBudgetAllocationPlan, buildCampaignDecision, buildCampaignPerformance, buildConfidenceContext, buildMarketingMasterStatus, buildMondayActions, buildMonthlyProjection, buildMpcDiagnostic, buildStrategicContext, buildWeeklyRisk } from "@/lib/mpcDecisionEngine";

interface Props {
  campaigns: Campaign[];
  clinicId: string;
  ticketMedio: number;
  onAddCampaign: (data: { name: string; dateStart: string; dateEnd: string; budget: number; dailyBudget?: number; fundsAdded?: number; taxCost?: number }) => Promise<void>;
  onSaveDailyMetric: (campaignId: string, metric: CampaignDailyMetric) => Promise<void>;
  onDeleteDailyMetric: (campaignId: string, date: string) => Promise<void>;
  onToggleActive: (campaignId: string, active: boolean) => Promise<void>;
  onDeleteCampaign: (campaignId: string) => Promise<void>;
  onSaveCampaignFinance: (campaignId: string, data: { fundsAdded: number; taxCost: number; dailyBudget?: number; lastBudgetChangeAt?: string; scaleHistory?: any[] }) => Promise<void>;
  onReload: () => void;
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtN(n: number) {
  return n.toLocaleString("pt-BR");
}

function scoreLowerIsBetter(value: number, target: number) {
  if (value <= 0) return 0;
  if (value <= target) return 100;
  if (value <= target * 1.5) return 70;
  if (value <= target * 2) return 40;
  return 15;
}

function scoreHigherIsBetter(value: number, target: number) {
  if (value <= 0) return 0;
  if (value >= target) return 100;
  if (value >= target * 0.7) return 70;
  if (value >= target * 0.5) return 40;
  return 15;
}

function FunnelHealthBadge({ score }: { score: number }) {
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : score > 0 ? "#ef4444" : "#666";
  const label = score === 0 ? "—" : `${score}`;
  const verdict = score >= 75 ? "✅ Saudável" : score >= 50 ? "⚠️ Atenção" : score > 0 ? "🔴 Crítico" : "Sem dados";
  return (
    <div className="text-right">
      <span style={{ color, fontSize: "18px" }} className="font-bold">{label}</span>
      <p style={{ color: color === "#666" ? "#555" : color, fontSize: "9px" }} className="mt-0.5">{verdict}</p>
    </div>
  );
}

function CampaignBusinessHealth({ campaign, ticketMedio }: { campaign: Campaign; ticketMedio: number }) {
  const receitaPotencial = campaign.completed * ticketMedio;
  const funnelScore = Math.round((
    scoreLowerIsBetter(campaign.cacLead, 8) +
    scoreLowerIsBetter(campaign.cacAgendamento, 20) +
    scoreLowerIsBetter(campaign.cacComparecimento, 80) +
    scoreHigherIsBetter(campaign.conversionRate, 35) +
    scoreHigherIsBetter(campaign.showUpRate, 50)
  ) / 5);

  const stageItems = [
    { label: "CPL", value: campaign.cacLead > 0 ? fmt(campaign.cacLead) : "—", target: "< R$8", ok: campaign.cacLead > 0 && campaign.cacLead <= 8 },
    { label: "Agendamento", value: campaign.cacAgendamento > 0 ? fmt(campaign.cacAgendamento) : "—", target: "< R$20", ok: campaign.cacAgendamento > 0 && campaign.cacAgendamento <= 20 },
    { label: "Comparecimento", value: campaign.cacComparecimento > 0 ? fmt(campaign.cacComparecimento) : "—", target: "< R$80", ok: campaign.cacComparecimento > 0 && campaign.cacComparecimento <= 80 },
    { label: "Conversão", value: campaign.showUpRate > 0 ? `${campaign.showUpRate}%` : "—", target: ">= 50%", ok: campaign.showUpRate >= 50 },
  ];

  const chartData = [...campaign.dailyMetrics]
    .sort((a, b) => {
      const [da, ma, ya] = a.date.split("/").map(Number);
      const [db, mb, yb] = b.date.split("/").map(Number);
      return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
    })
    .map((item) => ({
      date: item.date,
      clicks: item.clicks || 0,
      // CPC = Spend/Cliques quando há cliques; senão mostra o gasto total (pois houve despesa sem retorno)
      cpc: item.clicks > 0 ? Number((item.spend / item.clicks).toFixed(2)) : (item.spend || 0),
    }));

  return (
    <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div>
          <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold uppercase tracking-wider">Saúde do funil</p>
          <p style={{ color: "#666", fontSize: "10px" }}>Lê o custo até virar paciente: lead, agendamento, comparecimento e conversão</p>
        </div>
        <FunnelHealthBadge score={funnelScore} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3 text-[10px]">
        {stageItems.map((item) => (
          <div key={item.label} style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p style={{ color: "#666" }} className="uppercase tracking-wider">{item.label}</p>
              <span style={{ color: item.ok ? "#10b981" : "#f59e0b" }} className="font-semibold">{item.target}</span>
            </div>
            <p style={{ color: item.ok ? "#10b981" : "#fff" }} className="font-semibold">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#666" }} className="uppercase tracking-wider">Receita potencial</p>
          <p style={{ color: "#10b981" }} className="font-semibold">{fmt(receitaPotencial)}</p>
        </div>
        <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#666" }} className="uppercase tracking-wider">Custo total</p>
          <p style={{ color: "#fff" }} className="font-semibold">{fmt(campaign.totalSpend + campaign.taxCost)}</p>
        </div>
        <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
          <p style={{ color: "#666" }} className="uppercase tracking-wider">Conversão para paciente</p>
          <p style={{ color: "#fff" }} className="font-semibold">{campaign.predictability > 0 ? `${campaign.predictability}%` : "—"}</p>
        </div>
      </div>

      <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="mt-3 rounded-lg p-2">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <div>
            <p style={{ color: "#fff", fontSize: "10px" }} className="font-semibold uppercase tracking-wider">Eficiência da campanha</p>
            <p style={{ color: "#666", fontSize: "9px" }}>Correlação: se cliques caem e CPC sobe, a campanha está perdendo eficiência</p>
          </div>
          <span style={{ color: "#888", fontSize: "9px" }} className="uppercase">Últimos dias</span>
        </div>
        <div className="h-[130px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#4a4a4a" opacity={0.45} vertical horizontal />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} axisLine={false} tickLine={false} interval={0} minTickGap={12} />
              <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "#888" }} axisLine={false} tickLine={false} label={{ value: "Cliques", angle: -90, position: "insideLeft", style: { fontSize: 8, fill: "#888" } }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "#888" }} axisLine={false} tickLine={false} label={{ value: "CPC (R$)", angle: 90, position: "insideRight", style: { fontSize: 8, fill: "#888" } }} />
              <Tooltip
                contentStyle={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a", borderRadius: 8, fontSize: "11px" }}
                labelStyle={{ color: "#fff" }}
                formatter={(value: any, name: any) => {
                  if (name === "Cliques") return [fmtN(Number(value)), "Cliques"];
                  if (name === "CPC") return [fmt(Number(value)), "Custo/clique"];
                  return [value, name];
                }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }} />
              <Line yAxisId="left" type="monotone" dataKey="clicks" name="Cliques" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: "#06b6d4" }} activeDot={{ r: 4 }} />
              <Line yAxisId="right" type="monotone" dataKey="cpc" name="CPC" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: "#f59e0b" }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Legenda de siglas */}
        <div className="mt-2 pt-2 border-t border-[#3a3a3a] text-[9px]" style={{ color: "#666" }}>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <span style={{ color: "#06b6d4", fontWeight: "bold" }}>Cliques</span> = número de cliques no anúncio
            </div>
            <div>
              <span style={{ color: "#f59e0b", fontWeight: "bold" }}>CPC</span> = Custo/clique (ou gasto total se sem cliques)
            </div>
          </div>
          <p className="mt-1" style={{ color: "#555" }}>
            ℹ️ Padrão saudável: cliques estáveis e CPC baixo. ⚠️ Se CPC &gt; 0 e cliques = 0, houve gasto sem retorno nesse dia.
          </p>
        </div>
      </div>
    </div>
  );
}

function CampaignRow({ c, ticketMedio, onDailyMetric, onToggle, onFinance, onDelete }: {
  c: Campaign;
  ticketMedio: number;
  onDailyMetric: (c: Campaign, metric?: CampaignDailyMetric) => void;
  onToggle: (c: Campaign) => void;
  onFinance: (c: Campaign) => void;
  onDelete: (c: Campaign) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [decisionExpanded, setDecisionExpanded] = useState(false);
  const receita = c.completed * ticketMedio;
  const custoReal = c.totalSpend + c.taxCost;
  const decision = buildCampaignDecision(c);
  const performance = buildCampaignPerformance(c, ticketMedio);
  const confidenceCtx = buildConfidenceContext(c);
  const funnelScore = Math.round((
    scoreLowerIsBetter(c.cacLead, 8) +
    scoreLowerIsBetter(c.cacAgendamento, 20) +
    scoreLowerIsBetter(c.cacComparecimento, 80) +
    scoreHigherIsBetter(c.conversionRate, 35) +
    scoreHigherIsBetter(c.showUpRate, 50)
  ) / 5);

  const miniChartData = [...c.dailyMetrics]
    .sort((a, b) => {
      const [da, ma, ya] = a.date.split("/").map(Number);
      const [db, mb, yb] = b.date.split("/").map(Number);
      return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
    })
    .slice(-7)
    .map((item) => ({
      date: item.date,
      clicks: item.clicks || 0,
      cpc: item.clicks > 0 ? Number((item.spend / item.clicks).toFixed(2)) : (item.spend || 0),
    }));

  return (
    <div style={{ background: "#1e1e1e", border: `0.5px solid ${c.active ? "#3a3a3a" : "#2a2a2a"}` }} className="rounded-lg overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span style={{ color: c.active ? "#fff" : "#666", fontSize: "13px" }} className="font-semibold truncate">{c.name}</span>
                {!c.active && <span style={{ background: "#333", color: "#666", fontSize: "9px" }} className="px-1.5 py-0.5 rounded uppercase font-bold shrink-0">pausada</span>}
              </div>
              {c.dateStart && <p style={{ color: "#555", fontSize: "10px" }}>{c.dateStart}{c.dateEnd ? ` — ${c.dateEnd}` : ""}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setExpanded(e => !e)} style={{ border: "0.5px solid #3a3a3a", color: "#999", fontSize: "11px" }} className="px-3 py-1.5 rounded hover:bg-[#323232]">
              {expanded ? "▲ Recolher" : "▼ Expandir"}
            </button>
            <span style={{ color: performance.color, fontSize: "11px", border: `0.5px solid ${performance.color}` }} className="px-2 py-1 rounded font-semibold">
              {performance.label}
            </span>
          </div>
        </div>

        {/* Linha 2: Modelo mental simples */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {[
            { label: "Performance", value: `${performance.label}`, color: performance.color },
            { label: "Confianca", value: `${confidenceCtx.label} (${decision.confidencePct}%)`, color: confidenceCtx.color },
            { label: "Decisao MPC", value: decision.action === "escalar_20" ? "Escalar" : decision.action === "otimizar" ? "Otimizar" : decision.action === "pausar" ? "Pausar" : decision.action === "aguardar_dados" ? "Aguardar" : "Manter", color: decision.color },
            { label: "CPL", value: c.cacLead > 0 ? fmt(c.cacLead) : "—", color: c.cacLead > 0 && c.cacLead <= 8 ? "#10b981" : "#d1d5db" },
          ].map(k => (
            <div key={k.label} style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded p-2 text-center">
              <p style={{ color: "#666", fontSize: "9px" }} className="uppercase tracking-wider mb-1">{k.label}</p>
              <p style={{ color: k.color, fontSize: "12px" }} className="font-bold">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Linha 3: Centro de decisao */}
        <div style={{ background: "#1f1f1f", border: `0.5px solid ${decision.color}` }} className="rounded-lg p-3 mb-3">
          <p style={{ color: "#666", fontSize: "9px" }} className="uppercase tracking-wider font-semibold mb-2">Diagnostico Inteligente MPC</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
            <div style={{ background: "#262626", border: "0.5px dashed #3a3a3a" }} className="rounded p-2">
              <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Status</p>
              <p style={{ color: decision.color, fontSize: "11px" }} className="font-semibold">{decision.emoji} {decision.title}</p>
            </div>
            <div style={{ background: "#262626", border: "0.5px dashed #3a3a3a" }} className="rounded p-2">
              <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Proxima acao</p>
              <p style={{ color: "#fff", fontSize: "11px" }} className="font-medium">{decision.action === "escalar_20" ? `Escalar para R$${decision.budgetRecommended.toFixed(0)}/dia` : decision.recommendation}</p>
            </div>
            <div style={{ background: "#262626", border: "0.5px dashed #3a3a3a" }} className="rounded p-2">
              <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Revisar em</p>
              <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">{decision.reviewDate}</p>
            </div>
            <div style={{ background: "#262626", border: "0.5px dashed #3a3a3a" }} className="rounded p-2">
              <p style={{ color: "#777", fontSize: "9px" }} className="uppercase">Confianca</p>
              <p style={{ color: confidenceCtx.color, fontSize: "11px" }} className="font-semibold">{confidenceCtx.emoji} {decision.confidencePct}%</p>
            </div>
          </div>

          {decision.action === "escalar_20" && (
            <div style={{ background: "#262626", border: "0.5px dashed #3a3a3a" }} className="rounded p-2 mb-2">
              <p style={{ color: "#9ca3af", fontSize: "10px" }}>Orcamento atual: R${decision.budgetCurrent.toFixed(0)}/dia</p>
              <p style={{ color: "#fff", fontSize: "10px" }}>Recomendado: R${decision.budgetRecommended.toFixed(0)}/dia</p>
              <p style={{ color: "#9ca3af", fontSize: "10px" }}>Revisar apos +R$50 investidos ou em 3 dias.</p>
            </div>
          )}

          <div style={{ background: "#262626", border: "0.5px dashed #3a3a3a" }} className="rounded p-2 mb-2">
            <p style={{ color: "#9ca3af", fontSize: "10px" }} className="uppercase">Controle da escala</p>
            <p style={{ color: "#d1d5db", fontSize: "10px" }}>Orcamento atual: R${(c.dailyBudget || decision.budgetCurrent).toFixed(0)}/dia</p>
            <p style={{ color: "#d1d5db", fontSize: "10px" }}>Ultima alteracao: {c.lastBudgetChangeAt || "—"}</p>
            <p style={{ color: "#d1d5db", fontSize: "10px" }}>Proxima revisao: apos +R$50 investidos</p>
            <p style={{ color: "#d1d5db", fontSize: "10px" }}>Escalas realizadas: {(c.scaleHistory || []).length}</p>
          </div>

          <button
            type="button"
            onClick={() => setDecisionExpanded((v) => !v)}
            style={{ border: "0.5px solid #3a3a3a", color: "#bbb", fontSize: "10px" }}
            className="px-2 py-1 rounded hover:bg-[#323232]"
          >
            {decisionExpanded ? "▲ Ocultar por que" : "▼ Ver por que"}
          </button>

          {decisionExpanded && (
            <div className="mt-2 space-y-1">
              <div className="mb-1">
                {confidenceCtx.checks.map((check, idx) => (
                  <p key={idx} style={{ color: "#9ca3af", fontSize: "10px" }}>✓ {check}</p>
                ))}
              </div>
              {decision.reasons.map((reason, idx) => (
                <p key={idx} style={{ color: "#cfcfcf", fontSize: "10px" }}>✓ {reason}</p>
              ))}
            </div>
          )}
        </div>

        {/* Linha 4: Grafico */}
        <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-2 mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <p style={{ color: "#666", fontSize: "9px" }} className="uppercase tracking-wider">Mini gráfico (7 dias)</p>
            <p style={{ color: "#555", fontSize: "9px" }}>Cliques x CPC</p>
          </div>
          {miniChartData.length > 0 ? (
            <div className="h-[70px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={miniChartData} margin={{ top: 4, right: 8, left: -26, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#4a4a4a" opacity={0.4} vertical horizontal />
                  <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#777" }} axisLine={false} tickLine={false} interval={0} minTickGap={10} />
                  <YAxis yAxisId="left" hide />
                  <YAxis yAxisId="right" orientation="right" hide />
                  <Tooltip
                    contentStyle={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a", borderRadius: 8, fontSize: "11px" }}
                    labelStyle={{ color: "#fff" }}
                    formatter={(value: any, name: any) => {
                      if (name === "Cliques") return [fmtN(Number(value)), "Cliques"];
                      if (name === "CPC") return [fmt(Number(value)), "CPC"];
                      return [value, name];
                    }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="clicks" name="Cliques" stroke="#06b6d4" strokeWidth={1.75} dot={{ r: 1.5, strokeWidth: 0, fill: "#06b6d4" }} />
                  <Line yAxisId="right" type="monotone" dataKey="cpc" name="CPC" stroke="#f59e0b" strokeWidth={1.75} dot={{ r: 1.5, strokeWidth: 0, fill: "#f59e0b" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ color: "#555", fontSize: "10px" }} className="text-center py-3">Sem métricas para montar o mini gráfico.</p>
          )}
        </div>

        {/* Linha 5: Acoes */}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <button onClick={() => onDailyMetric(c)} style={{ background: "#D4537E", color: "#fff", fontSize: "11px" }} className="px-3 py-1.5 rounded font-medium hover:opacity-90">
            + Métricas do dia
          </button>
          <button onClick={() => onFinance(c)} style={{ border: "0.5px solid #3a3a3a", color: "#999", fontSize: "11px" }} className="px-3 py-1.5 rounded hover:bg-[#323232]">
            Financeiro
          </button>
          <button onClick={() => onToggle(c)} style={{ border: "0.5px solid #3a3a3a", color: c.active ? "#ef4444" : "#10b981", fontSize: "11px" }} className="ml-auto px-3 py-1.5 rounded hover:bg-[#323232]">
            {c.active ? "Pausar" : "Ativar"}
          </button>
          <button
            onClick={() => onDelete(c)}
            style={{ border: "0.5px solid #3a3a3a", color: "#ef4444", fontSize: "11px" }}
            className="px-3 py-1.5 rounded hover:bg-[#323232]"
          >
            Excluir
          </button>
        </div>

        {!expanded && (
          <p style={{ color: "#555", fontSize: "10px" }} className="mt-2">Clique em <strong>Expandir</strong> para ver o funil completo, financeiro detalhado e histórico diário.</p>
        )}

      </div>

      {expanded && (
        <div style={{ borderTop: "0.5px solid #3a3a3a" }} className="p-4">
          {/* Spend vs Budget */}
          {c.budget > 0 && (
            <div className="mb-3">
              <div className="flex justify-between mb-1" style={{ fontSize: "10px", color: "#666" }}>
                <span>Spend: {fmt(c.totalSpend)}</span>
                <span>Budget: {fmt(c.budget)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#333] overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${Math.min(Math.round((c.totalSpend / c.budget) * 100), 100)}%`,
                  background: c.totalSpend / c.budget > 0.9 ? "#ef4444" : c.totalSpend / c.budget > 0.7 ? "#f59e0b" : "#10b981"
                }} />
              </div>
              <p style={{ color: "#555", fontSize: "9px", textAlign: "right", marginTop: "2px" }}>
                {Math.round((c.totalSpend / c.budget) * 100)}% do budget usado
              </p>
            </div>
          )}

          <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3 mb-3 text-xs space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: "#999" }}>Créditos/Fundos adicionados</span>
              <strong style={{ color: "#fff" }}>{fmt(c.fundsAdded)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: "#999" }}>Impostos / taxas</span>
              <strong style={{ color: "#fff" }}>{fmt(c.taxCost)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: "#999" }}>Custo real</span>
              <strong style={{ color: "#fff" }}>{fmt(custoReal)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: "#999" }}>Receita potencial</span>
              <strong style={{ color: "#10b981" }}>{fmt(receita)}</strong>
            </div>
          </div>

          <div className="mb-3">
            {c.dailyMetrics.length > 0 ? (
              <CampaignBusinessHealth campaign={c} ticketMedio={ticketMedio} />
            ) : (
              <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3 text-center">
                <p style={{ color: "#999", fontSize: "11px" }} className="font-medium">Sem gráfico ainda</p>
                <p style={{ color: "#666", fontSize: "10px" }} className="mt-1">Lance métricas diárias para enxergar o funil de negócio da campanha.</p>
              </div>
            )}
          </div>

          <p style={{ color: "#666", fontSize: "10px" }} className="uppercase tracking-wider mb-2">Histórico diário</p>
          {c.dailyMetrics.length > 0 ? (
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-2 pb-1" style={{ borderBottom: "0.5px solid #2a2a2a" }}>
                {["Data", "Spend", "Impressões", "Cliques", "Alcance"].map(h => (
                  <span key={h} style={{ color: "#555", fontSize: "9px" }} className="uppercase">{h}</span>
                ))}
              </div>
              {[...c.dailyMetrics].reverse().map((m, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 items-center">
                  <span style={{ color: "#999", fontSize: "11px" }}>{m.date}</span>
                  <span style={{ color: "#fff", fontSize: "11px" }}>{fmt(m.spend)}</span>
                  <span style={{ color: "#999", fontSize: "11px" }}>{fmtN(m.impressions)}</span>
                  <span style={{ color: "#999", fontSize: "11px" }}>{fmtN(m.clicks)}</span>
                  <span style={{ color: "#999", fontSize: "11px" }}>{fmtN(m.reach)}</span>
                  <button
                    onClick={() => onDailyMetric(c, m)}
                    style={{ background: "#333", color: "#999", fontSize: "9px" }}
                    className="px-2 py-0.5 rounded hover:bg-[#444] col-start-1 col-end-6"
                  >
                    Editar
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-5 gap-2 pt-1" style={{ borderTop: "0.5px solid #2a2a2a" }}>
                <span style={{ color: "#666", fontSize: "10px" }} className="uppercase">Total</span>
                <span style={{ color: "#fff", fontSize: "11px", fontWeight: 600 }}>{fmt(c.totalSpend)}</span>
                <span style={{ color: "#fff", fontSize: "11px", fontWeight: 600 }}>{fmtN(c.totalImpressions)}</span>
                <span style={{ color: "#fff", fontSize: "11px", fontWeight: 600 }}>{fmtN(c.totalClicks)}</span>
                <span style={{ color: "#fff", fontSize: "11px", fontWeight: 600 }}>{fmtN(c.totalReach)}</span>
              </div>
            </div>
          ) : (
            <p style={{ color: "#555", fontSize: "11px" }} className="text-center py-2">Nenhuma métrica registrada. Clique em "Métricas do dia" para começar.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CampaignCard({ campaigns, clinicId, ticketMedio, onAddCampaign, onSaveDailyMetric, onDeleteDailyMetric, onToggleActive, onDeleteCampaign, onSaveCampaignFinance, onReload }: Props) {
  const [dailyModal, setDailyModal] = useState<{ campaign: Campaign; metric?: CampaignDailyMetric } | null>(null);
  const [financeModal, setFinanceModal] = useState<Campaign | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [availableBudget, setAvailableBudget] = useState(300);
  const [completedActions, setCompletedActions] = useState<string[]>([]);

  const active = campaigns.filter(c => c.active);
  const paused = campaigns.filter(c => !c.active);
  const totalSpend = campaigns.reduce((a, c) => a + c.totalSpend, 0);
  const totalLeads = campaigns.reduce((a, c) => a + c.leads, 0);
  const totalCompleted = campaigns.reduce((a, c) => a + c.completed, 0);
  const receita = totalCompleted * ticketMedio;
  const totalCompletedRate = totalLeads > 0 ? Math.round((totalCompleted / totalLeads) * 100) : 0;
  const strategicRanking = active
    .map((c) => ({ campaign: c, ctx: buildStrategicContext(c, ticketMedio) }))
    .sort((a, b) => b.ctx.priorityScore - a.ctx.priorityScore);
  const allocationPlan = buildBudgetAllocationPlan(active, ticketMedio, availableBudget);
  const mondayActions = buildMondayActions(active, ticketMedio);
  const visibleActions = mondayActions.filter((a) => !completedActions.includes(a.id));
  const executedPct = mondayActions.length > 0 ? Math.round(((mondayActions.length - visibleActions.length) / mondayActions.length) * 100) : 0;
  const masterStatus = buildMarketingMasterStatus(active, ticketMedio);
  const weeklyRisk = buildWeeklyRisk(active, ticketMedio);
  const monthlyProjection = buildMonthlyProjection(active, 50);
  const mpcDiagnostic = buildMpcDiagnostic(active, monthlyProjection.targetCompleted);

  const statusChip = (status: "good" | "warn" | "crit") => {
    if (status === "good") return { color: "#10b981", label: "Boa" };
    if (status === "warn") return { color: "#f59e0b", label: "Atencao" };
    return { color: "#ef4444", label: "Critica" };
  };

  const marketingChip = statusChip(mpcDiagnostic.marketingStatus);
  const comercialChip = statusChip(mpcDiagnostic.comercialStatus);
  const operacaoChip = statusChip(mpcDiagnostic.operacaoStatus);

  return (
    <>
      {/* Resumo geral */}
      <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Campanhas Meta Ads</h4>
          <button onClick={() => setShowCreate(true)} style={{ background: "#D4537E", color: "#fff", fontSize: "11px" }} className="px-3 py-1.5 rounded font-medium hover:opacity-90">
            + Nova campanha
          </button>
        </div>
        {campaigns.length > 0 ? (
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: "Spend total", value: fmt(totalSpend), sub: `${active.length} ativa${active.length !== 1 ? "s" : ""}` },
              { label: "Leads captados", value: fmtN(totalLeads), sub: "todas campanhas" },
              { label: "Previsibilidade geral", value: totalCompletedRate > 0 ? `${totalCompletedRate}%` : "—", color: totalCompletedRate >= 40 ? "#10b981" : totalCompletedRate >= 20 ? "#f59e0b" : "#ef4444", sub: "lead → comparecimento" },
              { label: "Receita potencial", value: fmt(receita), color: "#10b981", sub: `${totalCompleted} comparecimentos` },
            ].map(k => (
              <div key={k.label}>
                <p style={{ color: "#666", fontSize: "9px" }} className="uppercase tracking-wider mb-1">{k.label}</p>
                <p style={{ color: (k as any).color || "#fff", fontSize: "14px" }} className="font-bold">{k.value}</p>
                {(k as any).sub && <p style={{ color: "#555", fontSize: "9px" }}>{(k as any).sub}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "#555", fontSize: "12px" }} className="text-center py-1">Nenhuma campanha criada ainda</p>
        )}
      </div>

      {active.length > 0 && (
        <div style={{ background: "#202020", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4 mb-4">
          <p style={{ color: "#777", fontSize: "10px" }} className="uppercase tracking-wider mb-2">Meta do mes</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            <div>
              <p style={{ color: "#fff", fontSize: "18px" }} className="font-bold">Meta Julho: {monthlyProjection.targetCompleted} comparecimentos</p>
              <div className="h-2 rounded-full bg-[#303030] overflow-hidden mt-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(Math.round((monthlyProjection.projectedCompleted / Math.max(monthlyProjection.targetCompleted, 1)) * 100), 100)}%`,
                    background: monthlyProjection.projectedCompleted >= monthlyProjection.targetCompleted ? "#10b981" : "#3b82f6",
                  }}
                />
              </div>
              <p style={{ color: "#9ca3af", fontSize: "11px" }} className="mt-1">{monthlyProjection.projectedCompleted}/{monthlyProjection.targetCompleted} ({Math.round((monthlyProjection.projectedCompleted / Math.max(monthlyProjection.targetCompleted, 1)) * 100)}%)</p>
            </div>
            <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-3">
              <p style={{ color: "#fff", fontSize: "12px" }} className="font-semibold">Previsao: {monthlyProjection.projectedCompleted}</p>
              <p style={{ color: "#9ca3af", fontSize: "11px" }}>Faltam: {monthlyProjection.missing} pacientes</p>
              <p style={{ color: "#10b981", fontSize: "11px" }}>Probabilidade: {monthlyProjection.probability}%</p>
            </div>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div style={{ background: "#202020", border: `0.5px solid ${masterStatus.color}` }} className="rounded-lg p-4 mb-4">
          <p style={{ color: "#777", fontSize: "10px" }} className="uppercase tracking-wider mb-1">Diagnostico MPC</p>
          <p style={{ color: masterStatus.color, fontSize: "22px" }} className="font-bold">{masterStatus.emoji} {masterStatus.label}</p>
          <p style={{ color: "#cfcfcf", fontSize: "12px" }} className="mt-1 mb-3">{masterStatus.reason}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div style={{ background: "#262626", border: `0.5px solid ${marketingChip.color}` }} className="rounded p-2">
              <p style={{ color: "#9ca3af", fontSize: "10px" }}>Marketing</p>
              <p style={{ color: marketingChip.color, fontSize: "12px" }} className="font-semibold">{mpcDiagnostic.marketing}/10 • {marketingChip.label}</p>
            </div>
            <div style={{ background: "#262626", border: `0.5px solid ${comercialChip.color}` }} className="rounded p-2">
              <p style={{ color: "#9ca3af", fontSize: "10px" }}>Comercial</p>
              <p style={{ color: comercialChip.color, fontSize: "12px" }} className="font-semibold">{mpcDiagnostic.comercial}/10 • {comercialChip.label}</p>
            </div>
            <div style={{ background: "#262626", border: `0.5px solid ${operacaoChip.color}` }} className="rounded p-2">
              <p style={{ color: "#9ca3af", fontSize: "10px" }}>Operacao</p>
              <p style={{ color: operacaoChip.color, fontSize: "12px" }} className="font-semibold">{mpcDiagnostic.operacao}/10 • {operacaoChip.label}</p>
            </div>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-4">
          <div style={{ background: "#202020", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3">
            <p style={{ color: "#fff", fontSize: "11px" } } className="font-semibold uppercase tracking-wider mb-2">Prioridade estrategica</p>
            <div className="space-y-2">
              {strategicRanking.slice(0, 3).map(({ campaign, ctx }, idx) => (
                <div key={campaign.id} style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
                  <p style={{ color: "#999", fontSize: "9px" }} className="uppercase">{idx + 1 === 1 ? "Prioridade Alta" : idx + 1 === 2 ? "Prioridade Media" : "Prioridade Baixa"}</p>
                  <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">{campaign.name}</p>
                  <p style={{ color: "#d1d5db", fontSize: "10px" }} className="font-medium">{ctx.why}</p>
                  <p style={{ color: "#9ca3af", fontSize: "10px" }}>CPL {campaign.cacLead > 0 ? fmt(campaign.cacLead) : "—"}</p>
                  <p style={{ color: "#9ca3af", fontSize: "10px" }}>Receita prevista {fmt(ctx.revenuePotential)}</p>
                  <p style={{ color: "#60a5fa", fontSize: "10px" }}>{ctx.shortAction === "Escalar 20%" ? `Escalar para R$${ctx.decision.budgetRecommended.toFixed(0)}/dia` : ctx.shortAction}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#202020", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p style={{ color: "#fff", fontSize: "11px" } } className="font-semibold uppercase tracking-wider">Centro de alocacao de verba</p>
              <div className="flex items-center gap-1">
                <span style={{ color: "#999", fontSize: "10px" }}>R$</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={availableBudget}
                  onChange={(e) => setAvailableBudget(Number(e.target.value || 0))}
                  style={{ background: "#262626", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "11px", width: 90 }}
                  className="rounded px-2 py-1"
                />
              </div>
            </div>

            <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2 mb-2">
              <p style={{ color: "#9ca3af", fontSize: "10px" }}>Verba disponivel: {fmt(availableBudget)}</p>
              <p style={{ color: "#9ca3af", fontSize: "10px" }}>Distribuicao recomendada</p>
            </div>

            <div className="space-y-2">
              {allocationPlan.items.slice(0, 3).map((item) => (
                <div key={item.campaignId} style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
                  <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">{item.campaignName}</p>
                  <p style={{ color: "#10b981", fontSize: "11px" }} className="font-bold">{fmt(item.allocated)} ({availableBudget > 0 ? Math.round((item.allocated / availableBudget) * 100) : 0}%)</p>
                  <p style={{ color: "#aaa", fontSize: "10px" }}>Leads previstos: {item.expectedLeads}</p>
                  <p style={{ color: "#aaa", fontSize: "10px" }}>Comparecimentos previstos: {item.expectedCompleted}</p>
                  <p style={{ color: "#10b981", fontSize: "10px" }}>Retorno esperado: {fmt(item.expectedRevenue)}</p>
                </div>
              ))}
            </div>
            <p style={{ color: "#777", fontSize: "10px" }} className="mt-2">Reserva estrategica: {fmt(allocationPlan.reserve)} ({availableBudget > 0 ? Math.round((allocationPlan.reserve / availableBudget) * 100) : 0}%)</p>
          </div>

          <div style={{ background: "#202020", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3">
            <p style={{ color: "#fff", fontSize: "11px" } } className="font-semibold uppercase tracking-wider mb-2">Segunda-feira</p>
            <div className="space-y-2">
              {visibleActions.map((action, idx) => (
                <div key={`${idx}-${action.id}`} style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded p-2">
                  <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">□ {action.title}</p>
                  <p style={{ color: "#9ca3af", fontSize: "10px" }}>{action.eta}{action.due ? ` • Prazo: ${action.due}` : ""}</p>
                  <p style={{ color: "#9ca3af", fontSize: "10px" }}>Impacto: {action.impact}</p>
                  <div className="mt-1">
                    <button
                      onClick={() => setCompletedActions((prev) => [...prev, action.id])}
                      style={{ border: "0.5px solid #3a3a3a", color: "#d1d5db", fontSize: "10px" }}
                      className="px-2 py-1 rounded hover:bg-[#323232]"
                    >
                      ✓ Concluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ color: executedPct === 100 ? "#10b981" : "#777", fontSize: "10px" } } className="mt-2">Plano executado: {executedPct}%</p>
            <div style={{ background: "#262626", border: `0.5px solid ${weeklyRisk.color}` }} className="rounded p-2 mt-2">
              <p style={{ color: weeklyRisk.color, fontSize: "11px" }} className="font-semibold">Risco da semana: {weeklyRisk.emoji} {weeklyRisk.label}</p>
              <p style={{ color: "#aaa", fontSize: "10px" }}>{weeklyRisk.reason}</p>
              <p style={{ color: "#ef4444", fontSize: "10px" }}>Receita em risco: {fmt(weeklyRisk.potentialRevenueLoss)}</p>
            </div>
            <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" } } className="rounded p-2 mt-2">
              <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold">Probabilidade de bater a meta: {monthlyProjection.probability}%</p>
              <p style={{ color: "#aaa", fontSize: "10px" }}>Ritmo atual: {monthlyProjection.projectedCompleted} comparecimentos.</p>
              <p style={{ color: "#aaa", fontSize: "10px" }}>Meta: {monthlyProjection.targetCompleted} | Faltam: {monthlyProjection.missing}</p>
            </div>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          {active.map(c => (
            <CampaignRow
              key={c.id}
              c={c}
              ticketMedio={ticketMedio}
              onDailyMetric={(campaign, metric) => setDailyModal({ campaign, metric })}
              onToggle={camp => onToggleActive(camp.id, !camp.active)}
              onFinance={camp => setFinanceModal(camp)}
              onDelete={async (camp) => {
                const ok = window.confirm(`Excluir a campanha "${camp.name}"? Esta ação não pode ser desfeita.`);
                if (!ok) return;
                await onDeleteCampaign(camp.id);
                onReload();
              }}
            />
          ))}
        </div>
      )}

      {paused.length > 0 && (
        <div className="space-y-2">
          <p style={{ color: "#555", fontSize: "10px" }} className="uppercase tracking-wider mt-2">Pausadas</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {paused.map(c => (
              <CampaignRow
                key={c.id}
                c={c}
                ticketMedio={ticketMedio}
                onDailyMetric={(campaign, metric) => setDailyModal({ campaign, metric })}
                onToggle={camp => onToggleActive(camp.id, !camp.active)}
                onFinance={camp => setFinanceModal(camp)}
                onDelete={async (camp) => {
                  const ok = window.confirm(`Excluir a campanha "${camp.name}"? Esta ação não pode ser desfeita.`);
                  if (!ok) return;
                  await onDeleteCampaign(camp.id);
                  onReload();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {campaigns.length === 0 && (
        <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-8 text-center">
          <p style={{ color: "#999", fontSize: "13px" }} className="mb-1">Nenhuma campanha cadastrada</p>
          <p style={{ color: "#555", fontSize: "11px" }} className="mb-4">Crie sua primeira campanha para rastrear leads e ROAS</p>
          <button onClick={() => setShowCreate(true)} style={{ background: "#D4537E", color: "#fff", fontSize: "12px" }} className="px-4 py-2 rounded font-medium hover:opacity-90">
            + Criar campanha
          </button>
        </div>
      )}

      {/* Legenda global de siglas */}
      <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3 mb-4">
        <p style={{ color: "#666", fontSize: "9px" }} className="uppercase tracking-wider font-semibold mb-2">📖 Guia de métricas & siglas</p>
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          <div>
            <span style={{ color: "#f59e0b", fontWeight: "bold" }}>CPC</span> — Custo por Clique (gasto ÷ cliques, ou gasto total se 0 cliques)
          </div>
          <div>
            <span style={{ color: "#06b6d4", fontWeight: "bold" }}>CPL</span> — Custo por Lead (Total gasto ÷ Leads captados)
          </div>
          <div>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>CAC Agendamento</span> — Custo para cada agendamento
          </div>
          <div>
            <span style={{ color: "#ef4444", fontWeight: "bold" }}>CAC Comparecimento</span> — Custo até o paciente chegar
          </div>
          <div>
            <span style={{ color: "#8b5cf6", fontWeight: "bold" }}>Conversão</span> — % de leads que agendaram
          </div>
          <div>
            <span style={{ color: "#06b6d4", fontWeight: "bold" }}>Comparecimento</span> — % de agendados que apareceram
          </div>
          <div>
            <span style={{ color: "#3b82f6", fontWeight: "bold" }}>Previsibilidade</span> — % de leads → pacientes (confiabilidade da campanha)
          </div>
          <div>
            <span style={{ color: "#10b981", fontWeight: "bold" }}>Receita Potencial</span> — (Comparecimentos × Ticket médio)
          </div>
        </div>
        <p style={{ color: "#555", fontSize: "8px" }} className="mt-2 pt-2 border-t border-[#3a3a3a]">
          💡 <strong>Lógica do funil:</strong> Lead → Agendamento → Comparecimento → Paciente. Quanto menor o custo em cada etapa, melhor a rentabilidade.
        </p>
      </div>

      {dailyModal && (
        <CampaignDailyModal
          campaign={dailyModal.campaign}
          metric={dailyModal.metric}
          onSave={async (campaignId, metric) => { await onSaveDailyMetric(campaignId, metric); onReload(); }}
          onDelete={async (campaignId, date) => { await onDeleteDailyMetric(campaignId, date); onReload(); }}
          onClose={() => setDailyModal(null)}
        />
      )}
      {financeModal && (
        <CampaignFinanceModal
          campaign={financeModal}
          onSave={async (campaignId, data) => { await onSaveCampaignFinance(campaignId, data); onReload(); }}
          onClose={() => setFinanceModal(null)}
        />
      )}
      {showCreate && (
        <CreateCampaignModal
          clinicId={clinicId}
          onSave={async (data) => { await onAddCampaign(data); onReload(); }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
