import React from "react";
import type { PerformanceChannel } from "@/types/commandCenter";

interface PerformanceByChannelCardProps {
  channels: PerformanceChannel[];
}

export default function PerformanceByChannelCard({ channels }: PerformanceByChannelCardProps) {
  const statusColors = {
    good: { text: "#10b981", bg: "#2a3a2a", border: "#3a5a3a" },
    warning: { text: "#f59e0b", bg: "#3a3a2a", border: "#5a5a3a" },
    bad: { text: "#ef4444", bg: "#3a2a2a", border: "#5a3a3a" },
    critical: { text: "#ef4444", bg: "#3a2a2a", border: "#5a3a3a" },
  };

  // Se não houver canais com volume suficiente
  if (!channels || channels.length === 0) {
    return (
      <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
        <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold mb-3">Performance por canal</h4>
        <p style={{ color: "#666", fontSize: "11px" }} className="text-center py-4">
          📊 Sem canais com volume suficiente (&gt;= 10 leads) para análise confiável
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      <div className="mb-4">
        <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Performance por canal</h4>
        <p style={{ color: "#666", fontSize: "9px" }} className="mt-1">Ordenado por comparecimento real | Volume mínimo: 10 leads</p>
      </div>

      <div className="space-y-2.5">
        {channels.map(c => {
          const cfg = statusColors[c.status as keyof typeof statusColors] || statusColors.warning;
          const completionRate = c.scheduled > 0 ? Math.round((c.completed / c.scheduled) * 100) : 0;
          
          return (
            <div
              key={c.id}
              style={{ background: cfg.bg, border: `0.5px solid ${cfg.border}` }}
              className="rounded-lg p-3"
            >
              {/* Header: Icon + Name */}
              <div className="flex items-center gap-2.5 mb-2">
                <span style={{ fontSize: "18px" }}>{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <p style={{ color: "#fff", fontSize: "12px" }} className="font-semibold truncate">
                    {c.name}
                  </p>
                  <p style={{ color: "#666", fontSize: "9px" }} className="mt-0.5">
                    {c.leads} leads
                  </p>
                </div>
              </div>

              {/* Métricas principais: Agendamentos + Comparecimentos */}
              <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded p-1.5">
                  <p style={{ color: "#666" }}>Agend.</p>
                  <p style={{ color: "#f59e0b", fontWeight: "600" }}>{c.scheduled}</p>
                  <p style={{ color: "#555", fontSize: "8px" }}>{c.conversionRate}</p>
                </div>
                <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded p-1.5">
                  <p style={{ color: "#666" }}>Compar.</p>
                  <p style={{ color: cfg.text, fontWeight: "600" }}>{c.completed}</p>
                  <p style={{ color: "#555", fontSize: "8px" }}>{c.showUpRate}</p>
                </div>
                <div style={{ background: "#1f1f1f", border: "0.5px solid #3a3a3a" }} className="rounded p-1.5">
                  <p style={{ color: "#666" }}>Taxa</p>
                  <p style={{ color: cfg.text, fontWeight: "600" }}>{completionRate}%</p>
                  <p style={{ color: "#555", fontSize: "8px" }}>de agend.</p>
                </div>
              </div>

              {/* Verdict */}
              <div className="text-[9px]">
                {c.status === "good" && (
                  <p style={{ color: "#10b981" }}>✅ Comparecimento forte - {c.showUpRate} presentes</p>
                )}
                {c.status === "warning" && (
                  <p style={{ color: "#f59e0b" }}>⚠️ Comparecimento moderado - {c.showUpRate} presentes</p>
                )}
                {(c.status === "bad" || c.status === "critical") && (
                  <p style={{ color: "#ef4444" }}>🔴 Comparecimento fraco - apenas {c.showUpRate} presentes</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer stats */}
      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "0.5px solid #3a3a3a" }}>
        <span style={{ color: "#999", fontSize: "10px" }}>Canais analisados</span>
        <span style={{ color: "#378ADD", fontSize: "11px", fontWeight: "600" }}>{channels?.length || 0}</span>
      </div>
    </div>
  );
}
