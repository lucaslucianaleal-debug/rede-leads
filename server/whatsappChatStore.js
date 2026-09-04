import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin.js";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function canonicalPhoneKey(value) {
  let digits = digitsOnly(value);
  if (!digits) return null;
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === "9") {
    digits = `${digits.slice(0, 2)}${digits.slice(3)}`;
  }
  if (digits.length !== 10) return null;
  return `55${digits}`;
}

function whatsappPhone(value) {
  let digits = digitsOnly(value);
  if (!digits) return null;
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 13 ? digits : null;
}

function messageDocId(messageId, direction) {
  const raw = String(messageId || "").trim();
  if (!raw) return null;
  const digest = createHash("sha1").update(`${direction}:${raw}`).digest("hex");
  return `msg_${digest}`;
}

function operationDocId(operationId, direction) {
  const raw = String(operationId || "").trim();
  if (!raw) return null;
  const digest = createHash("sha1").update(`${direction}:operation:${raw}`).digest("hex");
  return `op_${digest}`;
}

function messageFingerprint(direction, text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return "";
  return createHash("sha1").update(`${direction}:${normalized}`).digest("hex");
}

function ackToStatus(ack) {
  const value = Number(ack);
  if (value < 0) return "failed";
  if (value === 0) return "pending";
  if (value === 1) return "sent";
  if (value === 2) return "delivered";
  if (value === 3) return "read";
  if (value >= 4) return "played";
  return "sent";
}

