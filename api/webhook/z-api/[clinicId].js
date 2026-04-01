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
async function sendMessageWithDelay(phone, message, instance, token, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  try {
    const zApiUrl = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
    const clientToken = (process.env.Z_API_CLIENT_TOKEN || "").trim();
    const headers = { 'Content-Type': 'application/json' };
    if (clientToken) headers['Client-Token'] = clientToken;
    const response = await fetch(zApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: phone,
        message: message
      })
    });
    
    const data = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
    
    console.log(`[z-api] ✓ Msg enviada: ${phone}`, JSON.stringify(data));
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

    // Validar: telefone brasileiro deve ter 12 ou 13 dígitos (55 + DDD + número)
    if (phoneNorm.length < 12 || phoneNorm.length > 13 || !phoneNorm.startsWith("55")) {
      console.log(`[webhook] Telefone inválido ignorado: "${phoneNorm}" (${phoneNorm.length} dígitos)`);
      return res.status(200).json({ ok: true, skipped: true });
    }
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

      // ENVIAR MENSAGENS AUTOMÁTICAS: apenas se for mensagem de interesse (da plataforma)
      const isInterestMessage = message.startsWith("Olá! Gostaria de mais informações");
      if (!isInterestMessage) {
        console.log(`[triagem] Mensagem não é de interesse, não envia auto-resposta: "${message.substring(0, 50)}"`);
      }

      const rawInstance = process.env.Z_API_INSTANCE || "";
      const rawToken = process.env.Z_API_TOKEN || "";
      // Remover espaços/newlines que possam ter sido colados no Vercel
      const cleanInstance = rawInstance.trim();
      const cleanToken = rawToken.trim();
      console.log(`[z-api] instance(${cleanInstance.length}): "${cleanInstance.substring(0, 8)}..." token(${cleanToken.length}): "${cleanToken.substring(0, 8)}..."`);

      if (cleanInstance && cleanToken && isInterestMessage) {
        const greeting = getGreeting();
        const clinicName = CLINIC_NAMES[clinicId] || clinicId;
        
        const msg1 = `${greeting}, como você está? 😊`;
        const msg2 = `Meu nome é Lucas e sou da ${clinicName}`;
        const msg3 = `Me conta um pouquinho mais... o que vem te incomodando no seu sorriso? 😁`;
        
        // Aguardar cada mensagem antes de enviar a próxima
        await sendMessageWithDelay(phoneNorm, msg1, cleanInstance, cleanToken, 0);
        await sendMessageWithDelay(phoneNorm, msg2, cleanInstance, cleanToken, 3000);
        await sendMessageWithDelay(phoneNorm, msg3, cleanInstance, cleanToken, 3000);
        
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
