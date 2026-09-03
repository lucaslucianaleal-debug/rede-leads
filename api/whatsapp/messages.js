import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";

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

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    await requireFirebaseUser(req);
    const clinicId = String(req.query.clinicId || "").trim();
    const chatId = String(req.query.chatId || "").trim();
    if (!clinicId || !chatId) return res.status(400).json({ error: "clinicId e chatId obrigatórios" });

    const snap = await getAdminDb()
      .collection("clinics")
      .doc(clinicId)
      .collection("whatsappChats")
      .doc(chatId)
      .collection("messages")
      .orderBy("createdAt", "desc")
      .limit(120)
      .get();

    const items = snap.docs.map((doc) => {
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
    }).reverse();

    return res.status(200).json({ ok: true, items });
  } catch (error) {
    const status = error?.statusCode || (String(error?.code || "").includes("auth/") ? 401 : 500);
    console.error("[whatsapp-messages]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : "Erro ao carregar mensagens" });
  }
}
