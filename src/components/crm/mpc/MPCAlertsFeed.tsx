import React, { useState } from "react";
import { MPCAlert, AlertLevel } from "@/types/mpc";
import { ChevronDown, AlertTriangle, AlertCircle, AlertOctagon } from "lucide-react";

type MPCAlertsFeedProps = {
  alerts: MPCAlert[];
};

function AlertLevelBadge({ level }: { level: AlertLevel }) {
  const config = {
    critical: {
      bg: "bg-rose-100",
      text: "text-rose-800",
      label: "CRÍTICO",
      icon: AlertOctagon,
    },
    high: {
      bg: "bg-orange-100",
      text: "text-orange-800",
      label: "ALTO",
      icon: AlertTriangle,
    },
    medium: {
      bg: "bg-amber-100",
      text: "text-amber-800",
      label: "MÉDIO",
      icon: AlertCircle,
    },
    low: {
      bg: "bg-blue-100",
      text: "text-blue-800",
      label: "BAIXO",
      icon: AlertCircle,
    },
  };

  const c = config[level];
  const Icon = c.icon;

  return (
    <div className={`${c.bg} ${c.text} px-3 py-1 rounded-full flex items-center gap-2 text-xs font-semibold`}>
      <Icon size={14} />
      {c.label}
    </div>
  );
}

function AlertItem({ alert, isExpanded, onToggle }: { alert: MPCAlert; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-start justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-start gap-4 flex-1 text-left">
          <AlertLevelBadge level={alert.level} />
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">{alert.title}</h3>
            <p className="text-sm text-slate-600 mt-1">{alert.affectedEntity}</p>
          </div>
        </div>
        <ChevronDown
          size={20}
          className={`text-slate-400 transition-transform flex-shrink-0 ml-4 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {isExpanded && (
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 space-y-3">
          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Provável Causa</div>
            <p className="text-sm text-slate-700 mt-1">{alert.probableCause}</p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Impacto</div>
            <p className="text-sm text-slate-700 mt-1">{alert.impact}</p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Ação Sugerida</div>
            <p className="text-sm text-slate-700 mt-1">{alert.suggestedAction}</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium text-sm hover:bg-slate-800 transition-colors">
              Adotar Ação
            </button>
            <button className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors">
              Ignorar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MPCAlertsFeed({ alerts }: MPCAlertsFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const criticalAlerts = alerts.filter((a) => a.level === "critical");
  const otherAlerts = alerts.filter((a) => a.level !== "critical");

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Alertas MPC {alerts.length > 0 && `(${alerts.length})`}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Informações que exigem atenção imediata e decisão
          </p>
        </div>

        {criticalAlerts.length > 0 && (
          <div className="flex items-center gap-2 bg-rose-50 px-4 py-2 rounded-lg border border-rose-200">
            <AlertOctagon size={18} className="text-rose-600" />
            <span className="text-sm font-semibold text-rose-800">
              {criticalAlerts.length} crítico{criticalAlerts.length > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-slate-600">Nenhum alerta no momento. Operação dentro dos padrões.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              isExpanded={expandedId === alert.id}
              onToggle={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
