import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { findLeadIndex } from "../../../server/whatsappAgent.js";

const CLINIC_AUTO_RECIPIENT_COOLDOWN_MS = 90 * 60 * 1000;

function isAppointmentAutomation(value) {
  return [
    "appointment_confirmation",
    "appointment_reminder_24h",
    "appointment_reminder_12h",
    "appointment_reminder_1h",
    // legado: pode existir em filas antigas; ainda validamos para cancelar com segurança
    "appointment_reminder_today",
  ].includes(String(value || ""));
}

function isClinicAgendaAutomaticMessage(data = {}) {
  const type = String(data.automationType || "");
  return String(data.createdBy || "") === "clinic-agenda-automation" || [
    "appointment_clinic_24h",
    "appointment_clinic_6h",
    "appointment_clinic_1h",
    "appointment_clinic_released",
  ].includes(type);
}

async function cancelQueueItem(queueRef, reason, extra = {}) {
  const nowIso = new Date().toISOString();
  await queueRef.set({
    status: "cancelled",
    cancelReason: reason,
    cancelledAt: nowIso,
    updatedAt: nowIso,
    ...extra,
  }, { merge: true });
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
        await cancelQueueItem(queueRef, reason);
      }
    }

    // Última trava antes do envio real da régua da Clínica.
    // Mesmo que um item já tenha sido enfileirado/leased, ele não sai se o usuário
    // pausou a automação. Mensagens manuais não passam por esta regra.
    if (allowed && isClinicAgendaAutomaticMessage(data)) {
      const settingsSnap = await clinicRef.collection("settings").doc("clinicAutomation").get();
      const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
      const automationPaused = !settingsSnap.exists || settings.paused !== false;

      if (automationPaused) {
        allowed = false;
        reason = "clinic_automation_paused_before_send";
        await cancelQueueItem(queueRef, reason);
      }
    }

    // Proteção anti-avalanche por destinatário: um mesmo telefone não recebe
    // dois automáticos da agenda em sequência. Se houve envio automático nos
    // últimos 90 minutos, o novo estágio é descartado (não fica represado para
    // disparar depois). Isso protege especialmente a retomada após uma pausa.
    if (allowed && data.phoneKey && isClinicAgendaAutomaticMessage(data)) {
      const samePhoneSnap = await clinicRef.collection("whatsappQueue")
        .where("phoneKey", "==", String(data.phoneKey))
        .limit(80)
        .get();

      const recentSent = samePhoneSnap.docs
        .filter((snapshotDoc) => snapshotDoc.id !== queueId)
        .map((snapshotDoc) => ({ id: snapshotDoc.id, data: snapshotDoc.data() || {} }))
        .filter((item) => isClinicAgendaAutomaticMessage(item.data) && String(item.data.status || "") === "sent")
        .map((item) => ({ ...item, sentAtMs: Date.parse(String(item.data.sentAt || item.data.updatedAt || "")) }))
        .filter((item) => Number.isFinite(item.sentAtMs) && now - item.sentAtMs < CLINIC_AUTO_RECIPIENT_COOLDOWN_MS)
        .sort((a, b) => b.sentAtMs - a.sentAtMs)[0];

      if (recentSent) {
        allowed = false;
        reason = "clinic_auto_recipient_cooldown";
        const cooldownUntil = new Date(recentSent.sentAtMs + CLINIC_AUTO_RECIPIENT_COOLDOWN_MS).toISOString();
        await cancelQueueItem(queueRef, reason, {
          blockedByQueueId: recentSent.id,
          cooldownUntil,
        });
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
        lead.comparecimento === "NÃO COMPARECEU" ||
        ["finalizado", "desistência", "desistencia", "fora da região", "fora da regiao"].includes(stage);

      if (invalid) {
        allowed = false;
        reason = "appointment_changed_or_closed";
        await cancelQueueItem(queueRef, reason);
      }
    }

    if (allowed && data.phoneKey) {
      const contactSnap = await clinicRef.collection("whatsappContacts").doc(String(data.phoneKey)).get();
      if (contactSnap.exists && contactSnap.data()?.optOut === true) {
        allowed = false;
        reason = "opt_out";
        await cancelQueueItem(queueRef, "opt_out");
      }
    }

    return res.status(200).json({ ok: true, allowed, reason });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/check]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro" });
  }
}
