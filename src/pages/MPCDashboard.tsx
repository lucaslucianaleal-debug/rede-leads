import React from "react";
import { useMPCDashboardData } from "@/hooks/useMPCDashboardData";
import MPCDashboard from "@/components/crm/MPCDashboard";

export default function MPCDashboardPage() {
  const { data, isLoading } = useMPCDashboardData("odontocompany-olimpia");

  return <MPCDashboard data={data} isLoading={isLoading} />;
}
