// Vercel Serverless Function
// POST /api/webhook/z-api/{clinicId}
// Recebe mensagem da Z-API e salva em clinics/{clinicId}/triagem/{phone}

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Inicializa Firebase Admin (uma vez)
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { clinicId } = req.query;
  const payload = req.body;

  // Responder 200 imediatamente para a Z-API não retentar
  res.status(200).json({ ok: true });

  try {
    // Ignorar mensagens enviadas por nós
    const fromMe = payload?.data?.isFromMe || payload?.isFromMe || false;
    if (fromMe) return;

    // Extrair telefone e mensagem
    const phone = payload?.data?.phone || payload?.phone || "";
    const message = payload?.data?.text?.message || payload?.text?.message || "";
    const event = payload?.event || payload?.type || "";

    const isMessage =
      event === "on-message-received" ||
      event === "MESSAGE_RECEIVED" ||
      (phone && message);

    if (!isMessage || !phone) return;

    const phoneNorm = phone.replace(/\D/g, "");

    // Salvar em triagem apenas se for lead novo
    const ref = db.collection("clinics").doc(clinicId).collection("triagem").doc(phoneNorm);
    const existing = await ref.get();

    if (!existing.exists) {
      const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await ref.set({
        telefone: phoneNorm,
        mensagem: message,
        dataRecebimento: agora,
        createdAt: Date.now(),
        lida: false,
      });
      console.log(`[triagem] Novo lead: ${phoneNorm} → clínica ${clinicId}`);
    }
  } catch (err) {
    console.error(`[triagem] Erro:`, err);
  }
}
