import { useState, useEffect } from "react";
import { calculateChannelPerformance, calculateUnitRanking } from "@/services/firebaseQueries";

export function useOperationalMetrics() {
  const [channels, setChannels] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [channelsData, rankingData] = await Promise.all([
          calculateChannelPerformance("odontocompany-olimpia"),
          calculateUnitRanking(),
        ]);

        setChannels(channelsData);
        setRanking(rankingData);
      } catch (e) {
        console.error("Error loading operational metrics:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { channels, ranking, loading };
}
