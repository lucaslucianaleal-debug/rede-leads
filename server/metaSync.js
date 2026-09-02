import { getAdminDb } from "./firebaseAdmin.js";
import {
  DEFAULT_RESULT_ACTION, addDays, coreMetricHasData, earliestMetricDate, fetchDailyInsights,
  getDateInTimeZone, graphGet, graphGetAll, makeMetaError, mergeMetaMetrics,
  normalizeAdAccountId, normalizeName, sortMetrics, toBrDate,
} from "./metaApi.js";

const COLORS = ["#D4537E", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];
const LOOKBACK_DAYS = 7;
const FIRST_SYNC_MAX_DAYS = 180;

function colorForId(id) {
  const seed = Number(String(id || "0").replace(/\D/g, "").slice(-4) || 0);
  return COLORS[seed % COLORS.length];
}

function determineSinceDate(data, ad, timeZone) {
  const yesterday = addDays(getDateInTimeZone(timeZone), -1);
  if (data?.metaLastSyncAt) return addDays(yesterday, -(LOOKBACK_DAYS - 1));
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
    metaLastSyncAt: now,
  }, { merge: true });
  return merged;
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

  const account = await graphGet(adAccountId, { fields: "id,name,timezone_name,timezone_offset_hours_utc" }, accessToken);
  const timeZone = account?.timezone_name || "America/Sao_Paulo";
  const yesterday = addDays(getDateInTimeZone(timeZone), -1);
  const resultActionType = integration?.resultActionType || DEFAULT_RESULT_ACTION;
  const ads = await graphGetAll(`${adAccountId}/ads`, {
    fields: "id,name,status,effective_status,campaign_id,adset_id,created_time,updated_time", limit: 500,
  }, accessToken);

  const snap = await db.collection("clinics").doc(clinicId).collection("campaigns").get();
  const existing = snap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
  const lookups = makeLookups(existing, ads);
  const used = new Set();
  const summary = {
    ok: true, clinicId, adAccountId, accountName: account?.name || "", timezone: timeZone,
    adsFound: ads.length, activeAds: ads.filter((ad) => ad.effective_status === "ACTIVE").length,
    linkedExisting: 0, createdCampaigns: 0, skippedInactiveUnlinked: 0, skippedAmbiguous: 0, skippedDisabled: 0, ambiguousMatches: 0,
    metricsAdded: 0, metricsUpdated: 0, manualMetricsPreserved: 0, errors: [], syncedAt: new Date().toISOString(),
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
      lastSyncSummary: summary, updatedAt: summary.syncedAt, createdAt: integration?.createdAt || summary.syncedAt,
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
