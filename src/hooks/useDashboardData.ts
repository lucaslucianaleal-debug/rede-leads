import { useState, useEffect } from "react";
import type { KPI, Diagnostic, FunnelData, LayerType, PeriodType } from "@/types/commandCenter";
import { MOCK_KPIS, MOCK_DIAGNOSTICS, MOCK_FUNNEL } from "@/data/commandCenterMock";

export function useDashboardData(layer: LayerType, period: PeriodType) {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    // Simula latência de API; trocar por chamada real quando disponível
    const timer = setTimeout(() => {
      setKpis(MOCK_KPIS[layer]?.[period] ?? []);
      setDiagnostics(MOCK_DIAGNOSTICS[layer] ?? []);
      setFunnel(layer === "ops" ? MOCK_FUNNEL : null);
      setLoading(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [layer, period]);

  return { kpis, diagnostics, funnel, loading };
}
