import { useState, useEffect } from "react";
import type { KPI, Diagnostic, FunnelData, PeriodType } from "@/types/commandCenter";
import { calculateOperationalKPIs, generateOperationalDiagnostics, calculateFunnelData, generateHistoryData, fetchRecentLeads } from "@/services/firebaseQueries";

export function useDashboardData(period: PeriodType, clinicId = "odontocompany-olimpia") {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [kpisData, diagnosticsData, funnelData, historyData, recentLeadsData] = await Promise.all([
          calculateOperationalKPIs(clinicId, period),
          generateOperationalDiagnostics(clinicId),
          calculateFunnelData(clinicId),
          generateHistoryData(clinicId, 7),
          fetchRecentLeads(clinicId, 8),
        ]);

        setKpis(kpisData);
        setDiagnostics(diagnosticsData);
        setFunnel(funnelData);
        setHistory(historyData);
        setRecentLeads(recentLeadsData);
      } catch (e) {
        console.error("Error loading dashboard data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period, clinicId]);

  return { kpis, diagnostics, funnel, history, recentLeads, loading };
}

