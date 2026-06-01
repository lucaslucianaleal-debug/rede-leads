import { useState, useEffect } from "react";
import type { KPI, Diagnostic, FunnelData, PeriodType } from "@/types/commandCenter";
import { calculateOperationalKPIs, generateOperationalDiagnostics, calculateFunnelData, generateHistoryData, fetchRecentLeads, calculateConsultorRanking } from "@/services/firebaseQueries";
import type { ConsultorStat } from "@/services/firebaseQueries";

export function useDashboardData(period: PeriodType, clinicId = "odontocompany-olimpia") {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [consultores, setConsultores] = useState<ConsultorStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [kpisData, diagnosticsData, funnelData, historyData, recentLeadsData, consultoresData] = await Promise.all([
          calculateOperationalKPIs(clinicId, period),
          generateOperationalDiagnostics(clinicId),
          calculateFunnelData(clinicId, period),
          generateHistoryData(clinicId, 7),
          fetchRecentLeads(clinicId, 8),
          calculateConsultorRanking(clinicId, period),
        ]);

        setKpis(kpisData);
        setDiagnostics(diagnosticsData);
        setFunnel(funnelData);
        setHistory(historyData);
        setRecentLeads(recentLeadsData);
        setConsultores(consultoresData);
      } catch (e) {
        console.error("Error loading dashboard data:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period, clinicId]);

  return { kpis, diagnostics, funnel, history, recentLeads, consultores, loading };
}

