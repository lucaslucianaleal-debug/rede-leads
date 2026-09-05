import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { applySentQueueItem, findLeadIndex, markQueueFailure } from "../../../server/whatsappAgent.js";

async function markAppointmentAutomationSent(clinicId, queue, messageId) {
  const automationType = String(queue?.automationType || "");
  if (!automationType.startsWith("appointment_")) return false;

  const db = getAdminDb();
  const sharedRef = db.collection("clinics").doc(clinicId).collection("shared").doc("shared");
  const nowIso = new Date().toISOString();
  let updated = false;

  await db.runTransaction(async (tx) => {
    const sharedSnap = await tx.get(sharedRef);
    if (!sharedSnap.exists) return;
    const data = sharedSnap.data() || {};
    const leads = Array.isArray(data.leads) ? [...data.leads] : [];
    const index = findLeadIndex(leads, { leadId: queue.leadId, phone: queue.phone });
    if (index < 0) return;

    const lead = leads[index] || {};
    const nextLead = {
      ...lead,
      lastWhatsAppOutboundAt: nowIso,
      whatsappLastOutboundMessageId: messageId || "",
      whatsappLastOutboundSource: "local-agent",
    };

    if (automationType === "appointment_confirmation") {
      nextLead.appointmentConfirmationSentAt = nowIso;
      nextLead.appointmentConfirmationMessageId = messageId || "";
    }

    const reminderSlot = automationType === "appointment_reminder_24h"
      ? "24h"
      : automationType === "appointment_reminder_12h"
        ? "12h"
        : automationType === "appointment_reminder_1h"
          ? "1h"
          : automationType === "appointment_reminder_today"
            ? "today"
            : null;

    if (reminderSlot) {
      const sent = {
        ...(lead.lembretes?.sent || {}),
        [reminderSlot]: nowIso,
      };

      // Retrocompatibilidade: h24/today ainda são usados por partes antigas da interface.
      if (reminderSlot === "1h") sent["1h"] = nowIso;

      nextLead.lembretes = {
        ...(lead.lembretes || {}),
        h24: reminderSlot === "24h" ? true : Boolean(lead.lembretes?.h24),
        today: ["1h", "today"].includes(reminderSlot) ? true : Boolean(lead.lembretes?.today),
        sent,
      };
    }

    leads[index] = nextLead;
    tx.set(sharedRef, { leads, lastUpdated: nowIso }, { merge: true });
    updated = true;
  });

  return updated;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireWhatsAppAgent(req);
    const body = req.body || {};
    const clinicId = String(body.clinicId || "").trim();
    const queueId = String(body.queueId || "").trim();
    const statusValue = String(body.status || "").trim();
    if (!clinicId || !queueId) return res.status(400).json({ error: "clinicId e queueId obrigatórios" });

    if (statusValue === "sent") {
      const result = await applySentQueueItem(clinicId, queueId, { messageId: body.messageId || "" });
      const queue = result.queue || {};
      const appointmentLeadUpdated = await markAppointmentAutomationSent(clinicId, queue, body.messageId || "");

      // O histórico possui uma única fonte para mensagens enviadas: o evento
      // `message_create` do agente. O endpoint de resultado apenas confirma a fila
      // e atualiza o lead. Gravar aqui novamente criaria dois balões para um envio.
      return res.status(200).json({ ok: true, leadUpdated: result.leadUpdated || appointmentLeadUpdated });
    }

    if (statusValue === "failed") {
      await markQueueFailure(clinicId, queueId, body.error || "Falha no envio");
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "status inválido" });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/result]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro" });
  }
}
