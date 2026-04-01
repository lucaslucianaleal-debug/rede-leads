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

// Mapa de clinicId para nomes das clínicas
const CLINIC_NAMES = {
  "olimpia": "Odontocompany Olímpia",
  "odontcompany-olimpia": "Odontocompany Olímpia",
  "odontocompany-olimpia": "Odontocompany Olímpia",
  "novo-horizonte": "Novo Horizonte",
};

// Função para obter saudação baseada na hora
function getGreeting() {
  const now = new Date(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  const hour = now.getHours();
  
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

// Função para enviar mensagem com pausa
async function sendMessageWithDelay(phone, message, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  try {
    const zApiUrl = `https://api.z-api.io/instances/${process.env.Z_API_INSTANCE}/token/${process.env.Z_API_TOKEN}/send-message`;
    const response = await fetch(zApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phone,
        message: message
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log(`[z-api] ✓ Msg enviada: ${phone}`);
  } catch (err) {
    console.error(`[z-api] ✗ Erro ao enviar msg para ${phone}:`, err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { clinicId } = req.query;
  const payload = req.body;

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

    // Extrair nome do contato (nome salvo no WhatsApp)
    let nome =
      payload?.data?.pushName ||
      payload?.data?.senderName ||
      payload?.pushName ||
      payload?.senderName ||
      "";

    console.log("[webhook] phone:", phone, "| nome:", nome, "| message:", message);

    if (!phone || !message) {
      console.log("[webhook] Phone ou message vazio - ignorando");
      return res.status(200).json({ ok: true, skipped: true });
    }

    const fromMe = payload?.data?.isFromMe || payload?.isFromMe || false;
    if (fromMe) {
      console.log("[webhook] fromMe=true - ignorando");
      return res.status(200).json({ ok: true, skipped: true });
    }

    const phoneNorm = phone.replace(/\D/g, "");
    const ref = db.collection("clinics").doc(clinicId).collection("triagem").doc(phoneNorm);
    const existing = await ref.get();

    if (!existing.exists) {
      const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await ref.set({
        telefone: phoneNorm,
        nome: nome,
        mensagem: message,
        dataRecebimento: agora,
        createdAt: Date.now(),
        lida: false,
      });
      console.log(`[triagem] ✓ Salvo: ${phoneNorm} → ${clinicId}`);

      // ENVIAR MENSAGENS AUTOMÁTICAS EM SEQUÊNCIA
      if (process.env.Z_API_INSTANCE && process.env.Z_API_TOKEN) {
        const greeting = getGreeting();
        const clinicName = CLINIC_NAMES[clinicId] || clinicId;
        
        const msg1 = `${greeting}, como você está? 😊`;
        const msg2 = `Meu nome é Lucas e sou da ${clinicName}`;
        const msg3 = `Me conta um pouquinho mais... o que vem te incomodando no seu sorriso? 😁`;
        
        // Aguardar cada mensagem antes de enviar a próxima
        await sendMessageWithDelay(phoneNorm, msg1, 0);
        await sendMessageWithDelay(phoneNorm, msg2, 3000);
        await sendMessageWithDelay(phoneNorm, msg3, 3000);
        
        console.log(`[triagem] ✓ Msgs automáticas enviadas: ${phoneNorm}`);
      }
    } else {
      console.log(`[triagem] Lead já existe: ${phoneNorm}`);
    }
  } catch (err) {
    console.error(`[triagem] ✗ Erro:`, err.message);
  }

  return res.status(200).json({ ok: true });
}
