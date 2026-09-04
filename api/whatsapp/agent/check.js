import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { findLeadIndex } from "../../../server/whatsappAgent.js";

function isAppointmentAutomation(value) {
  return [
    "appointment_confirmation",
    "appointment_reminder_24h",
    "appointment_reminder_today",
  ].includes(String(value || ""));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireWhatsAppAgent(req);
    const clinicId = String(req.query.clinicId || "").trim();
    const queueId = String(req.query.queueId || "").trim();
    if (!clinicId || !queueId) return res.status(400).json({ error: "clinicId e queueId obrigatórios" });

    const db = getAdminDb();
    const clinicRef = db.collection("clinics").doc(clinicId);
    const queueRef = clinicRef.collection("whatsappQueue").doc(queueId);
    const queueSnap = await queueRef.get();
    if (!queueSnap.exists) return res.status(404).json({ error: "Queue item not found" });

    const data = queueSnap.data() || {};
    let allowed = data.status === "leased";
    let reason = allowed ? "ok" : `status_${data.status || "unknown"}`;
    const now = Date.now();

    if (allowed) {
      const expiresAt = Date.parse(String(data.expiresAt || ""));
      if (Number.isFinite(expiresAt) && expiresAt <= now) {
        allowed = false;
        reason = "expired";
        const nowIso = new Date().toISOString();
        await queueRef.set({ status: "cancelled", cancelReason: reason, cancelledAt: nowIso, updatedAt: nowIso }, { merge: true });
      }
    }

    if (allowed && isAppointmentAutomation(data.automationType)) {
      const sharedSnap = await clinicRef.collection("shared").doc("shared").get();
      const shared = sharedSnap.exists ? (sharedSnap.data() || {}) : {};
      const leads = Array.isArray(shared.leads) ? shared.leads : [];
      const index = findLeadIndex(leads, { leadId: data.leadId, phone: data.phone });
      const lead = index >= 0 ? (leads[index] || {}) : null;
      const stage = String(lead?.etapaLead || "").toLowerCase();
      const invalid = !lead ||
        String(lead.dataAgendamento || "") !== String(data.appointmentValue || "") ||
        lead._deleted ||
        lead.lembretes?.disabled === true ||
        lead.comparecimento === "COMPARECEU" ||
        ["finalizado", "desistência", "desistencia", "fora da região", "fora da regiao"].includes(stage);

      if (invalid) {
        allowed = false;
        reason = "appointment_changed_or_closed";
        const nowIso = new Date().toISOString();
        await queueRef.set({ status: "cancelled", cancelReason: reason, cancelledAt: nowIso, updatedAt: nowIso }, { merge: true });
      }
    }

    if (allowed && data.phoneKey) {
      const contactSnap = await clinicRef.collection("whatsappContacts").doc(String(data.phoneKey)).get();
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
