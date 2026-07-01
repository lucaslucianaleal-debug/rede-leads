import React from "react";
import { useMPCDashboardData } from "@/hooks/useMPCDashboardData";
import MPCDashboard from "@/components/crm/MPCDashboard";

export default function MPCDashboardDemo() {
  const clinicId = "demo";
  // Force demo mode by providing mock data
  const { data, isLoading } = useMPCDashboardData(clinicId);

  return <MPCDashboard data={data} isLoading={isLoading} clinicId={clinicId} />;
}
