import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";
import { brDateDisplay, canonicalPhoneKey } from "../../server/whatsappAgent.js";

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

function serializeChat(doc) {
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
    lastMessageStatus: data.lastMessageStatus || "",
    unreadCount: Number(data.unreadCount || 0) || 0,
    fonteLead: data.fonteLead || "",
    metaCampanhaId: data.metaCampanhaId || "",
    metaCampanhaNome: data.metaCampanhaNome || "",
    metaReferralHeadline: data.metaReferralHeadline || "",
    metaReferralBody: data.metaReferralBody || "",
    metaGreetingMessageBody: data.metaGreetingMessageBody || "",
    metaSourceApp: data.metaSourceApp || "",
    metaContainsAutoReply: data.metaContainsAutoReply === true,
    metaAutomatedGreetingShown: data.metaAutomatedGreetingShown === true,
  };
}

function findExistingLead(leads, phone) {
  const key = canonicalPhoneKey(phone);
  if (!key) return null;
  return (Array.isArray(leads) ? leads : []).find((lead) => canonicalPhoneKey(lead?.telefone) === key) || null;
}

function safeString(value, fallback = "", max = 2000) {
  const text = String(value ?? fallback).trim();
  return text.slice(0, max);
}

export default async function handler(req, res) {
  try {
    const user = await requireFirebaseUser(req);
    const clinicId = String(req.method === "POST" ? req.body?.clinicId : req.query.clinicId || "").trim();
    const chatId = String(req.method === "POST" ? req.body?.chatId : req.query.chatId || "").trim();
    const since = String(req.method === "GET" ? req.query.since || "" : "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const db = getAdminDb();
    const clinicRef = db.collection("clinics").doc(clinicId);
    const chats = clinicRef.collection("whatsappChats");

    if (req.method === "POST") {
      const action = String(req.body?.action || "read").trim();
      if (!chatId) return res.status(400).json({ error: "chatId obrigatório" });

      if (action === "read") {
        await chats.doc(chatId).set({
          unreadCount: 0,
          readAt: new Date().toISOString(),
        }, { merge: true });
        return res.status(200).json({ ok: true });
      }

      if (action === "linkLead") {
        const leadId = String(req.body?.leadId || "").trim();
        if (!leadId) return res.status(400).json({ error: "leadId obrigatório" });
        const name = String(req.body?.name || "").trim().slice(0, 150);
        const nowIso = new Date().toISOString();
        const batch = db.batch();
        batch.set(chats.doc(chatId), { leadId, ...(name ? { name } : {}), updatedAt: nowIso }, { merge: true });
        batch.set(clinicRef.collection("triagem").doc(chatId), { convertido: true, leadId, updatedAt: nowIso }, { merge: true });
        batch.set(clinicRef.collection("whatsappContacts").doc(chatId), { leadId, ...(name ? { name } : {}), updatedAt: nowIso }, { merge: true });
        await batch.commit();
        return res.status(200).json({ ok: true, leadId });
      }

      if (action === "deleteMessage") {
        const messageDocId = String(req.body?.messageDocId || "").trim();
        if (!messageDocId || messageDocId.includes("/")) {
          return res.status(400).json({ error: "Mensagem inválida" });
        }

        const chatRef = chats.doc(chatId);
        const messageRef = chatRef.collection("messages").doc(messageDocId);
        const messageSnap = await messageRef.get();
        if (!messageSnap.exists) {
          return res.status(200).json({ ok: true, deleted: false });
        }

        const deletedMessage = messageSnap.data() || {};
        const nowIso = new Date().toISOString();
        const deletionRef = chatRef.collection("messageDeletions").doc(messageDocId);
        const batch = db.batch();
        batch.set(deletionRef, {
          messageDocId,
          messageId: String(deletedMessage.messageId || ""),
          direction: deletedMessage.direction === "out" ? "out" : "in",
          deletedAt: nowIso,
          deletedBy: user.uid,
        }, { merge: true });
        batch.delete(messageRef);
        await batch.commit();

        const latestSnap = await chatRef.collection("messages").orderBy("createdAt", "desc").limit(10).get();
        const latestDoc = latestSnap.docs.find((doc) => !isIgnored(doc.data() || {}));
        if (latestDoc) {
          const latest = latestDoc.data() || {};
          await chatRef.set({
            lastMessage: String(latest.text || "").slice(0, 300),
            lastMessageAt: latest.createdAt || null,
            lastDirection: latest.direction === "out" ? "out" : "in",
            lastMessageType: latest.messageType || "text",
            lastMessageId: latest.messageId || "",
            lastMessageDocId: latestDoc.id,
            lastMessageFingerprint: "",
            lastMessageStatus: latest.status || "",
            updatedAt: nowIso,
          }, { merge: true });
        } else {
          await chatRef.set({
            lastMessage: "",
            lastMessageAt: null,
            lastDirection: "in",
            lastMessageType: "text",
            lastMessageId: "",
            lastMessageDocId: "",
            lastMessageFingerprint: "",
            lastMessageStatus: "",
            updatedAt: nowIso,
          }, { merge: true });
        }

        return res.status(200).json({ ok: true, deleted: true });
      }

      if (action === "createLead") {
        const phone = String(req.body?.phone || "").trim();
        const phoneKey = canonicalPhoneKey(phone);
        if (!phoneKey) return res.status(400).json({ error: "Telefone inválido" });

        const nowIso = new Date().toISOString();
        const today = brDateDisplay();
        const sharedRef = clinicRef.collection("shared").doc("shared");
        let createdLead = null;
        let created = false;

        await db.runTransaction(async (tx) => {
          const sharedSnap = await tx.get(sharedRef);
          const shared = sharedSnap.exists ? (sharedSnap.data() || {}) : {};
          const leads = Array.isArray(shared.leads) ? [...shared.leads] : [];
          const existing = findExistingLead(leads, phone);

          if (existing) {
            createdLead = existing;
          } else {
            const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const requestedReminders = req.body?.lembretes && typeof req.body.lembretes === "object" ? req.body.lembretes : {};
            const customFields = req.body?.customFields && typeof req.body.customFields === "object" && !Array.isArray(req.body.customFields)
              ? req.body.customFields
              : {};

            createdLead = {
              id: leadId,
              dataCriacao: safeString(req.body?.dataCriacao, today, 20) || today,
              dataContato: safeString(req.body?.dataContato, today, 20) || today,
              nome: safeString(req.body?.name, phone, 150) || phone,
              telefone: phone,
              servicoProcurado: safeString(req.body?.servicoProcurado, "", 150),
              captador: safeString(req.body?.captador, "", 150),
              fonteLead: safeString(req.body?.fonteLead, "Online", 80) || "Online",
              etapaLead: safeString(req.body?.etapaLead, "Novo", 80) || "Novo",
              status: safeString(req.body?.status, "MORNO", 40),
              respostaLead: safeString(req.body?.respostaLead, "RESPONDEU", 40) || "RESPONDEU",
              comparecimento: safeString(req.body?.comparecimento, "", 40),
              dataFollowUp: safeString(req.body?.dataFollowUp, today, 30) || today,
              dataAgendamento: safeString(req.body?.dataAgendamento, "", 40),
              dataRetornoLigacao: safeString(req.body?.dataRetornoLigacao, "", 40),
              observacao: safeString(req.body?.observacao, "Primeiro contato recebido pelo WhatsApp", 2000),
              followUpCount: Math.max(0, Number(req.body?.followUpCount || 0) || 0),
              lembretes: {
                h24: requestedReminders.h24 === true,
                today: requestedReminders.today === true,
              },
              customFields,
              metaCampanhaId: safeString(req.body?.metaCampanhaId, "", 200),
              metaCampanhaNome: safeString(req.body?.metaCampanhaNome, "", 250),
              lastWhatsAppInboundAt: nowIso,
              whatsappNeedsAttention: true,
              whatsappAutomationPaused: true,
              createdFrom: "whatsapp-inbox",
              createdBy: user.uid,
            };
            leads.unshift(createdLead);
            tx.set(sharedRef, { leads, lastUpdated: nowIso }, { merge: true });
            created = true;
          }

          const leadId = String(createdLead?.id || "");
          const leadName = String(createdLead?.nome || req.body?.name || "").trim();
          tx.set(chats.doc(chatId), { leadId, name: leadName, updatedAt: nowIso }, { merge: true });
          tx.set(clinicRef.collection("triagem").doc(chatId), { convertido: true, leadId, updatedAt: nowIso }, { merge: true });
          tx.set(clinicRef.collection("whatsappContacts").doc(phoneKey), { leadId, name: leadName, updatedAt: nowIso }, { merge: true });
        });

        return res.status(200).json({ ok: true, created, lead: createdLead });
      }

      return res.status(400).json({ error: "Ação inválida" });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    if (chatId) {
      const ref = chats.doc(chatId).collection("messages");
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
      .map(serializeChat);

    return res.status(200).json({ ok: true, incremental: !!since, items });
  } catch (error) {
    const status = error?.statusCode || (String(error?.code || "").includes("auth/") ? 401 : 500);
    console.error("[whatsapp-chats]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro no inbox do WhatsApp" });
  }
}
