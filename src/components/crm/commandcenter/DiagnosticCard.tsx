import React from "react";
import type { Diagnostic } from "@/types/commandCenter";

interface DiagnosticCardProps {
  diagnostics: Diagnostic[];
  onAction?: (actionId: string) => void;
}

const typeConfig = {
  crit: { border: "border-l-red-500", bg: "bg-red-500/5", badge: "bg-red-500/20 text-red-400", dot: "bg-red-500", label: "URGENTE" },
  imp: { border: "border-l-amber-500", bg: "bg-amber-500/5", badge: "bg-amber-500/20 text-amber-400", dot: "bg-amber-500", label: "HOJE" },
  ok: { border: "border-l-emerald-500", bg: "bg-emerald-500/5", badge: "bg-emerald-500/20 text-emerald-400", dot: "bg-emerald-500", label: "ROTINA" },
  info: { border: "border-l-blue-500", bg: "bg-blue-500/5", badge: "bg-blue-500/20 text-blue-400", dot: "bg-blue-500", label: "INFO" },
};

export default function DiagnosticCard({ diagnostics, onAction }: DiagnosticCardProps) {
  return (
    <div className="space-y-2">
      {diagnostics.map((d, i) => {
        const cfg = typeConfig[d.type];
        return (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-xl border-l-4 border border-border/30 ${cfg.border} ${cfg.bg}`}
          >
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm font-semibold leading-snug text-foreground">{d.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{d.description}</p>
            </div>
            {d.action && d.actionId && (
              <button
                onClick={() => onAction?.(d.actionId!)}
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-border/60 bg-background hover:bg-muted font-medium whitespace-nowrap transition-colors"
              >
                {d.action} ↗
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
