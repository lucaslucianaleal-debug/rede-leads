const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";
export const DEFAULT_RESULT_ACTION = "onsite_conversion.messaging_conversation_started_7d";

export function makeMetaError(message, code, status = 500, details) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (details !== undefined) err.details = details;
  return err;
}

export function normalizeAdAccountId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("act_") ? raw : `act_${raw.replace(/\D/g, "")}`;
}

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(campanha|anuncio|ads?|meta)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function toBrDate(isoDate) {
  if (!isoDate) return "";
  const [yyyy, mm, dd] = String(isoDate).slice(0, 10).split("-");
  return yyyy && mm && dd ? `${dd}/${mm}/${yyyy}` : "";
}

export function brToIsoDate(brDate) {
  const [dd, mm, yyyy] = String(brDate || "").split("/").map(Number);
  if (!dd || !mm || !yyyy) return null;
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function addDays(isoDate, amount) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

export function getDateInTimeZone(timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function earliestMetricDate(metrics) {
  const dates = (Array.isArray(metrics) ? metrics : [])
    .map((m) => brToIsoDate(m?.date)).filter(Boolean).sort();
  return dates[0] || null;
}

function actionValue(list, actionType) {
  if (!Array.isArray(list)) return 0;
  return Number(list.find((item) => item?.action_type === actionType)?.value || 0) || 0;
}

export function coreMetricHasData(metric) {
  return Number(metric.spend || 0) > 0 || Number(metric.impressions || 0) > 0 || Number(metric.clicks || 0) > 0 || Number(metric.reach || 0) > 0;
}

export function sortMetrics(metrics) {
  return [...metrics].sort((a, b) => (brToIsoDate(a?.date) || "").localeCompare(brToIsoDate(b?.date) || ""));
}

export function mergeMetaMetrics(existingMetrics, metaMetrics) {
  const map = new Map((Array.isArray(existingMetrics) ? existingMetrics : []).filter((m) => m?.date).map((m) => [m.date, m]));
  let added = 0, updated = 0, manualPreserved = 0;

  for (const incoming of metaMetrics) {
    if (!incoming?.date || !coreMetricHasData(incoming)) continue;
    const current = map.get(incoming.date);
    if (!current) {
      map.set(incoming.date, incoming);
      added += 1;
      continue;
    }
    if (current.source !== "meta" || current.manualOverride === true) {
      manualPreserved += 1;
      continue;
    }
    const changed = ["spend", "impressions", "clicks", "reach", "metaResults", "metaCostPerResult"]
      .some((field) => Number(current[field] || 0) !== Number(incoming[field] || 0));
    map.set(incoming.date, { ...current, ...incoming });
    if (changed) updated += 1;
  }
  return { metrics: sortMetrics([...map.values()]), added, updated, manualPreserved };
}

export async function graphGet(pathOrUrl, params, accessToken) {
  const url = /^https:\/\//i.test(pathOrUrl)
    ? new URL(pathOrUrl)
    : new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${String(pathOrUrl).replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw makeMetaError(payload?.error?.message || `Meta API HTTP ${response.status}`, "META_API_ERROR", response.status >= 400 && response.status < 500 ? 400 : 502, {
      metaCode: payload?.error?.code, metaSubcode: payload?.error?.error_subcode, type: payload?.error?.type,
    });
  }
  return payload;
}

export async function graphGetAll(path, params, accessToken) {
  const rows = [];
  let payload = await graphGet(path, params, accessToken);
  rows.push(...(payload?.data || []));
  let next = payload?.paging?.next;
  let pages = 0;
  while (next && pages < 20) {
    payload = await graphGet(next, {}, accessToken);
    rows.push(...(payload?.data || []));
    next = payload?.paging?.next;
    pages += 1;
  }
  return rows;
}

export async function fetchDailyInsights(adId, since, until, accessToken, resultActionType) {
  if (!since || !until || since > until) return [];
  const rows = await graphGetAll(`${adId}/insights`, {
    fields: "date_start,date_stop,spend,impressions,clicks,reach,actions,cost_per_action_type",
    time_range: JSON.stringify({ since, until }), time_increment: 1, limit: 500,
  }, accessToken);
  const syncedAt = new Date().toISOString();
  return rows.map((row) => ({
    date: toBrDate(row.date_start),
    spend: Number(row.spend || 0) || 0,
    impressions: Number(row.impressions || 0) || 0,
    clicks: Number(row.clicks || 0) || 0,
    reach: Number(row.reach || 0) || 0,
    metaResults: actionValue(row.actions, resultActionType),
    metaCostPerResult: actionValue(row.cost_per_action_type, resultActionType),
    source: "meta",
    syncedAt,
  }));
}