export async function recordWhatsAppChatMessage(clinicId, payload = {}) {
  const db = getAdminDb();
  const phone = whatsappPhone(payload.phone);
  const phoneKey = canonicalPhoneKey(payload.phone);
  if (!clinicId || !phone || !phoneKey) return null;

  const direction = payload.direction === "out" ? "out" : "in";
  const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date();
  const createdAtIso = createdAt.toISOString();
  const messageType = String(payload.messageType || "text").slice(0, 40);
  const text = String(payload.text || "").trim().slice(0, 4000) || (
    messageType === "audio" ? "🎤 Áudio" :
    messageType === "image" ? "📷 Imagem" :
    messageType === "video" ? "🎬 Vídeo" :
    messageType === "document" ? "📄 Documento" :
    `Mensagem (${messageType})`
  );
  const name = String(payload.name || "").trim().slice(0, 150);
  const leadId = String(payload.leadId || "").trim();
  const messageId = String(payload.messageId || "").trim();
  const operationId = String(payload.operationId || "").trim();
  const metaCampanhaId = String(payload.metaCampanhaId || "").trim();
  const metaCampanhaNome = String(payload.metaCampanhaNome || "").trim().slice(0, 200);
  const fonteLead = String(payload.fonteLead || "").trim().slice(0, 80);
  const metaReferralHeadline = String(payload.metaReferralHeadline || "").trim().slice(0, 300);
  const metaReferralBody = String(payload.metaReferralBody || "").trim().slice(0, 1000);
  const metaGreetingMessageBody = String(payload.metaGreetingMessageBody || "").trim().slice(0, 1000);
  const metaSourceApp = String(payload.metaSourceApp || "").trim().slice(0, 40);
  const metaContainsAutoReply = payload.metaContainsAutoReply === true;
  const metaAutomatedGreetingShown = payload.metaAutomatedGreetingShown === true;

  const chatRef = db.collection("clinics").doc(clinicId).collection("whatsappChats").doc(phoneKey);
  const existing = await chatRef.get();
  const existingData = existing.exists ? (existing.data() || {}) : {};
  const resolvedName = name || String(existingData.name || "");
  const resolvedLeadId = leadId || String(existingData.leadId || "");

  let msgRef;
  // O ID do próprio WhatsApp permanece como chave principal para que os ACKs
  // atualizem exatamente o mesmo documento. O ID da operação é só o fallback
  // para eventos sem identificador nativo.
  const stableId = messageDocId(messageId, direction) || operationDocId(operationId, direction);
  if (stableId) {
    msgRef = chatRef.collection("messages").doc(stableId);
    const [duplicate, deletion] = await Promise.all([
      msgRef.get(),
      chatRef.collection("messageDeletions").doc(stableId).get(),
    ]);
    if (deletion.exists) {
      return { chatId: phoneKey, messageId: stableId, duplicate: true, deleted: true };
    }
    if (duplicate.exists) {
      // message_create pode registrar a saída antes do endpoint de resultado da fila.
      // Se o resultado trouxer uma etiqueta de automação, enriquecemos o mesmo documento
      // em vez de criar outra mensagem ou perder a identificação visual.
      if (messageType !== "text") {
        const batch = db.batch();
        batch.set(msgRef, { messageType }, { merge: true });
        if (String(existingData.lastMessageId || "") === messageId) {
          batch.set(chatRef, { lastMessageType: messageType, updatedAt: new Date().toISOString() }, { merge: true });
        }
        await batch.commit();
      }
      return { chatId: phoneKey, messageId: stableId, duplicate: true };
    }
  } else {
    msgRef = chatRef.collection("messages").doc();
  }

  const fingerprint = messageFingerprint(direction, text);
  const lastFingerprint = String(existingData.lastMessageFingerprint || "") || messageFingerprint(existingData.lastDirection, existingData.lastMessage);
  const previousAt = Date.parse(String(existingData.lastMessageAt || ""));
  const currentAt = createdAt.getTime();
  const isCloseDuplicate = Boolean(
    fingerprint &&
    fingerprint === lastFingerprint &&
    Number.isFinite(previousAt) &&
    Math.abs(currentAt - previousAt) <= 30000 &&
    existingData.lastMessageDocId
  );

  if (isCloseDuplicate) {
    const previousRef = chatRef.collection("messages").doc(String(existingData.lastMessageDocId));
    const updates = {
      status: direction === "out" ? "sent" : "received",
      ...(messageType !== "text" ? { messageType } : {}),
      ...(messageId ? { messageId } : {}),
      ...(operationId ? { operationId } : {}),
    };
    await previousRef.set(updates, { merge: true });
    return { chatId: phoneKey, messageId: previousRef.id, duplicate: true };
  }

  const batch = db.batch();
  const initialStatus = direction === "out" ? "sent" : "received";
  const chatPayload = {
    phone,
    phoneKey,
    name: resolvedName,
    leadId: resolvedLeadId,
    lastMessage: text.slice(0, 300),
    lastMessageAt: createdAtIso,
    lastDirection: direction,
    lastMessageType: messageType,
    lastMessageId: messageId,
    lastMessageDocId: msgRef.id,
    lastMessageFingerprint: fingerprint,
    lastMessageStatus: initialStatus,
    updatedAt: createdAtIso,
  };
  if (metaCampanhaId) chatPayload.metaCampanhaId = metaCampanhaId;
  if (metaCampanhaNome) chatPayload.metaCampanhaNome = metaCampanhaNome;
  if (fonteLead) chatPayload.fonteLead = fonteLead;
  if (metaReferralHeadline) chatPayload.metaReferralHeadline = metaReferralHeadline;
  if (metaReferralBody) chatPayload.metaReferralBody = metaReferralBody;
  if (metaGreetingMessageBody) chatPayload.metaGreetingMessageBody = metaGreetingMessageBody;
  if (metaSourceApp) chatPayload.metaSourceApp = metaSourceApp;
  if (metaContainsAutoReply) chatPayload.metaContainsAutoReply = true;
  if (metaAutomatedGreetingShown) chatPayload.metaAutomatedGreetingShown = true;
  if (direction === "in") chatPayload.unreadCount = FieldValue.increment(1);
  else if (!existing.exists) chatPayload.unreadCount = 0;

  batch.set(chatRef, chatPayload, { merge: true });
  batch.set(msgRef, {
    phone,
    phoneKey,
    leadId: resolvedLeadId,
    name: resolvedName,
    direction,
    text,
    messageType,
    messageId,
    operationId,
    status: initialStatus,
    createdAt: createdAtIso,
  }, { merge: true });
  await batch.commit();

  return { chatId: phoneKey, messageId: msgRef.id, duplicate: false };
}

export async function updateWhatsAppMessageStatus(clinicId, payload = {}) {
  const db = getAdminDb();
  const phoneKey = canonicalPhoneKey(payload.phone);
  const messageId = String(payload.messageId || "").trim();
  if (!clinicId || !phoneKey || !messageId) return { updated: false };

  const stableId = messageDocId(messageId, "out");
  if (!stableId) return { updated: false };

  const status = ackToStatus(payload.ack);
  const chatRef = db.collection("clinics").doc(clinicId).collection("whatsappChats").doc(phoneKey);
  const msgRef = chatRef.collection("messages").doc(stableId);
  const chatSnap = await chatRef.get();
  const chat = chatSnap.exists ? (chatSnap.data() || {}) : {};
  const nowIso = new Date().toISOString();

  const batch = db.batch();
  batch.set(msgRef, { status, ack: Number(payload.ack), statusUpdatedAt: nowIso }, { merge: true });
  if (String(chat.lastMessageId || "") === messageId) {
    batch.set(chatRef, { lastMessageStatus: status, updatedAt: nowIso }, { merge: true });
  }
  await batch.commit();
  return { updated: true, status };
}

export async function markWhatsAppChatRead(clinicId, chatId) {
  const ref = getAdminDb().collection("clinics").doc(clinicId).collection("whatsappChats").doc(String(chatId));
  await ref.set({ unreadCount: 0, readAt: new Date().toISOString() }, { merge: true });
}
