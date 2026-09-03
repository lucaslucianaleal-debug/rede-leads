import { getAdminDb } from "./firebaseAdmin.js";
import {
  DEFAULT_RESULT_ACTION, addDays, coreMetricHasData, earliestMetricDate, fetchDailyInsights,
  getDateInTimeZone, graphGet, graphGetAll, makeMetaError, mergeMetaMetrics,
  normalizeAdAccountId, normalizeName, sortMetrics, toBrDate,
} from "./metaApi.js";

const COLORS = ["#D4537E", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];
const LOOKBACK_DAYS = 7;
const FIRST_SYNC_MAX_DAYS = 180;
const FINANCE_LOOKBACK_DAYS = 30;
const FINANCE_HISTORY_LIMIT = 60;
const META_METRIC_SCHEMA_VERSION = 2;

function colorForId(id) {
  const seed = Number(String(id || "0").replace(/\D/g, "").slice(-4) || 0);
  return COLORS[seed % COLORS.length];
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function round1(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10) / 10;
}

function minorUnitFactor(currency) {
  // A Marketing API devolve amount_spent/balance/spend_cap em unidades menores da moeda.
  // BRL, USD, EUR etc. usam centavos. Mantemos suporte para moedas sem casas decimais.
  const zeroDecimal = new Set(["CLP", "ISK", "JPY", "KRW", "PYG", "VND"]);
  return zeroDecimal.has(String(currency || "").toUpperCase()) ? 1 : 100;
}

function fromMetaMinorUnits(value, currency) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return roundMoney(numeric / minorUnitFactor(currency));
}

