// Vercel Serverless Function
// POST /api/webhook/z-api/{clinicId}
// Recebe mensagem da Z-API e salva em clinics/{clinicId}/triagem/{phone}

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Inicializa Firebase Admin (uma vez)
if (!getApps().length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    console.log("[Firebase] projectId exists:", !!projectId);
    console.log("[Firebase] clientEmail exists:", !!clientEmail);
    console.log("[Firebase] privateKey exists:", !!privateKey);
    console.log("[Firebase] privateKey length:", privateKey?.length);
    
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        `Missing credentials: projectId=${!!projectId}, clientEmail=${!!clientEmail}, privateKey=${!!privateKey}`
      );
    }
    
    // Converter literal \n para newlines reais
    privateKey = privateKey.replace(/\\n/g, "\n");
    
    console.log("[Firebase] After replace, privateKey starts with:", privateKey.substring(0, 50));
    
    const credential = cert({
      projectId,
      clientEmail,
      privateKey,
    });
    
    initializeApp({
      credential,
    });
    
    console.log(`[Firebase] ✓ Inicializado: ${projectId}`);
  } catch (err) {
    console.error("[Firebase] ✗ Erro:", err.message);
    throw err;
  }
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
    // LOG TEMPORÁRIO: ver payload completo
    console.log("[webhook] clinicId:", clinicId);
    console.log("[webhook] payload:", JSON.stringify(payload, null, 2));

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
