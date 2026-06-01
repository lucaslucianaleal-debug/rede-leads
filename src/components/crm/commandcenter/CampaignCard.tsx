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
  onSaveCampaignFinance: (campaignId: string, data: { fundsAdded: number; taxCost: number }) => Promise<void>;
  onReload: () => void;
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtN(n: number) {
  return n.toLocaleString("pt-BR");
}

function CampaignHealthChart({ metrics }: { metrics: CampaignDailyMetric[] }) {
  const chartData = [...metrics]
    .slice()
    .sort((a, b) => {
      const [da, ma, ya] = a.date.split("/").map(Number);
      const [db, mb, yb] = b.date.split("/").map(Number);
      return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
    })
    .map((item) => ({
      date: item.date,
      spend: item.spend,
      clicks: item.clicks,
      ctr: item.impressions > 0 ? Number(((item.clicks / item.impressions) * 100).toFixed(1)) : 0,
    }));

  const half = Math.max(1, Math.floor(chartData.length / 2));
  const firstSlice = chartData.slice(0, half);
  const lastSlice = chartData.slice(-half);
  const firstEfficiency = firstSlice.reduce((acc, item) => acc + item.clicks, 0) / Math.max(firstSlice.reduce((acc, item) => acc + item.spend, 0), 1);
  const lastEfficiency = lastSlice.reduce((acc, item) => acc + item.clicks, 0) / Math.max(lastSlice.reduce((acc, item) => acc + item.spend, 0), 1);
  const variation = firstEfficiency > 0 ? ((lastEfficiency - firstEfficiency) / firstEfficiency) * 100 : 0;
  const status = variation <= -15 ? { label: "Desacelerando", color: "#ef4444" } : variation >= 15 ? { label: "Acelerando", color: "#10b981" } : { label: "Estável", color: "#f59e0b" };

  return (
    <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div>
          <p style={{ color: "#fff", fontSize: "11px" }} className="font-semibold uppercase tracking-wider">Saúde da campanha</p>
          <p style={{ color: "#666", fontSize: "10px" }}>Gasto vs cliques para identificar desaceleração</p>
        </div>
        <span style={{ color: status.color, fontSize: "10px" }} className="font-semibold uppercase">
          {status.label} {variation !== 0 ? `(${variation > 0 ? "+" : ""}${variation.toFixed(0)}%)` : ""}
        </span>
      </div>
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" opacity={0.35} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a", borderRadius: 8 }}
              labelStyle={{ color: "#fff" }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }} />
            <Line yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
            <Line yAxisId="right" type="monotone" dataKey="clicks" name="Cliques" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RoasBadge({ roas }: { roas: number }) {
  const color = roas >= 5 ? "#10b981" : roas >= 2 ? "#f59e0b" : roas > 0 ? "#ef4444" : "#666";
  const label = roas === 0 ? "—" : `${roas.toFixed(1)}x`;
  const verdict = roas >= 5 ? "✅ Vale a pena" : roas >= 2 ? "⚠️ Regular" : roas > 0 ? "🔴 Rever" : "Sem dados";
  return (
    <div className="text-right">
      <span style={{ color, fontSize: "18px" }} className="font-bold">{label}</span>
      <p style={{ color: color === "#666" ? "#555" : color, fontSize: "9px" }} className="mt-0.5">{verdict}</p>
    </div>
  );
}

