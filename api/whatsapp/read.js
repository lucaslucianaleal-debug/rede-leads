import { getAdminAuth } from "../../server/firebaseAdmin.js";
import { markWhatsAppChatRead } from "../../server/whatsappChatStore.js";

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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    await requireFirebaseUser(req);
    const clinicId = String(req.body?.clinicId || "").trim();
    const chatId = String(req.body?.chatId || "").trim();
    if (!clinicId || !chatId) return res.status(400).json({ error: "clinicId e chatId obrigatórios" });
    await markWhatsAppChatRead(clinicId, chatId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = error?.statusCode || (String(error?.code || "").includes("auth/") ? 401 : 500);
    console.error("[whatsapp-read]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : "Erro ao marcar conversa" });
  }
}
