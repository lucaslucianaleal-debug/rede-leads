// Vercel Serverless Function
// POST /api/webhook/z-api/{clinicId}
// Recebe mensagem da Z-API e salva em clinics/{clinicId}/triagem/{phone}

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Firebase Admin credentials missing");
    }

    privateKey = privateKey.replace(/\\n/g, "\n");

    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });

    console.log("[Firebase] Admin inicializado");
  } catch (err) {
    console.error("[Firebase] Erro ao inicializar Admin:", err.message);
    throw err;
  }
}

const db = getFirestore();

const CLINIC_NAMES = {
  "olimpia": "Odontocompany Olímpia",
  "odontcompany-olimpia": "Odontocompany Olímpia",
  "odontocompany-olimpia": "Odontocompany Olímpia",
  "novo-horizonte": "Novo Horizonte",
};

function getGreeting() {
  const now = new Date(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function safePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : "indisponível";
}

async function sendMessageWithDelay(phone, message, instance, token, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  try {
    const zApiUrl = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
    const clientToken = (process.env.Z_API_CLIENT_TOKEN || "").trim();
    const headers = { "Content-Type": "application/json" };
    if (clientToken) headers["Client-Token"] = clientToken;

    const response = await fetch(zApiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, message }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data?.error || "erro Z-API"}`);
    }

    console.log(`[z-api] Mensagem enviada para ${safePhone(phone)}`);
    return data;
  } catch (err) {
    console.error(`[z-api] Erro ao enviar para ${safePhone(phone)}:`, err.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { clinicId } = req.query;
  const payload = req.body || {};

  try {
    const phone =
      payload?.data?.phone ||
      payload?.phone ||
      payload?.from ||
      payload?.sender ||
      "";

    const message =
      payload?.data?.text?.message ||
      payload?.data?.message ||
      payload?.text?.message ||
      payload?.message ||
      payload?.body ||
      "";

    const nome =
      payload?.data?.pushName ||
      payload?.data?.senderName ||
      payload?.pushName ||
      payload?.senderName ||
      payload?.chatName ||
      "";

    const fromMe = Boolean(
      payload?.data?.isFromMe ||
      payload?.data?.fromMe ||
      payload?.isFromMe ||
      payload?.fromMe
    );

    console.log(`[webhook] ${clinicId} • ${payload?.type || payload?.event || "evento"} • ${safePhone(phone)} • fromMe=${fromMe}`);

    if (fromMe) {
      return res.status(200).json({ ok: true, skipped: true, reason: "from_me" });
    }

    if (!phone || !message) {
      return res.status(200).json({ ok: true, skipped: true, reason: "missing_phone_or_text" });
    }

    const phoneNorm = String(phone).replace(/\D/g, "");
    if (phoneNorm.length < 12 || phoneNorm.length > 13 || !phoneNorm.startsWith("55")) {
      console.log(`[webhook] Telefone fora do padrão BR ignorado: ${safePhone(phoneNorm)}`);
      return res.status(200).json({ ok: true, skipped: true, reason: "invalid_phone" });
    }

    const ref = db.collection("clinics").doc(clinicId).collection("triagem").doc(phoneNorm);
    const existing = await ref.get();

    if (existing.exists && existing.data()?.convertido === true) {
      return res.status(200).json({ ok: true, skipped: true, reason: "already_converted" });
    }

    const cleanInstance = (process.env.Z_API_INSTANCE || "").trim();
    const cleanToken = (process.env.Z_API_TOKEN || "").trim();

    const msgLower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isInterestMessage =
      msgLower.includes("gostaria de mais informacoes") ||
      msgLower.includes("tenho interesse") ||
      msgLower.includes("queria mais informacoes") ||
      msgLower.includes("quero mais informacoes") ||
      msgLower.includes("gostaria de informacoes") ||
      msgLower.includes("gostaria de saber mais") ||
      msgLower.startsWith("ola!") ||
      msgLower.startsWith("ola,");

    if (!existing.exists) {
      const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await ref.set({
        telefone: phoneNorm,
        nome,
        mensagem: message,
        dataRecebimento: agora,
        createdAt: Date.now(),
        lida: false,
        convertido: false,
        autoReplySent: false,
      });
      console.log(`[triagem] Novo contato salvo em ${clinicId}: ${safePhone(phoneNorm)}`);
    } else {
      const autoReplySent = existing.data()?.autoReplySent === true;
      if (autoReplySent) {
        return res.status(200).json({ ok: true, skipped: true, reason: "auto_reply_already_sent" });
      }
    }

    if (!isInterestMessage) {
      return res.status(200).json({ ok: true, skipped: true, reason: "not_interest_message" });
    }

    if (cleanInstance && cleanToken) {
      const greeting = getGreeting();
      const clinicName = CLINIC_NAMES[clinicId] || clinicId;

      await sendMessageWithDelay(phoneNorm, `${greeting}, como você está? 😊`, cleanInstance, cleanToken, 0);
      await sendMessageWithDelay(phoneNorm, `Meu nome é Lucas e sou da ${clinicName}`, cleanInstance, cleanToken, 1000);
      await sendMessageWithDelay(phoneNorm, "Me conta um pouquinho mais... o que vem te incomodando no seu sorriso? 😁", cleanInstance, cleanToken, 1000);

      await ref.set({ autoReplySent: true }, { merge: true });
      console.log(`[triagem] Auto-resposta concluída para ${safePhone(phoneNorm)}`);
    }
  } catch (err) {
    console.error("[triagem] Erro no webhook Z-API:", err.message);
  }

  return res.status(200).json({ ok: true });
}
