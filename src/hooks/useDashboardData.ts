import { useState, useEffect } from "react";
import type { KPI, Diagnostic, FunnelData, PeriodType } from "@/types/commandCenter";
import { KPI_BRIEFING, MOCK_DIAGNOSTICS, MOCK_FUNNEL } from "@/data/commandCenterMock";

export function useDashboardData(period: PeriodType) {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    // Simula latência de API; trocar por chamada real quando disponível
    const timer = setTimeout(() => {
      setKpis(KPI_BRIEFING);
      setDiagnostics(MOCK_DIAGNOSTICS);
      setFunnel(MOCK_FUNNEL);
      setLoading(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [period]);

  return { kpis, diagnostics, funnel, loading };
}

