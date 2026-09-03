import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin.js";

const IGNORED_MESSAGE_TYPES = new Set([
  "notification_template",
  "e2e_notification",
  "protocol",
  "gp2",
  "ciphertext",
  "revoked",
  "call_log",
]);

export function isIgnoredWhatsAppMessageType(value) {
  return IGNORED_MESSAGE_TYPES.has(String(value || "").trim().toLowerCase());
}

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

function messageDocId(messageId, direction, fallback = "") {
  const raw = String(messageId || fallback || "").trim();
  if (!raw) return null;
  const digest = createHash("sha1").update(`${direction}:${raw}`).digest("hex");
  return `msg_${digest}`;
}

function displayText(payload = {}) {
  const messageType = String(payload.messageType || "text").slice(0, 40);
  return String(payload.text || "").trim().slice(0, 4000) || (
    messageType === "audio" ? "🎤 Áudio" :
    messageType === "image" ? "📷 Imagem" :
    messageType === "video" ? "🎬 Vídeo" :
    messageType === "document" ? "📄 Documento" :
    messageType === "sticker" ? "🏷️ Figurinha" :
    `Mensagem (${messageType})`
  );
}

export async function recordWhatsAppChatMessage(clinicId, payload = {}) {
  const db = getAdminDb();
  const phone = whatsappPhone(payload.phone);
  const phoneKey = canonicalPhoneKey(payload.phone);
  if (!clinicId || !phone || !phoneKey) return null;

  const direction = payload.direction === "out" ? "out" : "in";
  const messageType = String(payload.messageType || "text").slice(0, 40);
  if (isIgnoredWhatsAppMessageType(messageType)) {
    return { chatId: phoneKey, ignored: true };
  }

  const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date();
  const createdAtIso = Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString();
  const text = displayText({ ...payload, messageType });
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
  if (direction === "in" && payload.historical !== true) chatPayload.unreadCount = FieldValue.increment(1);
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
    historical: payload.historical === true,
  }, { merge: true });
  await batch.commit();

  return { chatId: phoneKey, messageId: msgRef.id, duplicate: false };
}

export async function recordWhatsAppHistoryBatch(clinicId, rawMessages = []) {
  const db = getAdminDb();
  const prepared = [];

  for (const payload of Array.isArray(rawMessages) ? rawMessages.slice(0, 400) : []) {
    const phone = whatsappPhone(payload?.phone);
    const phoneKey = canonicalPhoneKey(payload?.phone);
    const direction = payload?.direction === "out" ? "out" : "in";
    const messageType = String(payload?.messageType || "text").slice(0, 40);
    if (!phone || !phoneKey || isIgnoredWhatsAppMessageType(messageType)) continue;

    const date = payload?.createdAt ? new Date(payload.createdAt) : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    const createdAt = date.toISOString();
    const text = displayText({ ...payload, messageType });
    const name = String(payload?.name || "").trim().slice(0, 150);
    const leadId = String(payload?.leadId || "").trim();
    const messageId = String(payload?.messageId || "").trim();
    const fallbackId = `${phoneKey}:${createdAt}:${text.slice(0, 300)}`;
    const stableId = messageDocId(messageId, direction, fallbackId);
    if (!stableId) continue;

    prepared.push({ phone, phoneKey, direction, messageType, createdAt, text, name, leadId, messageId, stableId });
  }

  if (!prepared.length) return { imported: 0, chats: 0 };

  const grouped = new Map();
  prepared.forEach((item) => {
    const list = grouped.get(item.phoneKey) || [];
    list.push(item);
    grouped.set(item.phoneKey, list);
  });

  // Uma leitura por conversa, não uma leitura por mensagem.
  const existingByPhone = new Map();
  await Promise.all([...grouped.keys()].map(async (phoneKey) => {
    const ref = db.collection("clinics").doc(clinicId).collection("whatsappChats").doc(phoneKey);
    const snap = await ref.get();
    existingByPhone.set(phoneKey, snap.exists ? (snap.data() || {}) : null);
  }));

  const batch = db.batch();
  for (const item of prepared) {
    const chatRef = db.collection("clinics").doc(clinicId).collection("whatsappChats").doc(item.phoneKey);
    batch.set(chatRef.collection("messages").doc(item.stableId), {
      phone: item.phone,
      phoneKey: item.phoneKey,
      leadId: item.leadId,
      name: item.name,
      direction: item.direction,
      text: item.text,
      messageType: item.messageType,
      messageId: item.messageId,
      status: item.direction === "out" ? "sent" : "received",
      createdAt: item.createdAt,
      historical: true,
    }, { merge: true });
  }

  for (const [phoneKey, messages] of grouped.entries()) {
    const latest = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const existing = existingByPhone.get(phoneKey);
    const existingType = String(existing?.lastMessageType || "");
    const shouldReplaceSummary = !existing
      || isIgnoredWhatsAppMessageType(existingType)
      || !existing?.lastMessageAt
      || String(latest.createdAt) >= String(existing.lastMessageAt);

    const chatRef = db.collection("clinics").doc(clinicId).collection("whatsappChats").doc(phoneKey);
    const summary = {
      phone: latest.phone,
      phoneKey,
      name: latest.name || String(existing?.name || ""),
      leadId: latest.leadId || String(existing?.leadId || ""),
      updatedAt: new Date().toISOString(),
    };
    if (shouldReplaceSummary) {
      Object.assign(summary, {
        lastMessage: latest.text.slice(0, 300),
        lastMessageAt: latest.createdAt,
        lastDirection: latest.direction,
        lastMessageType: latest.messageType,
      });
    }
    if (!existing) summary.unreadCount = 0;
    batch.set(chatRef, summary, { merge: true });
  }

  await batch.commit();
  return { imported: prepared.length, chats: grouped.size };
}

export async function markWhatsAppChatRead(clinicId, chatId) {
  const ref = getAdminDb().collection("clinics").doc(clinicId).collection("whatsappChats").doc(String(chatId));
  await ref.set({ unreadCount: 0, readAt: new Date().toISOString() }, { merge: true });
}
