import React, { useState } from "react";
import type { Campaign, CampaignDailyMetric } from "@/types/commandCenter";
import CampaignDailyModal from "./CampaignDailyModal";
import CampaignFinanceModal from "./CampaignFinanceModal";
import CreateCampaignModal from "./CreateCampaignModal";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

interface Props {
  campaigns: Campaign[];
  clinicId: string;
  ticketMedio: number;
  onAddCampaign: (data: { name: string; dateStart: string; dateEnd: string; budget: number; fundsAdded?: number; taxCost?: number }) => Promise<void>;
  onSaveDailyMetric: (campaignId: string, metric: CampaignDailyMetric) => Promise<void>;
  onDeleteDailyMetric: (campaignId: string, date: string) => Promise<void>;
  onToggleActive: (campaignId: string, active: boolean) => Promise<void>;
  onDeleteCampaign: (campaignId: string) => Promise<void>;
  onSaveCampaignFinance: (campaignId: string, data: { fundsAdded: number; taxCost: number }) => Promise<void>;
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
  const receita = c.completed * ticketMedio;
  const custoReal = c.totalSpend + c.taxCost;
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
            <FunnelHealthBadge score={funnelScore} />
          </div>
        </div>

        {/* Resumo visível no modo recolhido */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {[
            { label: "CPL", value: c.cacLead > 0 ? fmt(c.cacLead) : "—", good: c.cacLead > 0 && c.cacLead < 8 },
            { label: "CAC Agendamento", value: c.cacAgendamento > 0 ? fmt(c.cacAgendamento) : "—", good: c.cacAgendamento > 0 && c.cacAgendamento < 20 },
            { label: "CAC Comparecimento", value: c.cacComparecimento > 0 ? fmt(c.cacComparecimento) : "—", good: c.cacComparecimento > 0 && c.cacComparecimento < 80 },
            { label: "Nota da campanha", value: funnelScore > 0 ? `${funnelScore}/100` : "—", good: funnelScore >= 75 },
          ].map(k => (
            <div key={k.label} style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded p-2 text-center">
              <p style={{ color: "#666", fontSize: "9px" }} className="uppercase tracking-wider mb-1">{k.label}</p>
              <p style={{ color: k.good ? "#10b981" : k.value === "—" ? "#555" : "#f59e0b", fontSize: "12px" }} className="font-bold">{k.value}</p>
            </div>
          ))}
        </div>

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

        {/* Funil rápido */}
        <div className="flex items-center gap-1.5 mb-3" style={{ fontSize: "11px", color: "#999" }}>
          <span>{c.leads} leads</span>
          <span style={{ color: "#444" }}>→</span>
          <span>{c.scheduled} agend.</span>
          <span style={{ color: "#444" }}>→</span>
          <span>{c.completed} compareceu</span>
        </div>

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

  const active = campaigns.filter(c => c.active);
  const paused = campaigns.filter(c => !c.active);
  const totalSpend = campaigns.reduce((a, c) => a + c.totalSpend, 0);
  const totalLeads = campaigns.reduce((a, c) => a + c.leads, 0);
  const totalCompleted = campaigns.reduce((a, c) => a + c.completed, 0);
  const receita = totalCompleted * ticketMedio;
  const totalCompletedRate = totalLeads > 0 ? Math.round((totalCompleted / totalLeads) * 100) : 0;

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
