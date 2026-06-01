import React from "react";
import type { Diagnostic } from "@/types/commandCenter";
import { useWhatsApp } from "@/hooks/useWhatsApp";
import DiagnosticCard from "../commandcenter/DiagnosticCard";
import ConversationCard from "../commandcenter/ConversationCard";

interface WhatsAppLayerProps {
  diagnostics: Diagnostic[];
  unit?: string;
  onAction?: (actionId: string) => void;
}

export default function WhatsAppLayer({ diagnostics, unit, onAction }: WhatsAppLayerProps) {
  const { messages, metrics, pending, automated } = useWhatsApp(unit);

  return (
    <div className="space-y-4">
      {/* Métricas WA */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`rounded-xl border p-3 ${pending.length >= 5 ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Aguardando resposta</p>
          <p className={`text-2xl font-bold mt-1 ${pending.length >= 5 ? "text-red-400" : "text-emerald-400"}`}>{pending.length}</p>
          <p className="text-[10px] text-muted-foreground">+24h parados</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tempo resp. médio</p>
          <p className="text-2xl font-bold mt-1">{metrics?.averageResponseTime ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">meta: 5min</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Automáticas hoje</p>
          <p className="text-2xl font-bold mt-1">{automated.length}</p>
          <p className="text-[10px] text-muted-foreground">{metrics?.automatedPercentage ?? "—"} do total</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Taxa de resposta</p>
          <p className="text-2xl font-bold mt-1">{metrics?.responseRate ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">leads que respondem</p>
        </div>
      </div>

      {/* Diagnóstico WA */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          ALERTAS WHATSAPP
        </div>
        <DiagnosticCard diagnostics={diagnostics.slice(0, 4)} onAction={onAction} />
      </div>

      {/* Tempo de resposta por campanha */}
      <div className="rounded-xl border border-border/50 bg-card p-4">
        <h4 className="text-sm font-semibold mb-3">Tempo de resposta por canal</h4>
        <div className="space-y-2">
          {[
            { name: "Promotora Campo", time: 2, color: "bg-emerald-500" },
            { name: "Indicação", time: 3, color: "bg-emerald-500" },
            { name: "Online / Meta", time: 4, color: "bg-emerald-500" },
            { name: "Google Ads", time: 18, color: "bg-amber-500" },
            { name: "Sorteio Rádio", time: 42, color: "bg-red-500" },
          ].map(r => (
            <div key={r.name} className="flex items-center gap-3 text-xs">
              <span className="w-32 truncate text-muted-foreground">{r.name}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${r.color}`} style={{ width: `${Math.min((r.time / 60) * 100, 100)}%` }} />
              </div>
              <span className={`w-12 text-right font-medium ${r.time <= 5 ? "text-emerald-400" : r.time <= 15 ? "text-amber-400" : "text-red-400"}`}>{r.time}min</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">Meta: responder em até 5min para máxima conversão</p>
      </div>

      {/* Conversas */}
      <ConversationCard messages={messages} />

      {/* Nota de integração */}
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-sm text-green-300">
        <strong>Integração WhatsApp</strong>: conecte via Meta Cloud API para receber conversas em tempo real.
        As mensagens dos pacientes continuam aparecendo no WhatsApp deles normalmente.
      </div>
    </div>
  );
}
