import React from "react";
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
  imp: "HOJE",
  ok: "ROTINA",
  info: "INFO",
};

export default function DiagnosticCard({ diagnostics, onAction }: DiagnosticCardProps) {
  return (
    <div className="space-y-3">
      {diagnostics.map((d, i) => {
        const cfg = typeConfig[d.type];
        return (
          <div
            key={i}
            style={{
              background: cfg.bg,
              border: `0.5px solid ${cfg.border}`,
              borderLeft: `3px solid ${cfg.leftBorder}`,
            }}
            className="p-4 rounded-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="mb-1">
                  <span
                    style={{ color: cfg.badge, background: cfg.badgeBg }}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded inline-block"
                  >
                    {labels[d.type]}
                  </span>
                </div>
                <p
                  style={{ color: cfg.textMain }}
                  className="text-sm font-semibold leading-snug mb-1"
                >
                  {d.title}
                </p>
                <p style={{ color: cfg.textMuted }} className="text-xs leading-snug">
                  {d.description}
                </p>
              </div>

              {d.action && d.actionId && (
                <button
                  onClick={() => onAction?.(d.actionId!)}
                  style={{
                    color: cfg.badge,
                    borderColor: cfg.border,
                  }}
                  className="shrink-0 text-xs px-3 py-1.5 rounded border font-medium whitespace-nowrap transition-opacity hover:opacity-80"
                >
                  {d.action} ↗
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

