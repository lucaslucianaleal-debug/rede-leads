import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    requireWhatsAppAgent(req);
    const body = req.body || {};
    const clinicId = String(body.clinicId || "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const nowIso = new Date().toISOString();
    await getAdminDb()
      .collection("clinics")
      .doc(clinicId)
      .collection("integrations")
      .doc("whatsappAgent")
      .set({
        connected: body.connected === true,
        lastSeenAt: nowIso,
        agentVersion: String(body.agentVersion || "v2").slice(0, 30),
        connectedPhone: String(body.connectedPhone || "").replace(/\D/g, "").slice(0, 15),
        lastError: body.lastError ? String(body.lastError).slice(0, 300) : null,
        updatedAt: nowIso,
      }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/heartbeat]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro" });
  }
}
