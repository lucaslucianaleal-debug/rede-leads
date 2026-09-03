import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { canonicalPhoneKey, cancelPendingForLead, processInboundEvent } from "../../../server/whatsappAgent.js";
import { isIgnoredWhatsAppMessageType, recordWhatsAppChatMessage, recordWhatsAppHistoryBatch } from "../../../server/whatsappChatStore.js";

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

async function listKnownLeadPhones(clinicId) {
  const db = getAdminDb();
  const sharedSnap = await db.collection("clinics").doc(clinicId).collection("shared").doc("shared").get();
  const leads = sharedSnap.exists && Array.isArray(sharedSnap.data()?.leads) ? sharedSnap.data().leads : [];
  const byPhone = new Map();

  for (const lead of leads) {
    if (lead?._deleted) continue;
    const phoneKey = canonicalPhoneKey(lead?.telefone);
    if (!phoneKey || byPhone.has(phoneKey)) continue;
    byPhone.set(phoneKey, {
      phoneKey,
      phone: String(lead?.telefone || ""),
      leadId: String(lead?.id || ""),
      name: String(lead?.nome || "").slice(0, 150),
    });
  }

  return [...byPhone.values()];
}

export default async function handler(req, res) {
  try {
    await requireWhatsAppAgent(req);
    const clinicId = String(req.method === "GET" ? req.query?.clinicId : req.body?.clinicId || "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    if (req.method === "GET") {
      if (String(req.query?.mode || "") !== "known-phones") {
        return res.status(400).json({ error: "mode inválido" });
      }
      const items = await listKnownLeadPhones(clinicId);
      return res.status(200).json({ ok: true, items });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = req.body || {};

    if (body.event === "history-batch") {
      const result = await recordWhatsAppHistoryBatch(clinicId, body.messages || []);
      return res.status(200).json({ ok: true, ...result });
    }

    const messageType = String(body.messageType || "text").toLowerCase();
    if (isIgnoredWhatsAppMessageType(messageType)) {
      return res.status(200).json({ ok: true, skipped: true, reason: "system_message" });
    }

    if (body.event === "outbound") {
      const known = await listKnownLeadPhones(clinicId);
      const phoneKey = canonicalPhoneKey(body.phone);
      const lead = known.find((item) => item.phoneKey === phoneKey);
      await recordWhatsAppChatMessage(clinicId, {
        phone: body.phone,
        name: lead?.name || body.name,
        leadId: lead?.leadId || "",
        direction: "out",
        text: body.text,
        messageType,
        messageId: body.messageId || "",
        createdAt: body.createdAt,
      });
      return res.status(200).json({ ok: true, matched: !!lead, leadId: lead?.leadId || "" });
    }

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

    await recordWhatsAppChatMessage(clinicId, {
      phone: body.phone,
      name: body.name,
      leadId: result?.leadId || "",
      direction: "in",
      text: body.text,
      messageType,
      messageId: body.messageId || "",
      createdAt: body.createdAt,
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
