import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { canonicalPhoneKey, cancelPendingForLead, processInboundEvent } from "../../../server/whatsappAgent.js";

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
    requireWhatsAppAgent(req);
    const body = req.body || {};
    const clinicId = String(body.clinicId || "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const phoneKey = canonicalPhoneKey(body.phone);
    if (!phoneKey) return res.status(200).json({ ok: true, skipped: true, reason: "unresolved_phone" });

    const db = getAdminDb();
    const contactRef = db.collection("clinics").doc(clinicId).collection("whatsappContacts").doc(phoneKey);
    const contactSnap = await contactRef.get();
    const messageId = String(body.messageId || "").trim();
    if (messageId && contactSnap.exists && contactSnap.data()?.lastInboundMessageId === messageId) {
      return res.status(200).json({ ok: true, skipped: true, reason: "duplicate_message" });
    }

    const result = await processInboundEvent(clinicId, body);

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
