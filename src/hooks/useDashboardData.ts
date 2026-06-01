import { useState, useEffect } from "react";
import type { KPI, Diagnostic, FunnelData, PeriodType } from "@/types/commandCenter";
import { calculateOperationalKPIs, generateOperationalDiagnostics, calculateFunnelData } from "@/services/firebaseQueries";

export function useDashboardData(period: PeriodType, clinicId = "odontocompany-olimpia") {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [kpisData, diagnosticsData, funnelData] = await Promise.all([
          calculateOperationalKPIs(clinicId),
          generateOperationalDiagnostics(clinicId),
          calculateFunnelData(clinicId),
        ]);

        setKpis(kpisData);
        setDiagnostics(diagnosticsData);
        setFunnel(funnelData);
      } catch (e) {
        console.error("Error loading dashboard data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period, clinicId]);

  return { kpis, diagnostics, funnel, loading };
}

