import React from "react";
import type { WhatsAppMessage } from "@/types/commandCenter";

interface ConversationCardProps {
  messages: WhatsAppMessage[];
}

const statusConfig = {
  pending: { label: "Pendente", bgColor: "#3a2a2a", textColor: "#ef4444", borderColor: "#5a3a3a" },
  responded: { label: "Respondido", bgColor: "#2a3a2a", textColor: "#10b981", borderColor: "#3a5a3a" },
  auto: { label: "Automático", bgColor: "#2a2a3a", textColor: "#378ADD", borderColor: "#3a3a5a" },
};

export default function ConversationCard({ messages }: ConversationCardProps) {
  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Conversas recentes</h4>
        <div className="flex gap-2 text-[10px]">
          <span style={{ color: "#ef4444", fontWeight: "500" }}>
            {messages.filter(m => m.status === "pending").length} pendentes
          </span>
        </div>
      </div>

      {/* Header labels */}
      <div className="flex items-center gap-3 px-2 mb-1 text-[10px] uppercase tracking-wider" style={{ color: "#999" }}>
        <span className="flex-1">Nome</span>
        <div className="flex gap-3 shrink-0">
          <span>Status</span>
          <span className="w-12 text-right">Resp.</span>
        </div>
      </div>

      <div className="space-y-1">
        {messages.map(m => {
          const cfg = statusConfig[m.status];
          return (
            <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#323232] transition-colors">
              {/* Avatar */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ background: m.avatarColor }}
              >
                {m.initials}
              </div>

              {/* Name + message */}
              <div className="flex-1 min-w-0">
                <p style={{ color: "#fff", fontSize: "12px" }} className="font-medium truncate leading-none">{m.name}</p>
                <p style={{ color: "#999", fontSize: "11px" }} className="truncate mt-0.5">{m.message}</p>
              </div>

              {/* Status + time */}
              <div className="flex items-center gap-3 shrink-0">
                <span style={{ color: cfg.textColor, background: cfg.bgColor, borderColor: cfg.borderColor }} className={`text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide`}>
                  {cfg.label}
                </span>
                <span style={{ color: "#666", fontSize: "10px" }} className="w-12 text-right">{m.timeLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