function daysBetweenIso(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const from = new Date(`${fromIso}T12:00:00Z`).getTime();
  const to = new Date(`${toIso}T12:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / 86400000));
}

function determineSinceDate(data, ad, timeZone) {
  const yesterday = addDays(getDateInTimeZone(timeZone), -1);
  // v2 corrige o campo legado `clicks` para representar conversas iniciadas.
  // Campanhas sincronizadas antes da v2 fazem uma única releitura completa para corrigir os dias Meta antigos.
  if (data?.metaLastSyncAt && Number(data?.metaMetricSchemaVersion || 0) >= META_METRIC_SCHEMA_VERSION) {
    return addDays(yesterday, -(LOOKBACK_DAYS - 1));
  }
  const floor = addDays(yesterday, -FIRST_SYNC_MAX_DAYS + 1);
  const candidates = [earliestMetricDate(data?.dailyMetrics), String(ad?.created_time || "").slice(0, 10)]
    .filter(Boolean).sort();
  const start = candidates[0] || addDays(yesterday, -89);
  return start < floor ? floor : start;
}

function makeLookups(existing, ads) {
  const byMetaId = new Map();
  const existingByName = new Map();
  const metaByName = new Map();
  for (const item of existing) {
    if (item.data?.metaObjectId) byMetaId.set(String(item.data.metaObjectId), item);
    const key = normalizeName(item.data?.name);
    if (key) existingByName.set(key, [...(existingByName.get(key) || []), item]);
  }
  for (const ad of ads) {
    const key = normalizeName(ad?.name);
    if (key) metaByName.set(key, [...(metaByName.get(key) || []), ad]);
  }
  return { byMetaId, existingByName, metaByName };
}

function initialMpcState(ad, dailyBudget = 0) {
  const now = new Date().toISOString();
  const cycleId = `cycle_meta_${ad.id}`;
  return {
    cycleId,
    cycle: {
      id: cycleId, startedAt: now, triggerType: "campaign_created",
      triggerNote: "Criada automaticamente a partir do Meta Ads", status: "aberto",
      recommendedDailyBudget: dailyBudget || 15, appliedDailyBudget: dailyBudget || undefined,
      executedInMeta: true, executedAt: now, adherenceStatus: "aderente", adherenceDiffPct: 0,
      investedAtStart: 0, reviewAfterSpend: 50, reviewAfterHours: 72,
    },
    event: {
      id: `event_meta_${ad.id}`, cycleId, type: "campaign_created", createdAt: now,
      title: "Campanha importada do Meta Ads", note: ad.name,
      payload: { metaAdId: ad.id, metaCampaignId: ad.campaign_id, metaAdSetId: ad.adset_id },
    },
  };
}

async function createFromAd(db, clinicId, adAccountId, ad, metrics) {
  const ref = db.collection("clinics").doc(clinicId).collection("campaigns").doc();
  const now = new Date().toISOString();
  const mpc = initialMpcState(ad, 0);
  await ref.set({
    name: ad.name || "Anúncio Meta", dateStart: toBrDate(String(ad.created_time || now).slice(0, 10)), dateEnd: "",
    budget: 0, dailyBudget: 0, lastBudgetChangeAt: "", scaleHistory: [], scaleCycleState: "idle",
    cycles: [mpc.cycle], events: [mpc.event], activeCycleId: mpc.cycleId,
    fundsAdded: 0, taxCost: 0, active: ad.effective_status === "ACTIVE", color: colorForId(ad.id),
    dailyMetrics: sortMetrics(metrics), clinicId, createdAt: now,
    metaObjectType: "ad", metaObjectId: String(ad.id), metaAdAccountId: adAccountId,
    metaCampaignId: String(ad.campaign_id || ""), metaAdSetId: String(ad.adset_id || ""), metaAdName: ad.name || "",
    metaStatus: ad.status || "", metaEffectiveStatus: ad.effective_status || "", metaSyncEnabled: true,
    metaCreatedBySync: true, metaMatchStrategy: "auto_created", metaLastSyncAt: now,
    metaMetricSchemaVersion: META_METRIC_SCHEMA_VERSION,
  });
  return ref.id;
}

async function updateLinked(item, adAccountId, ad, metaMetrics, matchStrategy) {
  const merged = mergeMetaMetrics(item.data.dailyMetrics || [], metaMetrics);
  const now = new Date().toISOString();
  await item.ref.set({
    dailyMetrics: merged.metrics, metaObjectType: "ad", metaObjectId: String(ad.id), metaAdAccountId: adAccountId,
    metaCampaignId: String(ad.campaign_id || ""), metaAdSetId: String(ad.adset_id || ""), metaAdName: ad.name || "",
    metaStatus: ad.status || "", metaEffectiveStatus: ad.effective_status || "",
    metaSyncEnabled: item.data.metaSyncEnabled !== false, metaMatchStrategy: item.data.metaMatchStrategy || matchStrategy,
    metaLastSyncAt: now, metaMetricSchemaVersion: META_METRIC_SCHEMA_VERSION,
  }, { merge: true });
  return merged;
}

async function buildFinancialSnapshot({ account, adAccountId, accessToken, timeZone, activeAds, integration }) {
  const today = getDateInTimeZone(timeZone);
  const yesterday = addDays(today, -1);
  const since = addDays(yesterday, -(FINANCE_LOOKBACK_DAYS - 1));
  const spendRows = await graphGetAll(`${adAccountId}/insights`, {
    fields: "date_start,date_stop,spend",
    time_range: JSON.stringify({ since, until: yesterday }),
    time_increment: 1,
    level: "account",
    limit: 500,
  }, accessToken);

  const spendByDate = new Map(
    spendRows.map((row) => [String(row.date_start || ""), Number(row.spend || 0) || 0])
  );
  const sortedSpendRows = [...spendByDate.entries()]
    .filter(([date]) => date)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const yesterdaySpend = roundMoney(spendByDate.get(yesterday) || 0);
  const last7CalendarDates = Array.from({ length: 7 }, (_, index) => addDays(yesterday, -(6 - index)));
  const avg7Calendar = roundMoney(
    last7CalendarDates.reduce((sum, date) => sum + (spendByDate.get(date) || 0), 0) / 7
  );
  const lastPositiveRows = sortedSpendRows.filter(([, spend]) => spend > 0).slice(-7);
  const avg7SpendDays = lastPositiveRows.length > 0
    ? roundMoney(lastPositiveRows.reduce((sum, [, spend]) => sum + spend, 0) / lastPositiveRows.length)
    : 0;
  const baselineDailySpend = avg7SpendDays || avg7Calendar;
  const lastSpendEntry = [...sortedSpendRows].reverse().find(([, spend]) => spend > 0);
  const lastSpendDate = lastSpendEntry?.[0] || null;
  const daysSinceSpend = lastSpendDate ? daysBetweenIso(lastSpendDate, today) : null;

  let zeroSpendStreak = 0;
  for (let offset = 0; offset < FINANCE_LOOKBACK_DAYS; offset += 1) {
    const date = addDays(yesterday, -offset);
    if ((spendByDate.get(date) || 0) > 0) break;
    zeroSpendStreak += 1;
  }

  const currency = String(account?.currency || "BRL").toUpperCase();
  const isPrepayAccount = account?.is_prepay_account === true || String(account?.is_prepay_account) === "true";
  const accountStatus = Number(account?.account_status || 0) || 0;
  const disableReason = Number(account?.disable_reason || 0) || 0;
  const amountSpent = fromMetaMinorUnits(account?.amount_spent, currency);
  const rawBalance = fromMetaMinorUnits(account?.balance, currency);
  const spendCap = fromMetaMinorUnits(account?.spend_cap, currency);
  const availableBalance = isPrepayAccount ? rawBalance : null;
  const remainingSpendCap = spendCap !== null && amountSpent !== null && spendCap > 0
    ? roundMoney(Math.max(spendCap - amountSpent, 0))
    : null;
  const autonomyDays = availableBalance !== null && baselineDailySpend > 0
    ? round1(Math.max(availableBalance, 0) / baselineDailySpend)
    : null;

  const previousHistory = Array.isArray(integration?.financeHistory) ? integration.financeHistory : [];
  const previousSnapshot = previousHistory.length > 0 ? previousHistory[previousHistory.length - 1] : null;
  let lastTopUpAt = integration?.financial?.lastTopUpAt || null;
  let lastTopUpAmount = Number(integration?.financial?.lastTopUpAmount || 0) || 0;
  let estimatedTopUp = 0;

  if (
    isPrepayAccount &&
    previousSnapshot &&
    typeof previousSnapshot.balance === "number" &&
    availableBalance !== null
  ) {
    const previousAmountSpent = typeof previousSnapshot.amountSpent === "number" ? previousSnapshot.amountSpent : amountSpent;
    const spendDelta = amountSpent !== null && previousAmountSpent !== null
      ? Math.max(amountSpent - previousAmountSpent, 0)
      : 0;
    estimatedTopUp = roundMoney(availableBalance - previousSnapshot.balance + spendDelta);
    if (estimatedTopUp >= 1) {
      lastTopUpAt = new Date().toISOString();
      lastTopUpAmount = estimatedTopUp;
    } else {
      estimatedTopUp = 0;
    }
  }

  let alertLevel = "ok";
  let alertCode = "FINANCE_OK";
  let alertMessage = "Conta Meta com entrega e verba sem alerta crítico.";

  if (accountStatus !== 1 || disableReason > 0) {
    alertLevel = "critical";
    alertCode = "ACCOUNT_NOT_ACTIVE";
    alertMessage = "A conta de anúncios não está em status ativo. Verifique cobrança e restrições na Meta.";
  } else if (activeAds > 0 && zeroSpendStreak >= 2) {
    alertLevel = "critical";
    alertCode = "ACTIVE_ADS_NO_SPEND";
    alertMessage = `Há anúncios ativos, mas a conta está ${zeroSpendStreak} dias completos sem gasto. Verifique saldo, pagamento ou entrega.`;
  } else if (isPrepayAccount && availableBalance !== null && availableBalance <= 0) {
    alertLevel = "critical";
    alertCode = "PREPAID_BALANCE_EMPTY";
    alertMessage = "Saldo pré-pago da Meta está zerado. Adicionar fundos antes de esperar nova entrega.";
  } else if (isPrepayAccount && autonomyDays !== null && autonomyDays <= 1.5) {
    alertLevel = "critical";
    alertCode = "LOW_AUTONOMY_CRITICAL";
    alertMessage = `Saldo cobre aproximadamente ${autonomyDays} dia(s) no ritmo recente de gasto.`;
  } else if (activeAds > 0 && yesterdaySpend <= 0) {
    alertLevel = "warning";
    alertCode = "NO_SPEND_YESTERDAY";
    alertMessage = "Há anúncios ativos, mas ontem não houve gasto. Validar entrega e situação financeira da conta.";
  } else if (isPrepayAccount && autonomyDays !== null && autonomyDays <= 3) {
    alertLevel = "warning";
    alertCode = "LOW_AUTONOMY_WARNING";
    alertMessage = `Saldo estimado para cerca de ${autonomyDays} dia(s). Planejar nova recarga.`;
  }

  const syncedAt = new Date().toISOString();
  const financial = {
    currency,
    accountStatus,
    accountStatusActive: accountStatus === 1,
    disableReason,
    isPrepayAccount,
    balance: availableBalance,
    rawBalance,
    amountSpent,
    spendCap,
    remainingSpendCap,
    yesterdaySpend,
    avg7CalendarSpend: avg7Calendar,
    avg7SpendDays,
    baselineDailySpend,
    autonomyDays,
    lastSpendDate,
    daysSinceSpend,
    zeroSpendStreak,
    activeAds,
    lastTopUpAt,
    lastTopUpAmount,
    estimatedTopUpDetected: estimatedTopUp,
    monitoringStartedAt: integration?.financial?.monitoringStartedAt || syncedAt,
    alertLevel,
    alertCode,
    alertMessage,
    syncedAt,
  };

  const historyEntry = {
    date: today,
    syncedAt,
    balance: availableBalance,
    rawBalance,
    amountSpent,
    yesterdaySpend,
    avg7SpendDays,
    autonomyDays,
    lastSpendDate,
    zeroSpendStreak,
    alertLevel,
    estimatedTopUpDetected: estimatedTopUp,
  };
  const historyWithoutToday = previousHistory.filter((item) => item?.date !== today);
  const financeHistory = [...historyWithoutToday, historyEntry].slice(-FINANCE_HISTORY_LIMIT);

  return { financial, financeHistory };
}

export async function syncMetaForClinic({ clinicId, adAccountId: requestedAdAccountId, persistConfig = true }) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) throw makeMetaError("META_ACCESS_TOKEN não configurado no servidor", "META_ACCESS_TOKEN_MISSING", 503);
  if (!clinicId) throw makeMetaError("clinicId é obrigatório", "CLINIC_ID_REQUIRED", 400);

  const db = getAdminDb();
  const integrationRef = db.collection("metaIntegrations").doc(clinicId);
  const integrationSnap = await integrationRef.get();
  const integration = integrationSnap.exists ? integrationSnap.data() : {};
  const adAccountId = normalizeAdAccountId(requestedAdAccountId || integration?.adAccountId);
  if (!adAccountId) throw makeMetaError("Conta de anúncios Meta ainda não vinculada", "META_ACCOUNT_NOT_CONFIGURED", 400);

  const account = await graphGet(adAccountId, {
    fields: "id,name,timezone_name,timezone_offset_hours_utc,currency,account_status,disable_reason,amount_spent,balance,spend_cap,is_prepay_account",
  }, accessToken);
  const timeZone = account?.timezone_name || "America/Sao_Paulo";
  const yesterday = addDays(getDateInTimeZone(timeZone), -1);
  const resultActionType = integration?.resultActionType || DEFAULT_RESULT_ACTION;
  const ads = await graphGetAll(`${adAccountId}/ads`, {
    fields: "id,name,status,effective_status,campaign_id,adset_id,created_time,updated_time", limit: 500,
  }, accessToken);
  const activeAdsCount = ads.filter((ad) => ad.effective_status === "ACTIVE").length;

  const financeState = await buildFinancialSnapshot({
    account,
    adAccountId,
    accessToken,
    timeZone,
    activeAds: activeAdsCount,
    integration,
  });

  const snap = await db.collection("clinics").doc(clinicId).collection("campaigns").get();
  const existing = snap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
  const lookups = makeLookups(existing, ads);
  const used = new Set();
  const summary = {
    ok: true, clinicId, adAccountId, accountName: account?.name || "", timezone: timeZone,
    adsFound: ads.length, activeAds: activeAdsCount,
    linkedExisting: 0, createdCampaigns: 0, skippedInactiveUnlinked: 0, skippedAmbiguous: 0, skippedDisabled: 0, ambiguousMatches: 0,
    metricsAdded: 0, metricsUpdated: 0, manualMetricsPreserved: 0, errors: [], syncedAt: new Date().toISOString(),
    finance: financeState.financial,
  };

  for (const ad of ads) {
    try {
      let matched = lookups.byMetaId.get(String(ad.id));
      let strategy = matched ? "meta_id" : "";
      let ambiguous = false;

      if (!matched) {
        const key = normalizeName(ad.name);
        const e = (lookups.existingByName.get(key) || []).filter((item) => !used.has(item.id));
        const m = lookups.metaByName.get(key) || [];
        if (key && e.length === 1 && m.length === 1) {
          matched = e[0];
          strategy = "normalized_name";
        } else if (e.length > 0 && m.length > 0) {
          ambiguous = true;
          summary.ambiguousMatches += 1;
        }
      }

      if (ambiguous) {
        summary.skippedAmbiguous += 1;
        continue;
      }
      if (matched?.data?.metaSyncEnabled === false) {
        summary.skippedDisabled += 1;
        continue;
      }
      if (!matched && ad.effective_status !== "ACTIVE") {
        summary.skippedInactiveUnlinked += 1;
        continue;
      }

      const since = determineSinceDate(matched?.data || {}, ad, timeZone);
      const metrics = await fetchDailyInsights(ad.id, since, yesterday, accessToken, resultActionType);
      if (matched) {
        used.add(matched.id);
        const merged = await updateLinked(matched, adAccountId, ad, metrics, strategy);
        summary.linkedExisting += 1;
        summary.metricsAdded += merged.added;
        summary.metricsUpdated += merged.updated;
        summary.manualMetricsPreserved += merged.manualPreserved;
      } else {
        const usable = metrics.filter(coreMetricHasData);
        await createFromAd(db, clinicId, adAccountId, ad, usable);
        summary.createdCampaigns += 1;
        summary.metricsAdded += usable.length;
      }
    } catch (error) {
      summary.errors.push({ adId: String(ad?.id || ""), adName: ad?.name || "", code: error?.code || "SYNC_AD_ERROR", message: error?.message || String(error) });
    }
  }

  if (persistConfig) {
    await integrationRef.set({
      clinicId, provider: "meta", adAccountId, accountName: account?.name || "", timezone: timeZone, enabled: true,
      resultActionType, graphVersion: process.env.META_GRAPH_VERSION || "v26.0", lastSyncAt: summary.syncedAt,
      lastSyncSummary: summary, financial: financeState.financial, financeHistory: financeState.financeHistory,
      updatedAt: summary.syncedAt, createdAt: integration?.createdAt || summary.syncedAt,
    }, { merge: true });
  }
  return summary;
}

export async function syncAllConfiguredMetaClinics() {
  const db = getAdminDb();
  const snapshot = await db.collection("metaIntegrations").where("enabled", "==", true).get();
  const results = [];
  for (const doc of snapshot.docs) {
    try {
      const data = doc.data();
      results.push(await syncMetaForClinic({ clinicId: data.clinicId || doc.id, adAccountId: data.adAccountId, persistConfig: true }));
    } catch (error) {
      results.push({ ok: false, clinicId: doc.id, code: error?.code || "META_SYNC_FAILED", message: error?.message || String(error) });
    }
  }
  return results;
}
