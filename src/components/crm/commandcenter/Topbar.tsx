import React from "react";
import type { LayerType, PeriodType } from "@/types/commandCenter";
import { MOCK_UNITS } from "@/data/commandCenterMock";

interface TopbarProps {
  layer: LayerType;
  period: PeriodType;
  unit: string;
  criticalCount: number;
  onLayerChange: (l: LayerType) => void;
  onPeriodChange: (p: PeriodType) => void;
  onUnitChange: (u: string) => void;
}

const LAYERS: { id: LayerType; label: string; icon: string }[] = [
  { id: "ops", label: "Operacional", icon: "⊞" },
  { id: "meta", label: "Meta Ads", icon: "∞" },
  { id: "wa", label: "WhatsApp", icon: "✉" },
];

const PERIODS: { id: PeriodType; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
];

export default function Topbar({ layer, period, unit, criticalCount, onLayerChange, onPeriodChange, onUnitChange }: TopbarProps) {
  return (
    <div className="flex flex-col gap-2 pb-4 border-b border-border/50">
      {/* Row 1 — brand + period + live */}
      <div className="flex items-center gap-4 flex-wrap">
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
        <div className="ml-auto flex items-center gap-3">
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
              🔔 {criticalCount} críticos
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ao vivo
          </span>
        </div>
      </div>

      {/* Row 2 — layer tabs */}
      <div className="flex items-center gap-1">
        {LAYERS.map(l => (
          <button
            key={l.id}
            onClick={() => onLayerChange(l.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
              layer === l.id
                ? "bg-foreground/10 border-foreground/20 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <span className="text-base leading-none">{l.icon}</span>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
