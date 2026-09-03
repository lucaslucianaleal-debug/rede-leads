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
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const snap = await getAdminDb()
      .collection("clinics")
      .doc(clinicId)
      .collection("whatsappChats")
      .orderBy("lastMessageAt", "desc")
      .limit(60)
      .get();

    const items = snap.docs.map((doc) => {
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
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : "Erro ao carregar conversas" });
  }
}
