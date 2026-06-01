import React from "react";
import type { RecentLead } from "@/types/commandCenter";

interface RecentLeadsTableProps {
  leads: RecentLead[];
}

const statusConfig = {
  agendado: { label: "Agendado", bg: "#3a3a2a", text: "#f59e0b", border: "#5a5a3a" },
  confirmado: { label: "Confirmado", bg: "#2a3a2a", text: "#10b981", border: "#3a5a3a" },
  compareceu: { label: "Compareceu", bg: "#2a3a2a", text: "#10b981", border: "#3a5a3a" },
  cancelado: { label: "Cancelado", bg: "#3a2a2a", text: "#ef4444", border: "#5a3a3a" },
};

export default function RecentLeadsTable({ leads }: RecentLeadsTableProps) {
  return (
    <div style={{ background: "#2a2a2a", border: "0.5px solid #3a3a3a" }} className="rounded-lg p-4">
      <div className="mb-4">
        <h4 style={{ color: "#fff", fontSize: "13px" }} className="font-semibold">Leads recentes</h4>
        <p style={{ color: "#666", fontSize: "10px" }} className="mt-1">{leads.length} registros</p>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 px-2 mb-2 text-[10px] uppercase tracking-wider" style={{ color: "#666" }}>
        <span className="flex-1">Nome</span>
        <span className="w-16">Data</span>
        <span className="w-16">Hora</span>
        <span className="w-20">Status</span>
      </div>

      {/* Rows */}
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {leads.map(lead => {
          const cfg = statusConfig[lead.status];
          return (
            <div
              key={lead.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#323232] transition-colors"
            >
              {/* Name */}
              <div className="flex-1 min-w-0">
                <p style={{ color: "#fff", fontSize: "12px" }} className="font-medium truncate">
                  {lead.name}
                </p>
              </div>

              {/* Date */}
              <span style={{ color: "#666", fontSize: "10px" }} className="w-16 text-center">
                {lead.date}
              </span>

              {/* Time */}
              <span style={{ color: "#666", fontSize: "10px" }} className="w-16 text-center">
                {lead.time}
              </span>

              {/* Status Badge */}
              <div className="w-20">
                <span
                  style={{ color: cfg.text, background: cfg.bg, borderColor: cfg.border }}
                  className="text-[9px] px-2 py-1 rounded border font-medium uppercase tracking-wide inline-block whitespace-nowrap"
                >
                  {cfg.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "0.5px solid #3a3a3a" }}>
        <span style={{ color: "#999", fontSize: "10px" }}>Próx. 30 dias</span>
        <span style={{ color: "#378ADD", fontSize: "11px", fontWeight: "600" }}>
          {leads.filter(l => l.status === "agendado").length} a agendar
        </span>
      </div>
    </div>
  );
}
