import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { applySentQueueItem, findLeadIndex, markQueueFailure } from "../../../server/whatsappAgent.js";
import { recordWhatsAppChatMessage } from "../../../server/whatsappChatStore.js";

function automationMessageType(automationType) {
  if (automationType === "appointment_confirmation") return "Confirmação de agendamento";
  if (automationType === "appointment_reminder_24h") return "Lembrete • Amanhã";
  if (automationType === "appointment_reminder_today") return "Lembrete • Hoje";
  return "text";
}

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

    if (automationType === "appointment_reminder_24h") {
      nextLead.lembretes = {
        ...(lead.lembretes || {}),
        h24: true,
        sent: {
          ...(lead.lembretes?.sent || {}),
          "24h": nowIso,
        },
      };
    }

    if (automationType === "appointment_reminder_today") {
      nextLead.lembretes = {
        ...(lead.lembretes || {}),
        today: true,
        sent: {
          ...(lead.lembretes?.sent || {}),
          today: nowIso,
        },
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
      await recordWhatsAppChatMessage(clinicId, {
        phone: queue.phone,
        name: queue.name,
        leadId: queue.leadId,
        direction: "out",
        text: queue.message,
        messageType: automationMessageType(queue.automationType),
        messageId: body.messageId || "",
      });
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
