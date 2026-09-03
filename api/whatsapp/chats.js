import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";

const IGNORED_TYPES = new Set([
  "notification_template",
  "e2e_notification",
  "protocol",
  "ciphertext",
  "revoked",
]);

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

function isIgnored(data = {}) {
  return IGNORED_TYPES.has(String(data.messageType || data.lastMessageType || "").toLowerCase());
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
    const since = String(req.method === "GET" ? req.query.since || "" : "").trim();
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
      let ref = chats.doc(chatId).collection("messages");
      let snap;
      if (since) {
        snap = await ref.where("createdAt", ">", since).orderBy("createdAt", "asc").limit(80).get();
      } else {
        snap = await ref.orderBy("createdAt", "desc").limit(80).get();
      }
      const docs = snap.docs.filter((doc) => !isIgnored(doc.data() || {}));
      const items = docs.map(serializeMessage);
      return res.status(200).json({ ok: true, incremental: !!since, items: since ? items : items.reverse() });
    }

    let snap;
    if (since) {
      snap = await chats.where("updatedAt", ">", since).orderBy("updatedAt", "asc").limit(60).get();
    } else {
      snap = await chats.orderBy("lastMessageAt", "desc").limit(60).get();
    }

    const items = snap.docs
      .filter((doc) => !isIgnored(doc.data() || {}))
      .map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          phone: data.phone || "",
          name: data.name || "",
          leadId: data.leadId || "",
          lastMessage: data.lastMessage || "",
          lastMessageAt: data.lastMessageAt || null,
          updatedAt: data.updatedAt || data.lastMessageAt || null,
          lastDirection: data.lastDirection || "in",
          unreadCount: Number(data.unreadCount || 0) || 0,
        };
      });

    return res.status(200).json({ ok: true, incremental: !!since, items });
  } catch (error) {
    const status = error?.statusCode || (String(error?.code || "").includes("auth/") ? 401 : 500);
    console.error("[whatsapp-chats]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : "Erro no inbox do WhatsApp" });
  }
}
