import React, { useState } from "react";

interface Props {
  clinicId: string;
  onSave: (data: { name: string; dateStart: string; dateEnd: string; budget: number }) => Promise<void>;
  onClose: () => void;
}

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function CreateCampaignModal({ clinicId, onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [dateStart, setDateStart] = useState(todayStr());
  const [dateEnd, setDateEnd] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) { setError("Informe o nome da campanha"); return; }
    if (!dateStart) { setError("Informe a data de início"); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), dateStart, dateEnd, budget: parseFloat(budget) || 0 });
      onClose();
    } catch (e) {
      setError("Erro ao criar campanha. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a", width: "100%", maxWidth: "440px" }} className="rounded-xl p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h3 style={{ color: "#fff", fontSize: "14px" }} className="font-semibold">Nova Campanha</h3>
          <button onClick={onClose} style={{ color: "#666" }} className="text-xl leading-none hover:text-white">×</button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label style={{ color: "#999", fontSize: "11px" }} className="block mb-1.5 uppercase tracking-wider">Nome da campanha *</label>
            <input
              type="text"
              placeholder="Ex: Sorteio Junho"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ background: "#1a1a1a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "13px" }}
              className="w-full px-3 py-2 rounded"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: "#999", fontSize: "11px" }} className="block mb-1.5 uppercase tracking-wider">Data início *</label>
              <input
                type="text"
                placeholder="01/06/2024"
                value={dateStart}
                onChange={e => setDateStart(e.target.value)}
                style={{ background: "#1a1a1a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "13px" }}
                className="w-full px-3 py-2 rounded"
              />
            </div>
            <div>
              <label style={{ color: "#999", fontSize: "11px" }} className="block mb-1.5 uppercase tracking-wider">Data fim</label>
              <input
                type="text"
                placeholder="30/06/2024"
                value={dateEnd}
                onChange={e => setDateEnd(e.target.value)}
                style={{ background: "#1a1a1a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "13px" }}
                className="w-full px-3 py-2 rounded"
              />
            </div>
          </div>

          <div>
            <label style={{ color: "#999", fontSize: "11px" }} className="block mb-1.5 uppercase tracking-wider">Budget planejado (R$)</label>
            <input
              type="number"
              placeholder="2500"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              style={{ background: "#1a1a1a", border: "0.5px solid #3a3a3a", color: "#fff", fontSize: "13px" }}
              className="w-full px-3 py-2 rounded"
            />
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
            {saving ? "Criando..." : "Criar campanha"}
          </button>
        </div>
      </div>
    </div>
  );
}
