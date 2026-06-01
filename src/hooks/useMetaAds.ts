import { useState, useEffect } from "react";
import type { Campaign, MetaKPI } from "@/types/commandCenter";
import { MOCK_CAMPAIGNS, META_ADS_KPIS, META_ADS_DIAGNOSTICS } from "@/data/commandCenterMock";
import type { Diagnostic } from "@/types/commandCenter";

export function useMetaAds(unitId?: string) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [kpis, setKpis] = useState<MetaKPI[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      // TODO: Integrar com Firestore quando os dados de Meta Ads estiverem disponíveis
      // Por enquanto usando mock data
      setCampaigns(MOCK_CAMPAIGNS);
      setKpis(META_ADS_KPIS);
      setDiagnostics(META_ADS_DIAGNOSTICS);
      setLoading(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [unitId]);

  const totalLeads = campaigns.reduce((a, c) => a + c.leads, 0);
  const totalScheduled = campaigns.reduce((a, c) => a + c.scheduled, 0);
  const avgRoas = campaigns.filter(c => c.roas > 0).reduce((a, c, _, arr) => a + c.roas / arr.length, 0);
  const bestCampaign = [...campaigns].sort((a, b) => b.roas - a.roas)[0] ?? null;
  const worstCampaign = [...campaigns].filter(c => c.active).sort((a, b) => a.roas - b.roas)[0] ?? null;

  return { campaigns, kpis, diagnostics, loading, totalLeads, totalScheduled, avgRoas, bestCampaign, worstCampaign };
}
