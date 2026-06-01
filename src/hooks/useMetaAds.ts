import { useState, useEffect } from "react";
import type { Campaign, MetaKPI } from "@/types/commandCenter";
import { MOCK_CAMPAIGNS, META_ADS_KPIS, META_ADS_DIAGNOSTICS } from "@/data/commandCenterMock";

export function useMetaAds(unitId?: string) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [kpis, setKpis] = useState<MetaKPI[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      // Futuramente: chamada para /api/meta-ads/campaigns?unitId=...
      setCampaigns(MOCK_CAMPAIGNS);
      setKpis(META_ADS_KPIS);
      setLoading(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [unitId]);

  const totalLeads = campaigns.reduce((a, c) => a + c.leads, 0);
  const totalScheduled = campaigns.reduce((a, c) => a + c.scheduled, 0);
  const avgRoas = campaigns.filter(c => c.roas > 0).reduce((a, c, _, arr) => a + c.roas / arr.length, 0);
  const bestCampaign = [...campaigns].sort((a, b) => b.roas - a.roas)[0] ?? null;
  const worstCampaign = [...campaigns].filter(c => c.active).sort((a, b) => a.roas - b.roas)[0] ?? null;
  const diagnostics = META_ADS_DIAGNOSTICS;

  return { campaigns, kpis, diagnostics, loading, totalLeads, totalScheduled, avgRoas, bestCampaign, worstCampaign };
}
