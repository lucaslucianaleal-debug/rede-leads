import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { canonicalPhoneKey, cancelPendingForLead, findLeadIndex, processInboundEvent } from "../../../server/whatsappAgent.js";
import { recordWhatsAppChatMessage } from "../../../server/whatsappChatStore.js";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isOptOutText(value) {
  const text = normalizeText(value);
  if (!text) return false;
  return ["pare", "parar", "sair", "stop", "remover", "nao quero", "nao tenho interesse", "não quero"]
    .some((term) => text === normalizeText(term) || text.includes(normalizeText(term)));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireWhatsAppAgent(req);
    const body = req.body || {};
    const clinicId = String(body.clinicId || "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const phoneKey = canonicalPhoneKey(body.phone);
    if (!phoneKey) return res.status(200).json({ ok: true, skipped: true, reason: "unresolved_phone" });

    const db = getAdminDb();
    const contactRef = db.collection("clinics").doc(clinicId).collection("whatsappContacts").doc(phoneKey);
    const messageId = String(body.messageId || "").trim();

    // Mensagens enviadas por qualquer aparelho vinculado (celular, Desktop ou Rede Leads)
    // entram na mesma caixa comercial. É 100% orientado a evento: não varremos histórico.
    if (String(body.direction || "").toLowerCase() === "out") {
      let leadId = "";
      let leadName = String(body.name || "").trim();
      try {
        const sharedSnap = await db.collection("clinics").doc(clinicId).collection("shared").doc("shared").get();
        const shared = sharedSnap.exists ? (sharedSnap.data() || {}) : {};
        const leads = Array.isArray(shared.leads) ? shared.leads : [];
        const index = findLeadIndex(leads, { phone: body.phone });
        if (index >= 0) {
          leadId = String(leads[index]?.id || "");
          leadName = String(leads[index]?.nome || leadName || "");
        }
      } catch (error) {
        console.warn("[whatsapp-agent/outbound] falha ao vincular lead:", error?.message || error);
      }

      const nowIso = new Date().toISOString();
      await contactRef.set({
        phoneKey,
        phone: body.phone,
        name: leadName,
        lastOutboundAt: nowIso,
        lastOutboundMessageId: messageId,
        updatedAt: nowIso,
      }, { merge: true });

      const chatResult = await recordWhatsAppChatMessage(clinicId, {
        phone: body.phone,
        name: leadName,
        leadId,
        direction: "out",
        text: body.text,
        messageType: body.messageType || "text",
        messageId,
        createdAt: body.createdAt || undefined,
      });

      return res.status(200).json({ ok: true, direction: "out", leadId, duplicate: chatResult?.duplicate === true });
    }

    const contactSnap = await contactRef.get();
    if (messageId && contactSnap.exists && contactSnap.data()?.lastInboundMessageId === messageId) {
      return res.status(200).json({ ok: true, skipped: true, reason: "duplicate_message" });
    }

    const result = await processInboundEvent(clinicId, body);

    await recordWhatsAppChatMessage(clinicId, {
      phone: body.phone,
      name: body.name,
      leadId: result?.leadId || "",
      direction: "in",
      text: body.text,
      messageType: body.messageType || "text",
      messageId: body.messageId || "",
      createdAt: body.createdAt || undefined,
    });

    if (isOptOutText(body.text)) {
      const nowIso = new Date().toISOString();
      await contactRef.set({ optOut: true, optOutAt: nowIso, updatedAt: nowIso }, { merge: true });
      if (result?.matched && result?.leadId) {
        await cancelPendingForLead(clinicId, result.leadId);
      }
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/inbound]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro" });
  }
}
