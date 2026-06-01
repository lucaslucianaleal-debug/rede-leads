import React from "react";
import type { ConsultorStat } from "@/services/firebaseQueries";

interface ConsultorRankingProps {
  consultores: ConsultorStat[];
  period?: "hoje" | "semana" | "mes";
}

export default function ConsultorRanking({ consultores, period = "mes" }: ConsultorRankingProps) {
  const periodLabel = period === "hoje" ? "hoje" : period === "semana" ? "últimos 7 dias" : "últimos 30 dias";

  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Ranking de captadores</h4>
          <p style={{ color: "#666", fontSize: "11px" }} className="mt-0.5">{periodLabel} · por taxa de agendamento</p>
        </div>
        {consultores.length > 0 && (
          <span style={{ color: "#666", fontSize: "10px" }}>
            {consultores.length} captador{consultores.length > 1 ? "es" : ""}
          </span>
        )}
      </div>

      {consultores.length === 0 ? (
        <div className="py-6 text-center">
          <p style={{ color: "#555", fontSize: "12px" }}>Nenhum lead com captador no período</p>
          <p style={{ color: "#444", fontSize: "10px" }} className="mt-1">Leads online não têm captador atribuído</p>
        </div>
      ) : (
        <div className="space-y-3">
          {consultores.slice(0, 6).map((c, idx) => {
            const isTop = idx === 0;
            const isGood = c.scheduledRate >= 50;
            const isWarn = c.scheduledRate >= 30 && c.scheduledRate < 50;
            const barColor = isGood ? "#10b981" : isWarn ? "#f59e0b" : "#ef4444";
            const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}º`;

            return (
              <div key={c.name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span style={{ fontSize: "13px", minWidth: "20px" }}>{medal}</span>
                    <div className="min-w-0">
                      <p style={{ color: isTop ? "#fff" : "#ccc", fontSize: "12px", fontWeight: isTop ? "700" : "500" }}
                        className="truncate">
                        {c.name}
                      </p>
                      <p style={{ color: "#555", fontSize: "10px" }}>
                        {c.leads} leads · {c.scheduled} agend. · {c.completed} vieram
                      </p>
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p style={{ color: barColor, fontSize: "13px", fontWeight: "700" }}>
                      {c.scheduledRate}%
                    </p>
                    <p style={{ color: "#555", fontSize: "9px" }}>agend.</p>
                  </div>
                </div>

                {/* Barra dupla: agendados e compareceram */}
                <div className="relative h-1.5 rounded-full" style={{ background: "#333" }}>
                  <div
                    className="absolute h-full rounded-full transition-all"
                    style={{ width: `${c.scheduledRate}%`, background: barColor, opacity: 0.4 }}
                  />
                  <div
                    className="absolute h-full rounded-full transition-all"
                    style={{ width: `${c.showUpRate}%`, background: barColor }}
                  />
                </div>

                {/* Mini legenda */}
                <div className="flex justify-between mt-0.5">
                  <span style={{ color: "#444", fontSize: "9px" }}>
                    {c.showUpRate}% comparecimento
                  </span>
                  <span style={{ color: "#444", fontSize: "9px" }}>
                    meta: 50%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "0.5px solid #3a3a3a" }}>
        <span style={{ color: "#666", fontSize: "10px" }}>
          Barra escura = % comparecimento · Clara = % agendamento
        </span>
      </div>
    </div>
  );
}
