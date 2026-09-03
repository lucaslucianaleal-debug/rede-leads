import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    requireWhatsAppAgent(req);
    const clinicId = String(req.query.clinicId || "").trim();
    const queueId = String(req.query.queueId || "").trim();
    if (!clinicId || !queueId) return res.status(400).json({ error: "clinicId e queueId obrigatórios" });

    const db = getAdminDb();
    const queueRef = db.collection("clinics").doc(clinicId).collection("whatsappQueue").doc(queueId);
    const queueSnap = await queueRef.get();
    if (!queueSnap.exists) return res.status(404).json({ error: "Queue item not found" });

    const data = queueSnap.data() || {};
    let allowed = data.status === "leased";
    let reason = allowed ? "ok" : `status_${data.status || "unknown"}`;

    if (allowed && data.phoneKey) {
      const contactSnap = await db.collection("clinics").doc(clinicId).collection("whatsappContacts").doc(String(data.phoneKey)).get();
      if (contactSnap.exists && contactSnap.data()?.optOut === true) {
        allowed = false;
        reason = "opt_out";
        const nowIso = new Date().toISOString();
        await queueRef.set({ status: "cancelled", cancelReason: "opt_out", cancelledAt: nowIso, updatedAt: nowIso }, { merge: true });
      }
    }

    return res.status(200).json({ ok: true, allowed, reason });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/check]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro" });
  }
}
