import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  getContentType,
} from "@whiskeysockets/baileys";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import express from "express";
import cors from "cors";
import qrcode from "qrcode-terminal";
import { readFileSync } from "fs";
import { createRequire } from "module";
import "dotenv/config";
import pino from "pino";

// ─── Firebase Admin ────────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(
  readFileSync(new URL("./serviceAccountKey.json", import.meta.url))
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Express API (para o CRM enviar mensagens) ─────────────────────────────────
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ─── Helpers ───────────────────────────────────────────────────────────────────
/** Remove @s.whatsapp.net e deixa só dígitos */
function cleanPhone(jid) {
  return jid.replace("@s.whatsapp.net", "").replace("@g.us", "").replace(/\D/g, "");
}

/** Converte telefone do lead (ex: "(17) 99115-4763") para JID do WhatsApp */
function phoneToJid(phone) {
  const digits = phone.replace(/\D/g, "");
  // Garante que começa com 55 (Brasil)
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `${withCountry}@s.whatsapp.net`;
}

// ─── Salvar mensagem no Firestore ──────────────────────────────────────────────
async function saveMessage({ telefone, body, fromMe, msgId, nome = null }) {
  const convRef = db.collection("conversations").doc(telefone);
  const msgRef = convRef.collection("messages").doc(msgId);

  // Salvar mensagem
  await msgRef.set({
    id: msgId,
    body,
    fromMe,
    timestamp: Timestamp.now(),
    read: fromMe, // msgs enviadas consideradas lidas; recebidas não
  });

  // Atualizar conversa (último msg + contagem não lidas)
  const convSnap = await convRef.get();
  const currentUnread = convSnap.exists ? (convSnap.data().unreadCount || 0) : 0;

  await convRef.set(
    {
      telefone,
      lastMessage: body,
      lastMessageAt: Timestamp.now(),
      unreadCount: fromMe ? 0 : currentUnread + 1,
      ...(nome && !convSnap.exists ? { leadNome: nome } : {}),
    },
    { merge: true }
  );
}

// ─── Buscar lead pelo telefone no CRM ─────────────────────────────────────────
async function findLeadByPhone(telefone) {
  try {
    const crmRef = db.collection("crm_data").doc("shared");
    const doc = await crmRef.get();
    if (!doc.exists) return null;

    const leads = doc.data()?.leads || [];
    const match = leads.find((l) => {
      const digits = l.telefone?.replace(/\D/g, "") || "";
      return telefone.endsWith(digits) || digits.endsWith(telefone.slice(-8));
    });
    return match || null;
  } catch (e) {
    return null;
  }
}

// ─── Criar lead automaticamente se não existir ────────────────────────────────
async function createLeadIfNew(telefone, nome) {
  try {
    const crmRef = db.collection("crm_data").doc("shared");
    const doc = await crmRef.get();
    const leads = doc.exists ? doc.data()?.leads || [] : [];

    const exists = leads.find((l) => {
      const digits = l.telefone?.replace(/\D/g, "") || "";
      return telefone.endsWith(digits) || digits.endsWith(telefone.slice(-8));
    });

    if (!exists) {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

      const newLead = {
        id: `lead_${Date.now()}`,
        dataCriacao: dateStr,
        dataContato: dateStr,
        nome: nome || `WhatsApp ${telefone.slice(-4)}`,
        telefone: telefone,
        servicoProcurado: "",
        captador: "WhatsApp",
        fonteLead: "WhatsApp",
        etapaLead: "Novo",
        status: "",
        respostaLead: "RESPONDEU",
        comparecimento: "",
        dataFollowUp: "",
        dataAgendamento: "",
        dataRetornoLigacao: "",
        observacao: "Lead captado via WhatsApp",
        followUpCount: 0,
        lembretes: { h24: false, today: false },
      };

      await crmRef.update({ leads: [...leads, newLead] });
      console.log(`✅ Novo lead criado: ${newLead.nome} (${telefone})`);
      return newLead;
    }

    return exists;
  } catch (e) {
    console.error("Erro ao criar lead:", e);
    return null;
  }
}

