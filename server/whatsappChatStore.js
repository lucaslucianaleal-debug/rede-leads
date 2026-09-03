import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin.js";
import { canonicalPhoneKey, whatsappPhone } from "./whatsappAgent.js";

function messageDocId(messageId, direction) {
  const raw = String(messageId || "").trim();
  if (!raw) return null;
  const digest = createHash("sha1").update(`${direction}:${raw}`).digest("hex");
  return `msg_${digest}`;
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
  const chatPayload = {
    phone,
    phoneKey,
    name: resolvedName,
    leadId: resolvedLeadId,
    lastMessage: text.slice(0, 300),
    lastMessageAt: createdAtIso,
    lastDirection: direction,
    lastMessageType: messageType,
    updatedAt: createdAtIso,
  };
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
    status: direction === "out" ? "sent" : "received",
    createdAt: createdAtIso,
  }, { merge: true });
  await batch.commit();

  return { chatId: phoneKey, messageId: msgRef.id, duplicate: false };
}

export async function markWhatsAppChatRead(clinicId, chatId) {
  const ref = getAdminDb().collection("clinics").doc(clinicId).collection("whatsappChats").doc(String(chatId));
  await ref.set({ unreadCount: 0, readAt: new Date().toISOString() }, { merge: true });
}
