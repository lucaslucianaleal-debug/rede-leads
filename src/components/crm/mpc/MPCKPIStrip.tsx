import React from "react";
import { MPCMetrics } from "@/types/mpc";

type MPCKPIStripProps = {
  metrics: MPCMetrics;
};

function KPICard({
  label,
  value,
  meta,
  percentual,
  trend,
  unit,
  format,
}: {
  label: string;
  value: number;
  meta: number;
  percentual: number;
  trend: number;
  unit?: string;
  format?: "number" | "currency";
}) {
  const isOk = percentual >= 80;
  const isWarning = percentual >= 60 && percentual < 80;
  const isCritical = percentual < 60;

  const statusColor = isOk ? "text-emerald-600" : isWarning ? "text-amber-600" : "text-rose-600";
  const bgColor = isOk ? "bg-emerald-50" : isWarning ? "bg-amber-50" : "bg-rose-50";
  const borderColor = isOk ? "border-emerald-200" : isWarning ? "border-amber-200" : "border-rose-200";

  const displayValue =
    format === "currency"
      ? `R$ ${Math.round(value).toLocaleString("pt-BR")}`
      : `${Math.round(value)}${unit || ""}`;

  const displayMeta =
    format === "currency"
      ? `R$ ${Math.round(meta).toLocaleString("pt-BR")}`
      : `${Math.round(meta)}`;

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-5 flex flex-col justify-between h-full`}>
      <div>
        <div className="text-xs text-slate-600 font-semibold tracking-wide uppercase">{label}</div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${statusColor}`}>{displayValue}</span>
          <span className="text-xs text-slate-500">/ {displayMeta}</span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {/* Barra de progresso */}
        <div className="w-full bg-white rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all ${
              isOk ? "bg-emerald-500" : isWarning ? "bg-amber-500" : "bg-rose-500"
            }`}
            style={{ width: `${Math.min(percentual, 100)}%` }}
          />
        </div>

        {/* Percentual e Trend */}
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${statusColor}`}>{Math.round(percentual)}%</span>
          <span className="text-xs text-slate-600">
            {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} {Math.abs(Math.round(trend))}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MPCKPIStrip({ metrics }: MPCKPIStripProps) {
  const kpis = [
    {
      label: "Produção",
      value: metrics.producao.total,
      meta: metrics.producao.meta,
      percentual: metrics.producao.percentualMeta,
      trend: metrics.producao.tendencia,
      unit: " pacientes",
      format: "number" as const,
    },
    {
      label: "Conversão (Orç. → Atend.)",
      value: metrics.conversao.total,
      meta: metrics.conversao.meta,
      percentual: metrics.conversao.percentualMeta,
      trend: metrics.conversao.tendencia,
      unit: "%",
      format: "number" as const,
    },
    {
      label: "Satisfação",
      value: metrics.satisfacao.total,
      meta: metrics.satisfacao.meta,
      percentual: metrics.satisfacao.percentualMeta,
      trend: metrics.satisfacao.tendencia,
      unit: "/5",
      format: "number" as const,
    },
    {
      label: "Receita",
      value: metrics.receita.total,
      meta: metrics.receita.meta,
      percentual: metrics.receita.percentualMeta,
      trend: metrics.receita.tendencia,
      format: "currency" as const,
    },
    {
      label: "Meta Geral",
      value: metrics.metaGeral,
      meta: 100,
      percentual: metrics.metaGeral,
      trend: 0,
      unit: "%",
      format: "number" as const,
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">Resumo Executivo</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi, idx) => (
          <KPICard
            key={idx}
            label={kpi.label}
            value={kpi.value}
            meta={kpi.meta}
            percentual={kpi.percentual}
            trend={kpi.trend}
            unit={kpi.unit}
          />
        ))}
      </div>
    </div>
  );
}
