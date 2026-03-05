import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import express from "express";
import cors from "cors";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

// Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(new URL("./serviceAccountKey.json", import.meta.url))
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Express API
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
const PORT = process.env.PORT || 3001;

// Estado do QR Code (para exibir no CRM)
let currentQR = null;
let isConnected = false;

// Pasta para arquivos de midia (audios)
const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(__dirname, "media");
mkdirSync(MEDIA_DIR, { recursive: true });
app.use("/media", express.static(MEDIA_DIR));

// Verifica se e um LID (ID interno do WA) em vez de telefone real
function isLID(jid) {
  const digits = (jid || "").replace("@c.us", "").replace(/\D/g, "");
  return digits.length > 13;
}

// Extrai numero real com fallback para getContact()
async function getRealPhone(msg, useToField = false) {
  try {
    const rawFrom = useToField ? (msg.to || "") : (msg.from || "");
    const digits = rawFrom.replace("@c.us", "").replace(/\D/g, "");
    
    console.log(`[getRealPhone] rawFrom=${rawFrom}, digits=${digits}, isLID=${isLID(rawFrom)}, useToField=${useToField}`);
    
    if (!isLID(rawFrom)) {
      const result = digits.startsWith("55") ? digits : `55${digits}`;
      console.log(`[getRealPhone] NAO eh LID, retornando: ${result}`);
      return result;
    }
    
    // E um LID - busca numero real via getContact()
    try {
      const contact = await msg.getContact();
      // Tenta contact.number primeiro
      if (contact?.number) {
        const num = String(contact.number).replace(/\D/g, "");
        if (num.length >= 10 && num.length <= 13) {
          const result = num.startsWith("55") ? num : `55${num}`;
          console.log(`[getRealPhone] Resolvido via contact.number: ${result}`);
          return result;
        }
      }
      // Fallback: contact._data.id
      if (contact?._data?.id) {
        const id = String(contact._data.id).replace("@c.us", "").replace(/\D/g, "");
        if (id.length >= 10 && id.length <= 13) {
          const result = id.startsWith("55") ? id : `55${id}`;
          console.log(`[getRealPhone] Resolvido via contact._data.id: ${result}`);
          return result;
        }
      }
    } catch (contactErr) {
      console.warn("[getRealPhone] Erro ao buscar contact:", contactErr.message);
    }
    
    // Último fallback: tenta usar dígitos se tiver 11-13 (telefone brasileiro)
    if (digits.length >= 11 && digits.length <= 13) {
      const result = digits.startsWith("55") ? digits : `55${digits}`;
      console.log(`[getRealPhone] Fallback com dígitos (${digits.length} chars): ${result}`);
      return result;
    }
    
    // Se não conseguiu resolver e tem poucos dígitos, adiciona "55" na frente
    if (digits.length > 0) {
      const result = `55${digits.slice(-11)}`;
      console.warn(`[getRealPhone] Fallback final com últimos 11 dígitos: ${result}`);
      return result;
    }
    
    console.error(`[getRealPhone] Nao conseguiu extrair numero: rawFrom=${rawFrom}`);
    return "55";
  } catch (e) {
    console.error("[getRealPhone] Exception:", e.message);
    const digits = (msg.from || "").replace("@c.us", "").replace(/\D/g, "");
    return digits.length >= 11 ? digits : `55${digits.slice(-11)}`;
  }
}

// Formata para padrao brasileiro: (17) 99762-5696
function formatBRPhone(digits) {
  const d = digits.replace(/\D/g, "");
  const local = d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return d;
}

function phoneToWAId(telefone) {
  const digits = telefone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `${withCountry}@c.us`;
}

// Salvar mensagem evitando duplicatas
async function saveMessage({ telefone, body, fromMe, msgId }) {
  const convRef = db.collection("conversations").doc(telefone);
  const msgRef = convRef.collection("messages").doc(msgId);
  const existing = await msgRef.get();
  if (existing.exists) return;
  await msgRef.set({ id: msgId, body, fromMe, timestamp: Timestamp.now(), read: fromMe });
  const convSnap = await convRef.get();
  const currentUnread = convSnap.exists ? (convSnap.data().unreadCount || 0) : 0;
  await convRef.set(
    { telefone, lastMessage: body, lastMessageAt: Timestamp.now(), unreadCount: fromMe ? 0 : currentUnread + 1 },
    { merge: true }
  );
}

