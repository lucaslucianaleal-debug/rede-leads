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
  };
}

function findExistingLead(leads, phone) {
  const key = canonicalPhoneKey(phone);
  if (!key) return null;
  return (Array.isArray(leads) ? leads : []).find((lead) => canonicalPhoneKey(lead?.telefone) === key) || null;
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
            createdLead = {
              id: leadId,
              dataCriacao: today,
              dataContato: today,
              nome: String(req.body?.name || "").trim() || phone,
              telefone: phone,
              servicoProcurado: String(req.body?.servicoProcurado || "").trim(),
              captador: String(req.body?.captador || "").trim(),
              fonteLead: String(req.body?.fonteLead || "Online").trim() || "Online",
              etapaLead: String(req.body?.etapaLead || "Novo").trim() || "Novo",
              status: String(req.body?.status || "MORNO").trim(),
              respostaLead: "RESPONDEU",
              comparecimento: "",
              dataFollowUp: today,
              dataAgendamento: "",
              dataRetornoLigacao: "",
              observacao: String(req.body?.observacao || "Primeiro contato recebido pelo WhatsApp").trim().slice(0, 2000),
              followUpCount: 0,
              lembretes: { h24: false, today: false },
              metaCampanhaId: String(req.body?.metaCampanhaId || "").trim(),
              metaCampanhaNome: String(req.body?.metaCampanhaNome || "").trim(),
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
