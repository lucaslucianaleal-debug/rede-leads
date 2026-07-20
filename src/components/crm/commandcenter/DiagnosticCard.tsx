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
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {diagnostics.map((d, i) => {
        const cfg = typeConfig[d.type];
        const isExpanded = expandedIndex === i;
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
            <button
              type="button"
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
              className="w-full text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    style={{ color: cfg.badge, background: cfg.badgeBg, fontSize: "9px" }}
                    className="font-bold px-1.5 py-0.5 rounded uppercase tracking-wider inline-block"
                  >
                    {labels[d.type]}
                  </span>
                  <span style={{ color: cfg.textMuted, fontSize: "10px" }} className="uppercase tracking-wider">
                    {isExpanded ? "▲ Recolher" : "▼ Expandir"}
                  </span>
                </div>
              </div>
              <p style={{ color: cfg.textMain, fontSize: "12px" }} className="font-semibold leading-snug mb-0.5">
                {d.title}
              </p>
              {!isExpanded && (
                <p style={{ color: cfg.textMuted, fontSize: "11px" }} className="leading-snug line-clamp-2">
                  {d.description}
                </p>
              )}
            </button>

            {isExpanded && (
              <div className="mt-2 pt-2" style={{ borderTop: `0.5px dashed ${cfg.border}` }}>
                <p style={{ color: cfg.textMain, fontSize: "12px" }} className="font-semibold leading-snug mb-0.5">
                  {d.description}
                </p>
                {d.action && d.actionId && (
                  <div className="mt-2">
                    <button
                      onClick={() => onAction?.(d.actionId!)}
                      style={{ color: cfg.badge, borderColor: cfg.border, fontSize: "11px" }}
                      className="px-3 py-1.5 rounded border font-medium whitespace-nowrap transition-opacity hover:opacity-80"
                    >
                      {d.action} ↗
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
