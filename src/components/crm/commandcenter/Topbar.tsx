import React, { useState } from "react";
import type { PeriodType, LayerType } from "@/types/commandCenter";
import { MOCK_UNITS } from "@/data/commandCenterMock";

interface TopbarProps {
  layer: LayerType;
  period: PeriodType;
  unit: string;
  criticalCount: number;
  onLayerChange: (l: LayerType) => void;
  onPeriodChange: (p: PeriodType) => void;
  onUnitChange: (u: string) => void;
  onExportPDF: () => void;
  exporting?: boolean;
}

const LAYERS: { id: LayerType; label: string; icon: string }[] = [
  { id: "meta", label: "Meta & Campanhas", icon: "📢" },
];

const PERIODS: { id: PeriodType; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
];

export default function Topbar({
  layer, period, unit, criticalCount,
  onLayerChange, onPeriodChange, onUnitChange, onExportPDF, exporting,
}: TopbarProps) {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSettings, setEmailSettings] = useState({ email: "", time: "08:00", frequency: "daily" });

  const handleSaveEmail = () => {
    setShowEmailModal(false);
  };

  return (
    <>
      <div className="sticky top-0 z-40 bg-[#1a1a1a] border-b border-[#3a3a3a]">
        <div className="px-6 py-4">
          {/* Row 1 — Brand + Tabs + Right side */}
          <div className="flex items-center justify-between gap-6 mb-4">
            {/* Logo + Brand */}
            <div className="flex items-center gap-2 min-w-fit">
              <span className="w-2 h-2 rounded-full bg-[#D4537E]" />
              <span className="text-base font-semibold text-white">OdontoCompany</span>
            </div>

            {/* Layer tabs */}
            <div className="flex items-center gap-1">
              {LAYERS.map(l => (
                <button
                  key={l.id}
                  onClick={() => onLayerChange(l.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    layer === l.id
                      ? "text-white border-b-[#D4537E]"
                      : "text-[#999] border-b-transparent hover:text-white"
                  }`}
                >
                  <span>{l.icon}</span>
                  {l.label}
                </button>
              ))}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-3 ml-auto">
              {/* Unit selector */}
              <select
                value={unit}
                onChange={e => onUnitChange(e.target.value)}
                className="text-xs px-3 py-1.5 bg-[#2a2a2a] border border-[#3a3a3a] text-white rounded hover:bg-[#323232]"
              >
                {MOCK_UNITS.map(u => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>

              {/* Critical count badge */}
              {criticalCount > 0 && (
                <span className="text-xs px-2.5 py-1 rounded bg-[#FCEBEB] border border-[#F09595] text-[#791F1F] font-medium">
                  ⚠ {criticalCount} críticos
                </span>
              )}

              {/* Email button */}
              <button
                onClick={() => setShowEmailModal(true)}
                className="text-xs px-3 py-1.5 rounded border border-[#3a3a3a] text-white hover:bg-[#323232]"
              >
                📧 Email
              </button>

              {/* PDF export button */}
              <button
                onClick={onExportPDF}
                disabled={exporting}
                className="text-xs px-3 py-1.5 rounded border border-[#3a3a3a] text-white hover:bg-[#323232] disabled:opacity-50"
              >
                {exporting ? "⏳ Gerando..." : "📥 PDF"}
              </button>

              {/* Live indicator */}
              <span className="flex items-center gap-1.5 text-xs text-[#10b981]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                ao vivo
              </span>
            </div>
          </div>

          {/* Row 2 — Period selector */}
          <div className="flex items-center gap-2">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => onPeriodChange(p.id)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  period === p.id
                    ? "bg-[#2a2a2a] text-white border border-[#3a3a3a]"
                    : "text-[#999] hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Email modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg p-6">
            <h3 className="text-white text-sm font-semibold mb-4">Configurar email diário</h3>
            <div className="space-y-3 text-xs mb-4">
              <input
                type="email"
                placeholder="gestor@clinica.com.br"
                value={emailSettings.email}
                onChange={e => setEmailSettings(s => ({ ...s, email: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3a3a3a] text-white rounded text-xs"
              />
              <input
                type="time"
                value={emailSettings.time}
                onChange={e => setEmailSettings(s => ({ ...s, time: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#3a3a3a] text-white rounded text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEmail}
                className="flex-1 py-2 bg-[#D4537E] text-white text-xs font-medium rounded hover:opacity-90"
              >
                Salvar
              </button>
              <button
                onClick={() => setShowEmailModal(false)}
                className="flex-1 py-2 border border-[#3a3a3a] text-white text-xs font-medium rounded hover:bg-[#323232]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

