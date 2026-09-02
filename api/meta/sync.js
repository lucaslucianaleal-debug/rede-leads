import { getAdminAuth } from "../_lib/firebaseAdmin.js";
import { syncMetaForClinic } from "../_lib/metaSync.js";

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
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
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST" });
  }

  try {
    await requireFirebaseUser(req);
    const body = readBody(req);
    const clinicId = String(body.clinicId || req.query.clinicId || "").trim();
    const adAccountId = String(body.adAccountId || "").trim();

    const summary = await syncMetaForClinic({
      clinicId,
      adAccountId: adAccountId || undefined,
      persistConfig: true,
    });

    return res.status(200).json(summary);
  } catch (error) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
      ok: false,
      code: error?.code || "META_SYNC_FAILED",
      message: error?.message || "Erro ao sincronizar Meta Ads",
      details: error?.details,
    });
  }
}
