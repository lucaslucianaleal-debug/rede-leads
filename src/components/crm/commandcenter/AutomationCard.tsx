import React, { useState } from "react";
import type { Automation } from "@/types/commandCenter";
import { MOCK_AUTOMATIONS } from "@/data/commandCenterMock";

export default function AutomationCard() {
  const [automations, setAutomations] = useState<Automation[]>(MOCK_AUTOMATIONS);

  const toggle = (id: string) => {
    setAutomations(prev =>
      prev.map(a => (a.id === id ? { ...a, on: !a.on } : a))
    );
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold">Automações</h4>
        <span className="text-xs text-muted-foreground">
          {automations.filter(a => a.on).length}/{automations.length} ativas
        </span>
      </div>

      <div className="space-y-2">
        {automations.map(a => (
          <div key={a.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${a.on ? "border-emerald-500/20 bg-emerald-500/5" : "border-border/30 bg-muted/10"}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium">{a.name}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${a.impactType === "positive" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"}`}>
                  {a.impact}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{a.description}</p>
            </div>

            {/* Toggle */}
            <button
              onClick={() => toggle(a.id)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${a.on ? "bg-emerald-500" : "bg-muted"}`}
              aria-label={a.on ? "Desativar" : "Ativar"}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${a.on ? "translate-x-5" : "translate-x-0.5"}`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
