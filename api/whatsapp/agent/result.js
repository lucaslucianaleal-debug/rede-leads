import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { applySentQueueItem, markQueueFailure } from "../../../server/whatsappAgent.js";
import { recordWhatsAppChatMessage } from "../../../server/whatsappChatStore.js";

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
      await recordWhatsAppChatMessage(clinicId, {
        phone: queue.phone,
        name: queue.name,
        leadId: queue.leadId,
        direction: "out",
        text: queue.message,
        messageType: "text",
        messageId: body.messageId || "",
      });
      return res.status(200).json({ ok: true, leadUpdated: result.leadUpdated });
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
