import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";
import { isIgnoredWhatsAppMessageType } from "../../server/whatsappChatStore.js";

async function requireFirebaseUser(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
  const token = header.slice("Bearer ".length).trim();
  return getAdminAuth().verifyIdToken(token);
}

function serializeMessage(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    phone: data.phone || "",
    leadId: data.leadId || "",
    direction: data.direction === "out" ? "out" : "in",
    text: data.text || "",
    messageType: data.messageType || "text",
    messageId: data.messageId || "",
    createdAt: data.createdAt || "",
    status: data.status || "",
  };
}

export default async function handler(req, res) {
  try {
    await requireFirebaseUser(req);
    const clinicId = String(req.method === "POST" ? req.body?.clinicId : req.query.clinicId || "").trim();
    const chatId = String(req.method === "POST" ? req.body?.chatId : req.query.chatId || "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const db = getAdminDb();
    const chats = db.collection("clinics").doc(clinicId).collection("whatsappChats");

    if (req.method === "POST") {
      if (!chatId) return res.status(400).json({ error: "chatId obrigatório" });
      await chats.doc(chatId).set({
        unreadCount: 0,
        readAt: new Date().toISOString(),
      }, { merge: true });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    if (chatId) {
      const snap = await chats
        .doc(chatId)
        .collection("messages")
        .orderBy("createdAt", "desc")
        .limit(140)
        .get();
      const items = snap.docs
        .filter((doc) => !isIgnoredWhatsAppMessageType(doc.data()?.messageType))
        .slice(0, 120)
        .map(serializeMessage)
        .reverse();
      return res.status(200).json({ ok: true, items });
    }

    const snap = await chats
      .orderBy("lastMessageAt", "desc")
      .limit(80)
      .get();

    const items = snap.docs
      .filter((doc) => !isIgnoredWhatsAppMessageType(doc.data()?.lastMessageType))
      .slice(0, 60)
      .map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          phone: data.phone || "",
          name: data.name || "",
          leadId: data.leadId || "",
          lastMessage: data.lastMessage || "",
          lastMessageAt: data.lastMessageAt || null,
          lastDirection: data.lastDirection || "in",
          unreadCount: Number(data.unreadCount || 0) || 0,
        };
      });

    return res.status(200).json({ ok: true, items });
  } catch (error) {
    const status = error?.statusCode || (String(error?.code || "").includes("auth/") ? 401 : 500);
    console.error("[whatsapp-chats]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : "Erro no inbox do WhatsApp" });
  }
}
