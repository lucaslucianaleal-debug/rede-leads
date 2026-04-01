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
    console.log("[webhook] Recebido em:", clinicId);
    console.log("[webhook] payload:", JSON.stringify(payload, null, 2));

    // Extrair phone - tentar múltiplos caminhos
    let phone = 
      payload?.data?.phone ||
      payload?.phone ||
      payload?.from ||
      payload?.sender ||
      "";

    // Extrair message - tentar múltiplos caminhos
    let message = 
      payload?.data?.text?.message ||
      payload?.data?.message ||
      payload?.text?.message ||
      payload?.message ||
      payload?.body ||
      "";

    console.log("[webhook] Extracted phone:", phone);
    console.log("[webhook] Extracted message:", message);

    // Se ambos vazios, logar e retornar
    if (!phone || !message) {
      console.log("[webhook] Phone ou message vazio - ignorando");
      return;
    }

    // Ignorar se for mensagem enviada por nós (fromMe)
    const fromMe = payload?.data?.isFromMe || payload?.isFromMe || false;
    if (fromMe) {
      console.log("[webhook] Mensagem enviada por nós (fromMe=true) - ignorando");
      return;
    }

    const phoneNorm = phone.replace(/\D/g, "");

    console.log("[webhook] Phone normalizado:", phoneNorm);
    console.log("[webhook] Salvando em: clinics/${clinicId}/triagem/${phoneNorm}");

    // Salvar em triagem
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
      console.log(`[triagem] ✓ Salvo: ${phoneNorm} → ${clinicId}`);
    } else {
      console.log(`[triagem] Lead já existe: ${phoneNorm}`);
    }
  } catch (err) {
    console.error(`[triagem] ✗ Erro:`, err.message);
    console.error(`[triagem] Stack:`, err.stack);
  }
}