// Sincronizar lead: cria se novo, NAO sobrescreve se ja existe
async function syncLead(telefone, pushName, firstMessage) {
  try {
    // Validacao extra: rejeitar telefones invalidos
    if (telefone.length < 12) {
      console.error(`[syncLead] Rejeitando telefone invalido: "${telefone}"`);
      return;
    }

    const crmRef = db.collection("crm_data").doc("shared");
    const doc = await crmRef.get();
    const leads = doc.exists ? doc.data()?.leads || [] : [];
    const telDigits = telefone.replace(/\D/g, "");

    // Compara ultimos 8 digitos para tolerar prefixo de pais
    const existing = leads.find((l) => {
      const d = l.telefone?.replace(/\D/g, "") || "";
      return d.length >= 8 && telDigits.slice(-8) === d.slice(-8);
    });

    if (existing) {
      let nomeAtual = existing.nome;

      // Se o nome foi gerado automaticamente ("WhatsApp XXXX") e agora temos o nome real, atualiza
      if (pushName && /^WhatsApp \d+$/.test(existing.nome)) {
        console.log(`[syncLead] Atualizando nome gerado "${existing.nome}" -> "${pushName}"`);
        const updatedLeads = leads.map((l) => l.id === existing.id ? { ...l, nome: pushName } : l);
        await crmRef.update({ leads: updatedLeads });
        nomeAtual = pushName;
      }

      await db.collection("conversations").doc(telefone).set(
        { leadNome: nomeAtual, telefone },
        { merge: true }
      );
      return;
    }

    // Lead novo - fonte e captador em branco, primeira msg na observacao
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const nome = pushName || `WhatsApp ${telefone.slice(-4)}`;
    const telefoneFormatado = formatBRPhone(telefone);

    console.log(`[syncLead] Novo lead: nome='${nome}', tel='${telefone}' -> formatado='${telefoneFormatado}'`);

    const newLead = {
      id: `lead_${Date.now()}`,
      dataCriacao: dateStr,
      dataContato: dateStr,
      nome,
      telefone: telefoneFormatado,
      servicoProcurado: "",
      captador: "",
      fonteLead: "",
      etapaLead: "Novo",
      status: "",
      respostaLead: "RESPONDEU",
      comparecimento: "",
      dataFollowUp: "",
      dataAgendamento: "",
      dataRetornoLigacao: "",
      observacao: "",
      followUpCount: 0,
      lembretes: { h24: false, today: false },
    };

    await crmRef.update({ leads: [...leads, newLead] });
    console.log(`Novo lead criado: ${nome} (${telefoneFormatado})`);
    await db.collection("conversations").doc(telefone).set(
      { leadNome: nome, telefone },
      { merge: true }
    );
  } catch (e) {
    console.error("Erro ao sincronizar lead:", e);
  }
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./auth_info" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

client.on("qr", async (qr) => {
  console.log("\nQR Code gerado — escaneie no CRM ou aqui abaixo:\n");
  qrcode.generate(qr, { small: true });
  console.log("\n(WhatsApp -> Aparelhos conectados -> Conectar aparelho)\n");
  try {
    currentQR = await QRCode.toDataURL(qr);
    isConnected = false;
  } catch (e) {
    console.error("Erro ao gerar QR base64:", e.message);
  }
});

client.on("ready", () => {
  console.log("WhatsApp conectado! Escutando mensagens...");
  currentQR = null;
  isConnected = true;
});

client.on("authenticated", () => {
  console.log("Autenticado! Sessao salva.");
  currentQR = null;
});

client.on("auth_failure", (msg) => {
  console.error("Falha de autenticacao:", msg);
});

client.on("disconnected", (reason) => {
  console.log("Desconectado:", reason);
  isConnected = false;
  setTimeout(() => client.initialize(), 5000);
});

client.on("message", async (msg) => {
  if (msg.isGroupMsg) return;
  const telefone = await getRealPhone(msg);

  // Tenta extrair nome real do WhatsApp por múltiplas fontes
  let pushName = msg.notifyName || msg._data?.notifyName || msg._data?.pushName || null;
  if (!pushName) {
    try {
      const contact = await msg.getContact();
      pushName = contact?.pushname || contact?.name || null;
      if (pushName) console.log(`[pushName] Resolvido via getContact: ${pushName}`);
    } catch (_) {}
  }

  // Validar telefone: minimo "55" + 10 digitos = 12 chars
  if (telefone.length < 12) {
    console.warn(`[message] Telefone invalido (muito curto): "${telefone}" de ${msg.from}. Ignorando.`);
    return;
  }

  let body = msg.body || "";

  // Identificar tipo de midia com emoji descritivo
  if (msg.hasMedia) {
    if (msg.type === "ptt" || msg.type === "audio") {
      // tratado abaixo separadamente
    } else if (msg.type === "image") {
      body = msg.body ? `\uD83D\uDCF7 ${msg.body}` : "\uD83D\uDCF7 Imagem";
    } else if (msg.type === "video") {
      body = msg.body ? `\uD83C\uDFA5 ${msg.body}` : "\uD83C\uDFA5 V\u00eddeo";
    } else if (msg.type === "document") {
      body = msg.body || msg._data?.filename || "\uD83D\uDCC4 Documento";
    } else if (msg.type === "sticker") {
      body = "\uD83C\uDFF7\uFE0F Sticker";
    } else {
      body = body || "(m\u00eddia)";
    }
  } else if (!body) {
    body = "(sem conte\u00FAdo)";
  }

  // Detectar e salvar audio (ptt = mensagem de voz, audio = arquivo de audio)
  if (msg.hasMedia && (msg.type === "ptt" || msg.type === "audio")) {
    try {
      const media = await msg.downloadMedia();
      if (media?.data) {
        const ext = media.mimetype?.includes("ogg") ? "ogg" : "mp3";
        const sanitizedId = msg.id._serialized.replace(/[^a-zA-Z0-9_\-]/g, "_");
        const filename = `${sanitizedId}.${ext}`;
        writeFileSync(join(MEDIA_DIR, filename), Buffer.from(media.data, "base64"));
        body = `[audio:${filename}]`;
        console.log(`Audio salvo: ${filename}`);
      }
    } catch (e) {
      console.error("Erro ao baixar audio:", e.message);
      body = "(audio)";
    }
  }

  console.log(`RECV ${telefone} (desde ${msg.from}): ${body}`);
  await syncLead(telefone, pushName, typeof body === "string" && body.startsWith("[audio:") ? "(audio)" : body);
  await saveMessage({ telefone, body, fromMe: false, msgId: msg.id._serialized });
});

client.on("message_create", async (msg) => {
  if (!msg.fromMe || msg.isGroupMsg) return;

  // Usa a mesma função getRealPhone para consistência (campo msg.to)
  const telefone = await getRealPhone(msg, true);
  const body = msg.body || "(mídia)";
  console.log(`SENT ${telefone}: ${body}`);
  await saveMessage({ telefone, body, fromMe: true, msgId: msg.id._serialized });
});

// API: enviar mensagem
app.post("/send-message", async (req, res) => {
  const { telefone, message } = req.body;
  if (!telefone || !message) return res.status(400).json({ error: "telefone e message sao obrigatorios" });
  try {
    const waId = phoneToWAId(telefone);
    await client.sendMessage(waId, message);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: status
app.get("/status", (req, res) => {
  const info = client.info;
  res.json({ connected: !!info, number: info?.wid?.user || null });
});

// API: QR Code para autenticacao no CRM
app.get("/qr", (req, res) => {
  res.json({ qr: currentQR, connected: isConnected });
});

// API: marcar como lido
app.post("/mark-read", async (req, res) => {
  const { telefone } = req.body;
  if (!telefone) return res.status(400).json({ error: "telefone obrigatorio" });
  try {
    const cleanTel = telefone.replace(/\D/g, "");
    await db.collection("conversations").doc(cleanTel).update({ unreadCount: 0 });
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

// API: limpar leads com telefone inválido (menos de 12 dígitos)
app.get("/cleanup-invalid-leads", async (req, res) => {
  try {
    const crmRef = db.collection("crm_data").doc("shared");
    const doc = await crmRef.get();
    const leads = doc.exists ? doc.data()?.leads || [] : [];
    
    const invalid = leads.filter((l) => {
      const digits = (l.telefone || "").replace(/\D/g, "");
      return digits.length < 12;
    });
    
    if (invalid.length === 0) {
      return res.json({ message: "Nenhum lead inválido encontrado", cleaned: 0 });
    }
    
    const cleaned = leads.filter((l) => {
      const digits = (l.telefone || "").replace(/\D/g, "");
      return digits.length >= 12;
    });
    
    await crmRef.update({ leads: cleaned });
    console.log(`[cleanup] Removidos ${invalid.length} leads com telefone inválido`);
    
    res.json({
      message: `Removidos ${invalid.length} leads com telefone inválido`,
      cleaned: invalid.length,
      removedLeads: invalid.map((l) => ({ nome: l.nome, telefone: l.telefone })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nServidor CRM WhatsApp na porta ${PORT}\n`);
});

console.log("Iniciando WhatsApp... aguarde o QR Code...\n");
client.initialize();