// ─── Baileys connection ────────────────────────────────────────────────────────
let sock = null;

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\n📱 Escaneie o QR Code abaixo com o WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Conexão encerrada. Reconectando:", shouldReconnect);
      if (shouldReconnect) connectWhatsApp();
    }

    if (connection === "open") {
      console.log("✅ WhatsApp conectado com sucesso!");
    }
  });

  // ─── Escutar mensagens recebidas ──────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.remoteJid?.endsWith("@g.us")) continue; // ignorar grupos

      const fromMe = msg.key.fromMe || false;
      const jid = msg.key.remoteJid;
      const telefone = cleanPhone(jid);
      const msgId = msg.key.id;

      const contentType = getContentType(msg.message);
      let body = "";

      if (contentType === "conversation") {
        body = msg.message.conversation;
      } else if (contentType === "extendedTextMessage") {
        body = msg.message.extendedTextMessage?.text || "";
      } else if (contentType === "imageMessage") {
        body = "📷 Imagem";
      } else if (contentType === "audioMessage") {
        body = "🎵 Áudio";
      } else if (contentType === "videoMessage") {
        body = "🎬 Vídeo";
      } else if (contentType === "documentMessage") {
        body = "📄 Documento";
      } else if (contentType === "stickerMessage") {
        body = "🩷 Sticker";
      } else {
        body = `(${contentType})`;
      }

      if (!body && !fromMe) return;

      console.log(`${fromMe ? "📤" : "📨"} ${telefone}: ${body}`);

      // Buscar/criar lead
      const pushName = msg.pushName || null;
      const lead = await findLeadByPhone(telefone);
      const leadNome = lead?.nome || pushName || `WhatsApp ${telefone.slice(-4)}`;

      if (!fromMe) {
        await createLeadIfNew(telefone, pushName || leadNome);
      }

      // Salvar mensagem
      await saveMessage({ telefone, body, fromMe, msgId, nome: leadNome });
    }
  });
}

// ─── Endpoint: enviar mensagem do CRM ─────────────────────────────────────────
app.post("/send-message", async (req, res) => {
  const { telefone, message } = req.body;
  if (!telefone || !message) {
    return res.status(400).json({ error: "telefone e message são obrigatórios" });
  }

  if (!sock) {
    return res.status(503).json({ error: "WhatsApp não conectado" });
  }

  try {
    const jid = phoneToJid(telefone);
    await sock.sendMessage(jid, { text: message });

    // Salvar no Firestore
    const msgId = `out_${Date.now()}`;
    await saveMessage({ telefone: telefone.replace(/\D/g, ""), body: message, fromMe: true, msgId });

    res.json({ success: true });
  } catch (e) {
    console.error("Erro ao enviar mensagem:", e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Endpoint: status da conexão ──────────────────────────────────────────────
app.get("/status", (req, res) => {
  res.json({ connected: !!sock?.user });
});

// ─── Endpoint: marcar conversa como lida ──────────────────────────────────────
app.post("/mark-read", async (req, res) => {
  const { telefone } = req.body;
  if (!telefone) return res.status(400).json({ error: "telefone obrigatório" });

  try {
    const cleanTel = telefone.replace(/\D/g, "");
    await db.collection("conversations").doc(cleanTel).update({ unreadCount: 0 });

    // Marcar todas as mensagens como lidas
    const msgsRef = db.collection("conversations").doc(cleanTel).collection("messages");
    const unread = await msgsRef.where("read", "==", false).get();
    const batch = db.batch();
    unread.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor CRM WhatsApp rodando na porta ${PORT}`);
  console.log(`   POST /send-message  → envia mensagem`);
  console.log(`   GET  /status        → status da conexão`);
  console.log(`   POST /mark-read     → marca como lido\n`);
});

connectWhatsApp();
