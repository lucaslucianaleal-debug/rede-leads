import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";

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
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireFirebaseUser(req);
    const clinicId = String(req.query.clinicId || "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const snap = await getAdminDb()
      .collection("clinics")
      .doc(clinicId)
      .collection("integrations")
      .doc("whatsappAgent")
      .get();

    if (!snap.exists) {
      return res.status(200).json({ configured: false, online: false, connected: false, qrCode: null });
    }

    const data = snap.data() || {};
    const lastSeenMs = Date.parse(String(data.lastSeenAt || ""));
    const online = Number.isFinite(lastSeenMs) && (Date.now() - lastSeenMs) < 10 * 60 * 1000;
    const connected = online && data.connected === true;
    const qrUpdatedMs = Date.parse(String(data.qrUpdatedAt || ""));
    const qrFresh = !connected && Number.isFinite(qrUpdatedMs) && (Date.now() - qrUpdatedMs) < 2 * 60 * 1000;

    return res.status(200).json({
      configured: true,
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
