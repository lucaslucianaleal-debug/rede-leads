import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    requireWhatsAppAgent(req);
    const clinicId = String(req.query.clinicId || "").trim();
    const limit = Math.max(1, Math.min(Number(req.query.limit || 10) || 10, 20));
    const recover = String(req.query.recover || "") === "1";
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const db = getAdminDb();
    const col = db.collection("clinics").doc(clinicId).collection("whatsappQueue");
    const now = Date.now();

    if (recover) {
      const leasedSnap = await col.where("status", "==", "leased").limit(50).get();
      const stale = leasedSnap.docs.filter((doc) => {
        const expiresAt = Date.parse(String(doc.data()?.leaseExpiresAt || ""));
        return !Number.isFinite(expiresAt) || expiresAt <= now;
      });
      if (stale.length) {
        const recoveryBatch = db.batch();
        const nowIso = new Date().toISOString();
        stale.forEach((doc) => recoveryBatch.set(doc.ref, {
          status: "pending",
          leaseRecoveredAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true }));
        await recoveryBatch.commit();
      }
    }

    const snap = await col.where("status", "==", "pending").limit(limit).get();
    if (snap.empty) return res.status(200).json({ ok: true, items: [] });

    const leaseAt = new Date();
    const leaseExpiresAt = new Date(leaseAt.getTime() + 45 * 60 * 1000).toISOString();
    const batch = db.batch();
    const items = snap.docs.map((doc) => {
      const data = doc.data() || {};
      batch.set(doc.ref, {
        status: "leased",
        leasedAt: leaseAt.toISOString(),
        leaseExpiresAt,
        attempts: (Number(data.attempts || 0) || 0) + 1,
        updatedAt: leaseAt.toISOString(),
      }, { merge: true });
      return {
        id: doc.id,
        leadId: data.leadId || "",
        phone: data.phone || "",
        name: data.name || "",
        message: data.message || "",
        kind: data.kind || "manual",
      };
    });

    await batch.commit();
    return res.status(200).json({ ok: true, items });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/pull]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro" });
  }
}
