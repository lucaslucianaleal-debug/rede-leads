import React, { useState } from "react";
import DiagnosticCard from "../commandcenter/DiagnosticCard";
import FunnelCard from "../commandcenter/FunnelCard";
import AutomationCard from "../commandcenter/AutomationCard";
import type { Diagnostic, FunnelData } from "@/types/commandCenter";
import { useLeads } from "@/hooks/useLeads";

interface OperationalLayerProps {
  diagnostics: Diagnostic[];
  funnel: FunnelData | null;
  onAction?: (actionId: string) => void;
}

// Collapsible section component
function Section({ title, badge, children, defaultOpen = true }: { title: string; badge?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge}
        </div>
        <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function OperationalLayer({ diagnostics, funnel, onAction }: OperationalLayerProps) {
  const { leads } = useLeads();

  // Derive performance data from leads
  const captadorMap = new Map<string, { resp: number; agend: number; comp: number }>();
  leads.forEach(l => {
    const key = l.captador || "(Sem responsável)";
    const cur = captadorMap.get(key) ?? { resp: 0, agend: 0, comp: 0 };
    cur.resp++;
    if (l.dataAgendamento) cur.agend++;
    if (l.comparecimento === "COMPARECEU") cur.comp++;
    captadorMap.set(key, cur);
  });
  const captadores = Array.from(captadorMap.entries())
    .sort((a, b) => b[1].resp - a[1].resp)
    .slice(0, 5);

  const maxResp = captadores[0]?.[1].resp || 1;

  // Source breakdown
  const sourceMap = new Map<string, { leads: number; agend: number; comp: number }>();
  leads.forEach(l => {
    const key = l.captador || "Não informado";
    const cur = sourceMap.get(key) ?? { leads: 0, agend: 0, comp: 0 };
    cur.leads++;
    if (l.dataAgendamento) cur.agend++;
    if (l.comparecimento === "COMPARECEU") cur.comp++;
    sourceMap.set(key, cur);
  });

  // top channels from leads data
  const channels = Array.from(sourceMap.entries())
    .map(([name, d]) => ({
      name,
      leads: d.leads,
      conv: d.leads > 0 ? Math.round((d.agend / d.leads) * 100) : 0,
      comp: d.agend > 0 ? Math.round((d.comp / d.agend) * 100) : 0,
    }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Zone 2 — Diagnóstico */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          ZONA 2 — O QUE FAZER AGORA
        </div>
        <DiagnosticCard diagnostics={diagnostics.slice(0, 4)} onAction={onAction} />
      </div>

      {/* Zone 4 — Análise (colapsável) */}
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
        ZONA 4 — ANÁLISE (EXPANDA QUANDO PRECISAR)
      </div>

      {/* Funil acumulado */}
      {funnel && (
        <Section title="Funil acumulado" defaultOpen={true}>
          <FunnelCard funnel={funnel} />
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Performance equipe */}
        <Section
          title="Performance da equipe"
          badge={<span className="text-xs text-muted-foreground">Lucas: 59% resp. • Julia: 27% resp.</span>}
          defaultOpen={false}
        >
          <div className="space-y-2 mt-2">
            {captadores.map(([name, d]) => {
              const barPct = Math.round((d.resp / maxResp) * 100);
              const conv = d.resp > 0 ? Math.round((d.agend / d.resp) * 100) : 0;
              return (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <span className="w-28 truncate text-muted-foreground">{name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${barPct}%` }} />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">{conv}%</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Performance por canal */}
        <Section title="Canais" defaultOpen={false}>
          <div className="space-y-2 mt-2">
            {channels.map(c => (
              <div key={c.name} className="flex items-center justify-between text-xs border-b border-border/30 pb-1.5">
                <span className="text-muted-foreground truncate w-28">{c.name}</span>
                <span className="text-foreground font-medium">{c.leads} leads</span>
                <span className={`font-bold ${c.conv >= 50 ? "text-emerald-400" : c.conv >= 30 ? "text-amber-400" : "text-red-400"}`}>{c.conv}% conv</span>
                <span className={`font-bold ${c.comp >= 50 ? "text-emerald-400" : "text-amber-400"}`}>{c.comp}% comp</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Automações */}
        <Section title="Automações" defaultOpen={false}>
          <AutomationCard />
        </Section>
      </div>
    </div>
  );
}
