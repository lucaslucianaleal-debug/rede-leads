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
  const stableId = messageDocId(messageId, direction);
  if (stableId) {
    msgRef = chatRef.collection("messages").doc(stableId);
    const duplicate = await msgRef.get();
    if (duplicate.exists) return { chatId: phoneKey, messageId: stableId, duplicate: true };
  } else {
    msgRef = chatRef.collection("messages").doc();
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