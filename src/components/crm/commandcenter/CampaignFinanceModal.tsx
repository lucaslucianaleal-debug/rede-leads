import React, { useEffect, useState } from "react";
import type { Campaign, CampaignScaleEvent } from "@/types/commandCenter";

interface Props {
  campaign: Campaign;
  onSave: (campaignId: string, data: { fundsAdded: number; taxCost: number; dailyBudget?: number; lastBudgetChangeAt?: string; scaleHistory?: CampaignScaleEvent[] }) => Promise<void>;
  onClose: () => void;
}

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function moneyToNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  return parseFloat(normalized) || 0;
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function CampaignFinanceModal({ campaign, onSave, onClose }: Props) {
  const [fundsAdded, setFundsAdded] = useState(campaign.fundsAdded.toString());
  const [taxCost, setTaxCost] = useState(campaign.taxCost.toString());
  const [dailyBudget, setDailyBudget] = useState(String(campaign.dailyBudget || 15));
  const [registerScale, setRegisterScale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setFundsAdded(campaign.fundsAdded.toString());
    setTaxCost(campaign.taxCost.toString());
    setDailyBudget(String(campaign.dailyBudget || 15));
    setRegisterScale(false);
  }, [campaign]);

  const realCost = campaign.totalSpend + moneyToNumber(taxCost);
  const balance = moneyToNumber(fundsAdded) - realCost;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const nextDailyBudget = moneyToNumber(dailyBudget);
      const prevDailyBudget = campaign.dailyBudget || 15;
      const didChangeBudget = nextDailyBudget > 0 && Math.abs(nextDailyBudget - prevDailyBudget) > 0.001;
      const shouldRegisterScale = registerScale || didChangeBudget;
      const nextScaleHistory = shouldRegisterScale
        ? [
            ...(campaign.scaleHistory || []),
            {
              date: todayStr(),
              fromDailyBudget: prevDailyBudget,
              toDailyBudget: nextDailyBudget,
              note: didChangeBudget ? "Ajuste manual de orcamento diario" : "Confirmacao de escala",
            },
          ]
        : (campaign.scaleHistory || []);

      await onSave(campaign.id, {
        fundsAdded: moneyToNumber(fundsAdded),
        taxCost: moneyToNumber(taxCost),
        dailyBudget: nextDailyBudget > 0 ? nextDailyBudget : prevDailyBudget,
        lastBudgetChangeAt: shouldRegisterScale ? todayStr() : (campaign.lastBudgetChangeAt || ""),
        scaleHistory: nextScaleHistory,
      });
      onClose();
    } catch {
      setError("Erro ao salvar financeiro. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a", width: "100%", maxWidth: "440px" }} className="rounded-xl p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 style={{ color: "#fff", fontSize: "14px" }} className="font-semibold">Financeiro da campanha</h3>
            <p style={{ color: "#999", fontSize: "11px" }} className="mt-0.5">{campaign.name}</p>
          </div>
          <button onClick={onClose} style={{ color: "#666" }} className="text-xl leading-none hover:text-white">×</button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label style={{ color: "#999", fontSize: "11px" }} className="block mb-1.5 uppercase tracking-wider">Fundos adicionados (R$)</label>
            <input
              type="number"
              placeholder="0"
              value={fundsAdded}
              onChange={e => setFundsAdded(e.target.value)}
              style={{ background: "#1a1a1a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "13px" }}
              className="w-full px-3 py-2 rounded"
            />
          </div>
          <div>
            <label style={{ color: "#999", fontSize: "11px" }} className="block mb-1.5 uppercase tracking-wider">Impostos / taxas (R$)</label>
            <input
              type="number"
              placeholder="0"
              value={taxCost}
              onChange={e => setTaxCost(e.target.value)}
              style={{ background: "#1a1a1a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "13px" }}
              className="w-full px-3 py-2 rounded"
            />
          </div>

          <div>
            <label style={{ color: "#999", fontSize: "11px" }} className="block mb-1.5 uppercase tracking-wider">Orcamento diario configurado (R$/dia)</label>
            <input
              type="number"
              placeholder="15"
              value={dailyBudget}
              onChange={e => setDailyBudget(e.target.value)}
              style={{ background: "#1a1a1a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "13px" }}
              className="w-full px-3 py-2 rounded"
            />
          </div>

          <label className="flex items-center gap-2" style={{ color: "#bbb", fontSize: "11px" }}>
            <input type="checkbox" checked={registerScale} onChange={(e) => setRegisterScale(e.target.checked)} />
            Voce alterou o orcamento hoje? Registrar escala no historico.
          </label>

          {!!campaign.scaleHistory?.length && (
            <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3 text-xs space-y-1">
              <p style={{ color: "#999" }} className="uppercase tracking-wider">Historico de escalas</p>
              {[...(campaign.scaleHistory || [])].slice(-3).reverse().map((s, idx) => (
                <p key={`${s.date}-${idx}`} style={{ color: "#d1d5db" }}>{s.date}: R${s.fromDailyBudget} {"->"} R${s.toDailyBudget}</p>
              ))}
            </div>
          )}

          <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-3 text-xs space-y-1">
            <p style={{ color: "#999" }}>Spend atual: <strong style={{ color: "#fff" }}>{fmt(campaign.totalSpend)}</strong></p>
            <p style={{ color: "#999" }}>Custo real: <strong style={{ color: "#fff" }}>{fmt(realCost)}</strong></p>
            <p style={{ color: balance >= 0 ? "#10b981" : "#ef4444" }}>Saldo estimado: <strong>{fmt(balance)}</strong></p>
          </div>
        </div>

        {error && <p style={{ color: "#ef4444", fontSize: "11px" }} className="mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            style={{ border: "0.5px solid #3a3a3a", color: "#999", fontSize: "13px" }}
            className="flex-1 py-2 rounded hover:bg-[#323232] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: "#D4537E", color: "#fff", fontSize: "13px" }}
            className="flex-1 py-2 rounded font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar financeiro"}
          </button>
        </div>
      </div>
    </div>
  );
}