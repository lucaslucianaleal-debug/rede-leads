import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

export type MetaFinanceAlertLevel = "ok" | "warning" | "critical";

export interface MetaFinancialSnapshot {
  currency: string;
  accountStatus: number;
  accountStatusActive: boolean;
  disableReason: number;
  isPrepayAccount: boolean;
  balance: number | null;
  rawBalance: number | null;
  amountSpent: number | null;
  spendCap: number | null;
  remainingSpendCap: number | null;
  yesterdaySpend: number;
  avg7CalendarSpend: number;
  avg7SpendDays: number;
  baselineDailySpend: number;
  autonomyDays: number | null;
  lastSpendDate: string | null;
  daysSinceSpend: number | null;
  zeroSpendStreak: number;
  activeAds: number;
  lastTopUpAt: string | null;
  lastTopUpAmount: number;
  estimatedTopUpDetected: number;
  monitoringStartedAt: string;
  alertLevel: MetaFinanceAlertLevel;
  alertCode: string;
  alertMessage: string;
  syncedAt: string;
}

export interface MetaFinanceError {
  code?: string;
  message?: string;
  syncedAt?: string;
}

export interface MetaFinanceStatus {
  configured: boolean;
  clinicId: string;
  adAccountId?: string;
  accountName?: string;
  timezone?: string;
  lastSyncAt?: string | null;
  financial: MetaFinancialSnapshot | null;
  financeLastError?: MetaFinanceError | null;
  financeHistory?: Array<{
    date: string;
    syncedAt: string;
    balance: number | null;
    yesterdaySpend: number;
    autonomyDays: number | null;
    alertLevel: MetaFinanceAlertLevel;
  }>;
}

export function useMetaFinance(clinicId: string) {
  const [metaFinance, setMetaFinance] = useState<MetaFinanceStatus | null>(null);
  const [metaFinanceLoading, setMetaFinanceLoading] = useState(false);
  const [metaFinanceError, setMetaFinanceError] = useState<string | null>(null);

  const refreshMetaFinance = useCallback(async () => {
    if (!clinicId) return;
    setMetaFinanceLoading(true);
    try {
      if (typeof auth.authStateReady === "function") await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) {
        setMetaFinanceError("Sessão não disponível para consultar o financeiro da Meta.");
        return;
      }
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/meta/status?clinicId=${encodeURIComponent(clinicId)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Falha ao consultar financeiro Meta");
      setMetaFinance(payload as MetaFinanceStatus);
      setMetaFinanceError(null);
    } catch (error) {
      console.error("Meta finance status error:", error);
      setMetaFinanceError(error instanceof Error ? error.message : "Falha ao consultar financeiro Meta");
    } finally {
      setMetaFinanceLoading(false);
    }
  }, [clinicId]);

  useEffect(() => {
    refreshMetaFinance();
  }, [refreshMetaFinance]);

  return { metaFinance, metaFinanceLoading, metaFinanceError, refreshMetaFinance };
}
