import React from "react";
import type { WhatsAppMessage } from "@/types/commandCenter";

interface ConversationCardProps {
  messages: WhatsAppMessage[];
}

const statusConfig = {
  pending: { label: "Pendente", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  responded: { label: "Respondido", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  auto: { label: "Automático", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

export default function ConversationCard({ messages }: ConversationCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold">Conversas recentes</h4>
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <span className="text-red-400 font-medium">
            {messages.filter(m => m.status === "pending").length} pendentes
          </span>
        </div>
      </div>

      {/* Header labels */}
      <div className="flex items-center gap-3 px-2 mb-1 text-[10px] text-muted-foreground uppercase tracking-wider">
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
            <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors">
              {/* Avatar */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ background: m.avatarColor }}
              >
                {m.initials}
              </div>

              {/* Name + message */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-none">{m.name}</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{m.message}</p>
              </div>

              {/* Status + time */}
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide ${cfg.cls}`}>
                  {cfg.label}
                </span>
                <span className="text-[10px] text-muted-foreground w-12 text-right">{m.timeLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
