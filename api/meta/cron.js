import { syncAllConfiguredMetaClinics } from "../../server/metaSync.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(503).json({ ok: false, code: "CRON_SECRET_MISSING" });
  }

  const authorization = String(req.headers.authorization || "");
  if (authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
  }

  try {
    const results = await syncAllConfiguredMetaClinics();
    return res.status(200).json({
      ok: results.every((item) => item.ok !== false),
      syncedAt: new Date().toISOString(),
      clinics: results,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      code: error?.code || "META_CRON_FAILED",
      message: error?.message || String(error),
    });
  }
}
