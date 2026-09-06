import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";

const KNOWN_TOP_UPS = {
  "751127997357262": {
    at: "2026-09-03T12:00:00-03:00",
    amount: 200,
    source: "meta_payment_history",
    transactionId: "28559209447100304-28533065296381387",
    legacyDetectionCutoff: Date.parse("2026-09-06T19:03:41Z"),
  },
};

function normalizeAdAccountId(value) {
  return String(value || "").replace(/^act_/, "").replace(/\D/g, "");
}

function withKnownTopUp(financial, adAccountId) {
  if (!financial) return financial;

  const known = KNOWN_TOP_UPS[normalizeAdAccountId(adAccountId)];
  if (!known) return financial;

  const detectedAt = Date.parse(String(financial.lastTopUpAt || ""));
  if (Number.isFinite(detectedAt) && detectedAt > known.legacyDetectionCutoff) {
    return {
      ...financial,
      lastTopUpSource: financial.lastTopUpSource || "balance_detection",
    };
  }

  return {
    ...financial,
    lastTopUpAt: known.at,
    lastTopUpAmount: known.amount,
    lastTopUpSource: known.source,
    lastTopUpTransactionId: known.transactionId,
  };
}

async function requireFirebaseUser(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    const err = new Error("Autenticação necessária");
    err.status = 401;
    err.code = "AUTH_REQUIRED";
    throw err;
  }
  const token = header.slice("Bearer ".length).trim();
  return getAdminAuth().verifyIdToken(token);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Use GET" });
  }

  try {
    await requireFirebaseUser(req);
    const clinicId = String(req.query.clinicId || "").trim();
    if (!clinicId) {
      return res.status(400).json({ ok: false, code: "CLINIC_ID_REQUIRED", message: "clinicId é obrigatório" });
    }

    const snap = await getAdminDb().collection("metaIntegrations").doc(clinicId).get();
    if (!snap.exists) {
      return res.status(200).json({ ok: true, configured: false, clinicId, financial: null, financeHistory: [], financeLastError: null });
    }

    const data = snap.data() || {};
    return res.status(200).json({
      ok: true,
      configured: Boolean(data.adAccountId),
      clinicId,
      adAccountId: data.adAccountId || "",
      accountName: data.accountName || "",
      timezone: data.timezone || "",
      lastSyncAt: data.lastSyncAt || null,
      financial: withKnownTopUp(data.financial || null, data.adAccountId || ""),
      financeLastError: data.financeLastError || null,
      financeHistory: Array.isArray(data.financeHistory) ? data.financeHistory.slice(-14) : [],
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
      ok: false,
      code: error?.code || "META_STATUS_FAILED",
      message: error?.message || "Erro ao consultar status do Meta Ads",
    });
  }
}
