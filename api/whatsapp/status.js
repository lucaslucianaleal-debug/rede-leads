import crypto from "node:crypto";
import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";
import { hashWhatsAppAgentSecret } from "../../server/whatsappAgentAuth.js";

async function requireFirebaseUser(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
  const token = header.slice("Bearer ".length).trim();
  return getAdminAuth().verifyIdToken(token);
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await requireFirebaseUser(req);
    const clinicId = String(req.method === "POST" ? req.body?.clinicId : req.query.clinicId || "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const ref = getAdminDb()
      .collection("clinics")
      .doc(clinicId)
      .collection("integrations")
      .doc("whatsappAgent");

    if (req.method === "POST") {
      const action = String(req.body?.action || "pair").trim();
      if (action === "pair") {
        const secret = crypto.randomBytes(32).toString("base64url");
        const nowIso = new Date().toISOString();
        await ref.set({
          agentSecretHash: hashWhatsAppAgentSecret(secret),
          pairedAt: nowIso,
          pairedBy: user.uid,
          connected: false,
          connectedPhone: "",
          qrCode: null,
          qrUpdatedAt: null,
          lastError: null,
          updatedAt: nowIso,
        }, { merge: true });
        return res.status(200).json({ ok: true, agentSecret: secret });
      }

      if (action === "revoke") {
        const nowIso = new Date().toISOString();
        await ref.set({
          agentSecretHash: null,
          pairedAt: null,
          pairedBy: null,
          connected: false,
          connectedPhone: "",
          qrCode: null,
          qrUpdatedAt: null,
          updatedAt: nowIso,
        }, { merge: true });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: "Ação inválida" });
    }

    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(200).json({ configured: false, paired: false, online: false, connected: false, qrCode: null });
    }

    const data = snap.data() || {};
    const lastSeenMs = Date.parse(String(data.lastSeenAt || ""));
    const online = Number.isFinite(lastSeenMs) && (Date.now() - lastSeenMs) < 10 * 60 * 1000;
    const connected = online && data.connected === true;
    const qrUpdatedMs = Date.parse(String(data.qrUpdatedAt || ""));
    const qrFresh = !connected && Number.isFinite(qrUpdatedMs) && (Date.now() - qrUpdatedMs) < 2 * 60 * 1000;

    return res.status(200).json({
      configured: true,
      paired: !!data.agentSecretHash || !!String(process.env.WHATSAPP_AGENT_SECRET || "").trim(),
      online,
      connected,
      lastSeenAt: data.lastSeenAt || null,
      connectedPhone: data.connectedPhone || "",
      lastError: data.lastError || null,
      agentVersion: data.agentVersion || null,
      qrCode: qrFresh && typeof data.qrCode === "string" ? data.qrCode : null,
      qrUpdatedAt: qrFresh ? data.qrUpdatedAt || null : null,
    });
  } catch (error) {
    const status = error?.statusCode || (String(error?.code || "").includes("auth/") ? 401 : 500);
    console.error("[whatsapp-status]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : "Erro ao consultar agente" });
  }
}
