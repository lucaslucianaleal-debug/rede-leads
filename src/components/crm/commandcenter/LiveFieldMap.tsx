import React from "react";
import type { FieldMember } from "@/types/commandCenter";

interface LiveFieldMapProps {
  members: FieldMember[];
}

export default function LiveFieldMap({ members }: LiveFieldMapProps) {
  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "16px" }}>📍</span>
          <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Campo ao vivo</h4>
        </div>
        <span
          style={{
            background: "#10b981",
            color: "#000",
            fontSize: "9px",
            fontWeight: "700",
          }}
          className="px-2 py-1 rounded uppercase"
        >
          hoje
        </span>
      </div>

      {/* Map Container */}
      <div
        style={{
          background: "#1a1a1a",
          border: "0.5px solid #3a3a3a",
          position: "relative",
          width: "100%",
          aspectRatio: "1",
          borderRadius: "6px",
          overflow: "hidden",
        }}
        className="mb-4"
      >
        {/* Grid lines */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0.1,
          }}
        >
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#fff" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Member dots */}
        {members.map(m => (
          <div
            key={m.id}
            style={{
              position: "absolute",
              left: `${m.x}%`,
              top: `${m.y}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 10,
            }}
          >
            {/* Dot */}
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: m.color,
                border: "2px solid #1a1a1a",
                boxShadow: `0 0 8px ${m.color}80`,
              }}
            />
            {/* Label */}
            <div
              style={{
                position: "absolute",
                top: "-20px",
                left: "50%",
                transform: "translateX(-50%)",
                background: m.color,
                color: "#000",
                fontSize: "9px",
                fontWeight: "600",
                padding: "2px 4px",
                borderRadius: "3px",
                whiteSpace: "nowrap",
              }}
            >
              {m.name}
            </div>
          </div>
        ))}
      </div>

      {/* Member List */}
      <div className="space-y-2">
        {members.map(m => (
          <div
            key={m.id}
            style={{
              background: m.color,
              opacity: 0.15,
              border: `0.5px solid ${m.color}40`,
            }}
            className="rounded-lg p-2.5 flex items-center gap-3"
          >
            {/* Color dot */}
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: m.color,
                flexShrink: 0,
              }}
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p style={{ color: "#fff", fontSize: "12px" }} className="font-medium">
                {m.name}
              </p>
              <p style={{ color: "#999", fontSize: "10px" }} className="mt-0.5">
                {m.unit}
              </p>
            </div>

            {/* Leads + Meta */}
            <div className="text-right shrink-0">
              <p style={{ color: m.color, fontSize: "12px", fontWeight: "700" }}>
                {m.leads}
              </p>
              <p style={{ color: "#666", fontSize: "9px" }}>
                de {m.meta}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
