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
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Automações</h4>
        <span style={{ color: "#10b981", fontSize: "11px" }} className="font-medium">
          {automations.filter(a => a.on).length}/{automations.length} ativas
        </span>
      </div>

      <div className="space-y-2">
        {automations.map(a => (
          <div
            key={a.id}
            style={{
              background: a.on ? "#2a3a2a" : "#323232",
              border: a.on ? "0.5px solid #3a5a3a" : "0.5px solid #3a3a3a",
            }}
            className="flex items-center gap-3 p-3 rounded-lg transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span style={{ color: "#fff", fontSize: "12px" }} className="font-medium">
                  {a.name}
                </span>
                <span
                  style={{
                    color: a.impactType === "positive" ? "#10b981" : "#3b82f6",
                    background: a.impactType === "positive" ? "#2a3a2a" : "#2a2a3a",
                    border: a.impactType === "positive" ? "0.5px solid #3a5a3a" : "0.5px solid #3a3a5a",
                    fontSize: "9px",
                  }}
                  className="px-1.5 py-0.5 rounded font-bold"
                >
                  {a.impact}
                </span>
              </div>
              <p style={{ color: "#666", fontSize: "11px" }}>{a.description}</p>
            </div>

            {/* Toggle Switch */}
            <button
              onClick={() => toggle(a.id)}
              style={{
                background: a.on ? "#10b981" : "#555",
              }}
              className="relative w-11 h-6 rounded-full transition-colors shrink-0"
              aria-label={a.on ? "Desativar" : "Ativar"}
            >
              <span
                style={{
                  background: "#fff",
                  transform: a.on ? "translateX(22px)" : "translateX(2px)",
                }}
                className="absolute top-0.5 w-5 h-5 rounded-full shadow transition-transform"
              />
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "0.5px solid #3a3a3a" }}>
        <span style={{ color: "#666", fontSize: "10px" }}>Gerenciar automações</span>
        <span style={{ color: "#378ADD", fontSize: "11px", fontWeight: "600" }}>→</span>
      </div>
    </div>
  );
}
