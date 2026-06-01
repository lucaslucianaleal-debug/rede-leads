import React, { useState } from "react";
import type { PeriodType } from "@/types/commandCenter";
import { MOCK_UNITS } from "@/data/commandCenterMock";

interface TopbarProps {
  period: PeriodType;
  unit: string;
  criticalCount: number;
  onPeriodChange: (p: PeriodType) => void;
  onUnitChange: (u: string) => void;
  onExportPDF: () => void;
  exporting?: boolean;
}

const PERIODS: { id: PeriodType; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
];

export default function Topbar({
  period, unit, criticalCount,
  onPeriodChange, onUnitChange, onExportPDF, exporting,
}: TopbarProps) {
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSettings, setEmailSettings] = useState({ email: "", time: "08:00", frequency: "daily" });
  const [emailSaved, setEmailSaved] = useState(false);

  const handleSaveEmail = () => {
    // TODO: POST /api/email-settings
    setEmailSaved(true);
    setTimeout(() => { setEmailSaved(false); setShowEmailModal(false); }, 1500);
  };

  return (
    <>
      <div className="flex flex-col gap-3 pb-4 border-b border-border/50">
        {/* Row 1 — brand + period + unit + actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Brand */}
          <div className="flex items-center gap-2 min-w-fit">
            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
            <span className="font-bold text-sm tracking-tight">OdontoCompany</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">inteligência operacional</span>
          </div>

          {/* Period segmented control */}
          <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => onPeriodChange(p.id)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                  period === p.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Unit selector */}
          <select
            value={unit}
            onChange={e => onUnitChange(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground"
          >
            {MOCK_UNITS.map(u => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
                🔔 {criticalCount} críticos
              </span>
            )}

            <button
              onClick={() => setShowEmailModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted font-medium transition-colors"
            >
              ✉ Email diário
            </button>

            <button
              onClick={onExportPDF}
              disabled={exporting}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted font-medium transition-colors disabled:opacity-50"
            >
              {exporting ? "⏳ Gerando..." : "⬇ Exportar PDF"}
            </button>

            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ao vivo
            </span>
          </div>
        </div>
      </div>

      {/* Email modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl">
            <h3 className="font-semibold text-base mb-4">Configurar briefing diário por e-mail</h3>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">E-mail para:</label>
                <input
                  type="email"
                  placeholder="gestor@clinica.com.br"
                  value={emailSettings.email}
                  onChange={e => setEmailSettings(s => ({ ...s, email: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Horário:</label>
                <input
                  type="time"
                  value={emailSettings.time}
                  onChange={e => setEmailSettings(s => ({ ...s, time: e.target.value }))}
                  className="border border-border rounded-lg px-3 py-2 bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Frequência:</label>
                <select
                  value={emailSettings.frequency}
                  onChange={e => setEmailSettings(s => ({ ...s, frequency: e.target.value }))}
                  className="border border-border rounded-lg px-3 py-2 bg-background text-sm"
                >
                  <option value="daily">Diariamente</option>
                  <option value="weekly">Semanalmente</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSaveEmail}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                {emailSaved ? "✅ Salvo!" : "Confirmar"}
              </button>
              <button
                onClick={() => setShowEmailModal(false)}
                className="flex-1 py-2 rounded-lg border border-border text-sm"
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