function CampaignRow({ c, ticketMedio, onDailyMetric, onToggle, onFinance }: {
  c: Campaign;
  ticketMedio: number;
  onDailyMetric: (c: Campaign, metric?: CampaignDailyMetric) => void;
  onToggle: (c: Campaign) => void;
  onFinance: (c: Campaign) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const receita = c.completed * ticketMedio;
  const custoReal = c.totalSpend + c.taxCost;
  const margem = receita - custoReal;

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
          <RoasBadge roas={c.roas} />
        </div>

        {/* KPIs de decisão */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Custo/Lead", value: c.cacLead > 0 ? fmt(c.cacLead) : "—", good: c.cacLead > 0 && c.cacLead <= 50, sub: "ideal: <R$50" },
            { label: "Custo/Agendado", value: c.cacAgendamento > 0 ? fmt(c.cacAgendamento) : "—", good: c.cacAgendamento > 0 && c.cacAgendamento <= 100, sub: "ideal: <R$100" },
            { label: "Custo/Compareceu", value: c.cacComparecimento > 0 ? fmt(c.cacComparecimento) : "—", good: c.cacComparecimento > 0 && c.cacComparecimento <= 200, sub: "ideal: <R$200" },
          ].map(k => (
            <div key={k.label} style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded p-2 text-center">
              <p style={{ color: "#666", fontSize: "9px" }} className="uppercase tracking-wider mb-1">{k.label}</p>
              <p style={{ color: k.good ? "#10b981" : k.value === "—" ? "#555" : "#f59e0b", fontSize: "12px" }} className="font-bold">{k.value}</p>
              <p style={{ color: "#555", fontSize: "9px" }}>{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Funil rápido */}
        <div className="flex items-center gap-1.5 mb-3" style={{ fontSize: "11px", color: "#999" }}>
          <span>{c.leads} leads</span>
          <span style={{ color: "#444" }}>→</span>
          <span>{c.scheduled} agend.</span>
          <span style={{ color: "#444" }}>→</span>
          <span>{c.completed} compareceu</span>
        </div>

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
            <span style={{ color: "#999" }}>Saldo estimado</span>
            <strong style={{ color: margem >= 0 ? "#10b981" : "#ef4444" }}>{fmt(margem)}</strong>
          </div>
        </div>

        <div className="mb-3">
          {c.dailyMetrics.length > 0 ? (
            <CampaignHealthChart metrics={c.dailyMetrics} />
          ) : (
            <div style={{ background: "#262626", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3 text-center">
              <p style={{ color: "#999", fontSize: "11px" }} className="font-medium">Sem gráfico ainda</p>
              <p style={{ color: "#666", fontSize: "10px" }} className="mt-1">Lance métricas diárias para enxergar a saúde da campanha.</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => onDailyMetric(c)} style={{ background: "#D4537E", color: "#fff", fontSize: "11px" }} className="px-3 py-1.5 rounded font-medium hover:opacity-90">
            + Métricas do dia
          </button>
          <button onClick={() => onFinance(c)} style={{ border: "0.5px solid #3a3a3a", color: "#999", fontSize: "11px" }} className="px-3 py-1.5 rounded hover:bg-[#323232]">
            Financeiro
          </button>
          <button onClick={() => setExpanded(e => !e)} style={{ border: "0.5px solid #3a3a3a", color: "#999", fontSize: "11px" }} className="px-3 py-1.5 rounded hover:bg-[#323232]">
            {expanded ? "▲ Fechar" : "▼ Histórico"}
          </button>
          <button onClick={() => onToggle(c)} style={{ border: "0.5px solid #3a3a3a", color: c.active ? "#ef4444" : "#10b981", fontSize: "11px" }} className="ml-auto px-3 py-1.5 rounded hover:bg-[#323232]">
            {c.active ? "Pausar" : "Ativar"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "0.5px solid #3a3a3a" }} className="p-4">
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

export default function CampaignCard({ campaigns, clinicId, ticketMedio, onAddCampaign, onSaveDailyMetric, onDeleteDailyMetric, onToggleActive, onSaveCampaignFinance, onReload }: Props) {
  const [dailyModal, setDailyModal] = useState<{ campaign: Campaign; metric?: CampaignDailyMetric } | null>(null);
  const [financeModal, setFinanceModal] = useState<Campaign | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const active = campaigns.filter(c => c.active);
  const paused = campaigns.filter(c => !c.active);
  const totalSpend = campaigns.reduce((a, c) => a + c.totalSpend, 0);
  const totalTaxCost = campaigns.reduce((a, c) => a + (c.taxCost || 0), 0);
  const totalLeads = campaigns.reduce((a, c) => a + c.leads, 0);
  const totalCompleted = campaigns.reduce((a, c) => a + c.completed, 0);
  const receita = totalCompleted * ticketMedio;
  const custoRealTotal = totalSpend + totalTaxCost;
  const roasGeral = custoRealTotal > 0 ? receita / custoRealTotal : 0;

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
              { label: "ROAS geral", value: roasGeral > 0 ? `${roasGeral.toFixed(1)}x` : "—", color: roasGeral >= 5 ? "#10b981" : roasGeral >= 2 ? "#f59e0b" : "#ef4444" },
              { label: "Receita estimada", value: fmt(receita), color: "#10b981", sub: `${totalCompleted} comparecimentos` },
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
        <div className="space-y-3 mb-3">
          {active.map(c => (
            <CampaignRow key={c.id} c={c} ticketMedio={ticketMedio} onDailyMetric={(campaign, metric) => setDailyModal({ campaign, metric })} onToggle={camp => onToggleActive(camp.id, !camp.active)} onFinance={camp => setFinanceModal(camp)} />
          ))}
        </div>
      )}

      {paused.length > 0 && (
        <div className="space-y-2">
          <p style={{ color: "#555", fontSize: "10px" }} className="uppercase tracking-wider mt-2">Pausadas</p>
          {paused.map(c => (
            <CampaignRow key={c.id} c={c} ticketMedio={ticketMedio} onDailyMetric={(campaign, metric) => setDailyModal({ campaign, metric })} onToggle={camp => onToggleActive(camp.id, !camp.active)} onFinance={camp => setFinanceModal(camp)} />
          ))}
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
