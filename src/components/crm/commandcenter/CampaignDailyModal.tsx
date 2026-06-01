import React, { useState } from "react";
import type { Campaign, CampaignDailyMetric } from "@/types/commandCenter";

interface Props {
  campaign: Campaign;
  onSave: (campaignId: string, metric: CampaignDailyMetric) => Promise<void>;
  onClose: () => void;
}

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function CampaignDailyModal({ campaign, onSave, onClose }: Props) {
  const [date, setDate] = useState(todayStr());
  const [spend, setSpend] = useState("");
  const [impressions, setImpressions] = useState("");
  const [clicks, setClicks] = useState("");
  const [reach, setReach] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Pré-preenche se já existe dado para o dia
  const existing = campaign.dailyMetrics.find(m => m.date === date);

  const handleDateChange = (val: string) => {
    setDate(val);
    const found = campaign.dailyMetrics.find(m => m.date === val);
    if (found) {
      setSpend(found.spend.toString());
      setImpressions(found.impressions.toString());
      setClicks(found.clicks.toString());
      setReach(found.reach.toString());
    } else {
      setSpend(""); setImpressions(""); setClicks(""); setReach("");
    }
  };

  const handleSave = async () => {
    if (!date) { setError("Informe a data"); return; }
    if (!spend) { setError("Informe o spend"); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(campaign.id, {
        date,
        spend: parseFloat(spend) || 0,
        impressions: parseInt(impressions) || 0,
        clicks: parseInt(clicks) || 0,
        reach: parseInt(reach) || 0,
      });
      onClose();
    } catch (e) {
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a", width: "100%", maxWidth: "440px" }} className="rounded-xl p-6 mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 style={{ color: "#fff", fontSize: "14px" }} className="font-semibold">Atualizar métricas do dia</h3>
            <p style={{ color: "#999", fontSize: "11px" }} className="mt-0.5">{campaign.name}</p>
          </div>
          <button onClick={onClose} style={{ color: "#666" }} className="text-xl leading-none hover:text-white">×</button>
        </div>

        {/* Data */}
        <div className="mb-4">
          <label style={{ color: "#999", fontSize: "11px" }} className="block mb-1.5 uppercase tracking-wider">Data (DD/MM/AAAA)</label>
          <input
            type="text"
            placeholder="01/06/2024"
            value={date}
            onChange={e => handleDateChange(e.target.value)}
            style={{ background: "#1a1a1a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "13px" }}
            className="w-full px-3 py-2 rounded"
          />
          {existing && <p style={{ color: "#f59e0b", fontSize: "10px" }} className="mt-1">⚠ Já existe dado para este dia — será atualizado</p>}
        </div>

        {/* Campos */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { label: "Spend (R$) *", value: spend, set: setSpend, placeholder: "0,00" },
            { label: "Alcance", value: reach, set: setReach, placeholder: "5.294" },
            { label: "Impressões", value: impressions, set: setImpressions, placeholder: "14.221" },
            { label: "Cliques", value: clicks, set: setClicks, placeholder: "850" },
          ].map(f => (
            <div key={f.label}>
              <label style={{ color: "#999", fontSize: "11px" }} className="block mb-1.5 uppercase tracking-wider">{f.label}</label>
              <input
                type="number"
                placeholder={f.placeholder}
                value={f.value}
                onChange={e => f.set(e.target.value)}
                style={{ background: "#1a1a1a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "13px" }}
                className="w-full px-3 py-2 rounded"
              />
            </div>
          ))}
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
            {saving ? "Salvando..." : existing ? "Atualizar dia" : "Salvar dia"}
          </button>
        </div>
      </div>
    </div>
  );
}
