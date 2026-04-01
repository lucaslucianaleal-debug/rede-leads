// Vercel Serverless Function
// POST /api/webhook/z-api/{clinicId}
// Recebe mensagem da Z-API e salva em clinics/{clinicId}/triagem/{phone}

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Inicializa Firebase Admin (uma vez)
if (!getApps().length) {
  try {
    let serviceAccount;
    const envValue = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    console.log("[Firebase] Env var exists:", !!envValue);
    console.log("[Firebase] Env var length:", envValue?.length);
    console.log("[Firebase] First 100 chars:", envValue?.substring(0, 100));
    
    if (!envValue) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT not set");
    }
    
    // Tentar parsear como JSON
    try {
      serviceAccount = JSON.parse(envValue);
    } catch (parseErr) {
      console.error("[Firebase] JSON parse failed, trying alternative...", parseErr.message);
      // Se falhar, tentar remover caracteres escapados extras
      const cleaned = envValue
        .replace(/\\n/g, "\n")
        .replace(/\\\"/g, '"')
        .trim();
      serviceAccount = JSON.parse(cleaned);
    }
    
    console.log("[Firebase] Parsed service account keys:", Object.keys(serviceAccount || {}));
    
    if (!serviceAccount || !serviceAccount.project_id) {
      console.error("[Firebase] Service account:", JSON.stringify(serviceAccount || {}, null, 2));
      throw new Error("Service account missing or invalid structure");
    }
    
    initializeApp({
      credential: cert(serviceAccount),
    });
    
    console.log(`[Firebase] ✓ Inicializado com projeto: ${serviceAccount.project_id}`);
  } catch (err) {
    console.error("[Firebase] ✗ Erro ao inicializar:", err.message);
    console.error("[Firebase] Stack:", err.stack);
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
