import React, { useState } from "react";
import type { Diagnostic } from "@/types/commandCenter";

interface DiagnosticCardProps {
  diagnostics: Diagnostic[];
  onAction?: (actionId: string) => void;
}

const typeConfig = {
  crit: {
    bg: "#FCEBEB",
    border: "#F09595",
    textMain: "#791F1F",
    textMuted: "#8B4B4B",
    leftBorder: "#E24B4A",
    badge: "#791F1F",
    badgeBg: "#FCEBEB",
  },
  imp: {
    bg: "#FAEEDA",
    border: "#E8C897",
    textMain: "#633806",
    textMuted: "#7A5A1D",
    leftBorder: "#BA7517",
    badge: "#633806",
    badgeBg: "#FAEEDA",
  },
  ok: {
    bg: "#EAF3DE",
    border: "#C9E4A1",
    textMain: "#27500A",
    textMuted: "#4A6D24",
    leftBorder: "#1D9E75",
    badge: "#27500A",
    badgeBg: "#EAF3DE",
  },
  info: {
    bg: "#E6F1FB",
    border: "#B3D9F2",
    textMain: "#0C447C",
    textMuted: "#2D5E99",
    leftBorder: "#378ADD",
    badge: "#0C447C",
    badgeBg: "#E6F1FB",
  },
};

const labels = {
  crit: "URGENTE",
  imp: "ATENÇÃO",
  ok: "POSITIVO",
  info: "INSIGHT",
};

export default function DiagnosticCard({ diagnostics, onAction }: DiagnosticCardProps) {
  // Mostrar todos se <= 4, senão colapsar os de baixa prioridade
  const [expanded, setExpanded] = useState(false);

  const crits = diagnostics.filter(d => d.type === "crit");
  const imps = diagnostics.filter(d => d.type === "imp");
  const rest = diagnostics.filter(d => d.type === "ok" || d.type === "info");

  // Sempre mostrar urgentes + atenções; colapsar ok/info
  const visible = expanded ? diagnostics : [...crits, ...imps, ...(crits.length + imps.length < 3 ? rest.slice(0, 3 - crits.length - imps.length) : [])];
  const hiddenCount = diagnostics.length - visible.length;

  return (
    <div className="space-y-2">
      {visible.map((d, i) => {
        const cfg = typeConfig[d.type];
        return (
          <div
            key={i}
            style={{
              background: cfg.bg,
              border: `0.5px solid ${cfg.border}`,
              borderLeft: `3px solid ${cfg.leftBorder}`,
            }}
            className="p-3 rounded-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    style={{ color: cfg.badge, background: cfg.badgeBg, fontSize: "9px" }}
                    className="font-bold px-1.5 py-0.5 rounded uppercase tracking-wider inline-block"
                  >
                    {labels[d.type]}
                  </span>
                </div>
                <p style={{ color: cfg.textMain, fontSize: "12px" }} className="font-semibold leading-snug mb-0.5">
                  {d.title}
                </p>
                <p style={{ color: cfg.textMuted, fontSize: "11px" }} className="leading-snug">
                  {d.description}
                </p>
              </div>

              {d.action && d.actionId && (
                <button
                  onClick={() => onAction?.(d.actionId!)}
                  style={{ color: cfg.badge, borderColor: cfg.border, fontSize: "11px" }}
                  className="shrink-0 px-3 py-1.5 rounded border font-medium whitespace-nowrap transition-opacity hover:opacity-80"
                >
                  {d.action} ↗
                </button>
              )}
            </div>
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{ color: "#666", fontSize: "11px" }}
          className="w-full py-2 text-center hover:text-white transition-colors"
        >
          + {hiddenCount} insight{hiddenCount > 1 ? "s" : ""} adicionais — clique para ver
        </button>
      )}
      {expanded && rest.length > 0 && (
        <button
          onClick={() => setExpanded(false)}
          style={{ color: "#555", fontSize: "11px" }}
          className="w-full py-1 text-center hover:text-white transition-colors"
        >
          ▲ Recolher
        </button>
      )}
    </div>
  );
}
