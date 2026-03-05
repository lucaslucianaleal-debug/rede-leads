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

// Cache LID -> telefone real (garante consistência)
const lidCache = new Map();
// Alias de telefone detectado no envio -> telefone canônico da conversa
const phoneAliasMap = new Map();
// msgId enviado via API -> telefone canônico escolhido no CRM
const sentMsgConversationMap = new Map();

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
// isInbound=true: Ser mais cuidadoso para evitar pegar o número do usuário (msg.to)
async function getRealPhone(msg, useToField = false, isInbound = false) {
  try {
    const rawFrom = useToField ? (msg.to || "") : (msg.from || "");
    const digits = rawFrom.replace("@c.us", "").replace(/\D/g, "");
    
    console.log(`[getRealPhone] rawFrom=${rawFrom}, digits=${digits}, isLID=${isLID(rawFrom)}, useToField=${useToField}, isInbound=${isInbound}`);
    
    if (!isLID(rawFrom)) {
      const result = digits.startsWith("55") ? digits : `55${digits}`;
      console.log(`[getRealPhone] NAO eh LID, retornando: ${result}`);
      return result;
    }
    
    // É um LID - verifica cache primeiro
    if (lidCache.has(rawFrom)) {
      const cached = lidCache.get(rawFrom);
      console.log(`[getRealPhone] Cache hit para LID ${rawFrom}: ${cached}`);
      return cached;
    }
    
    // E um LID - busca numero real via getContact() (MAS com validação se é inbound)
    let resolvedPhone = null;
    try {
      const contact = await msg.getContact();
      // Tenta contact.number primeiro
      if (contact?.number) {
        const num = String(contact.number).replace(/\D/g, "");
        if (num.length >= 10 && num.length <= 13) {
          resolvedPhone = num.startsWith("55") ? num : `55${num}`;
          console.log(`[getRealPhone] Resolvido via contact.number: ${resolvedPhone}`);
        }
      }
      // Fallback: contact._data.id
      if (!resolvedPhone && contact?._data?.id) {
        const id = String(contact._data.id).replace("@c.us", "").replace(/\D/g, "");
        if (id.length >= 10 && id.length <= 13) {
          resolvedPhone = id.startsWith("55") ? id : `55${id}`;
          console.log(`[getRealPhone] Resolvido via contact._data.id: ${resolvedPhone}`);
        }
      }
    } catch (contactErr) {
      console.warn("[getRealPhone] Erro ao buscar contact:", contactErr.message);
    }
    
    // Validação de segurança para mensagens inbound: NÃO usar número do destinatário (msg.to)
    if (isInbound && resolvedPhone && msg.to) {
      const toDigits = (msg.to || "").replace("@c.us", "").replace(/\D/g, "");
      const toNormalized = toDigits.startsWith("55") ? toDigits : `55${toDigits}`;
      
      if (resolvedPhone === toNormalized) {
        console.error(`[getRealPhone] ALERTA: getContact retornou o NÚMERO DO USUÁRIO (${resolvedPhone}), rejeitando!`);
        resolvedPhone = null; // Rejeita porque pegou o número errado
      }
    }
    
    // Fallbacks se não conseguiu resolver via contact
    if (!resolvedPhone) {
      // Valida que tem no mínimo 10 dígitos pra um número brasileiro válido
      if (digits.length >= 10 && digits.length <= 13) {
        resolvedPhone = digits.startsWith("55") ? digits : `55${digits}`;
        console.log(`[getRealPhone] Fallback com dígitos (${digits.length} chars): ${resolvedPhone}`);
        
        // Para inbound, validar que NÃO é o número do usuário
        if (isInbound && msg.to) {
          const toDigits = (msg.to || "").replace("@c.us", "").replace(/\D/g, "");
          const toNormalized = toDigits.startsWith("55") ? toDigits : `55${toDigits}`;
          if (resolvedPhone === toNormalized) {
            console.error(`[getRealPhone] Fallback retornou NÚMERO DO USUÁRIO, rejeitando por segurança!`);
            return null;
          }
        }
      } else {
        // Número inválido - muitos poucos ou muitos dígitos
        console.error(`[getRealPhone] Número inválido: ${digits.length} dígitos. rawFrom=${rawFrom}. REJEITANDO mensagem.`);
        return null; // Retorna null para sinalizar erro, não cria placeholder
      }
    }
    
    // Valida o resultado final
    if (!resolvedPhone || resolvedPhone.length < 12 || resolvedPhone.length > 14) {
      console.error(`[getRealPhone] FALHA: número final inválido: ${resolvedPhone} (${resolvedPhone ? resolvedPhone.length : 0} chars). REJEITANDO.`);
      return null; // Retorna null em vez de número inválido
    }
    
    // Salva no cache para consistência futura (se for válido)
    if (resolvedPhone && resolvedPhone.length >= 12) {
      lidCache.set(rawFrom, resolvedPhone);
      console.log(`[getRealPhone] Cache salvo: ${rawFrom} -> ${resolvedPhone}`);
    }
    return resolvedPhone;
  } catch (e) {
    console.error("[getRealPhone] Exception:", e.message);
    // Tenta fallback muito conservador: só retorna se tiver exatamente 13 dígitos (formato "55" + DDD + número)
    const digits = (msg.from || "").replace("@c.us", "").replace(/\D/g, "");
    if (digits.length === 13 && digits.startsWith("55")) {
      return digits;
    }
    console.error(`[getRealPhone] Exception fallback falhou (${digits.length} dígitos). Rejeitando.`);
    return null;
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

// Salvar mensagem na conversa correta
// Se targetConversation for passado (vindo do syncLead), usa diretamente sem buscar
async function saveMessage({ telefone, body, fromMe, msgId, targetConversation }) {
  const digits = telefone.replace(/\D/g, "");
  const normalizedPhone = digits.startsWith("55") ? digits : `55${digits}`;
  
  // Se syncLead já determinou a conversa correta, usar diretamente
  let targetPhone = targetConversation || phoneAliasMap.get(normalizedPhone) || normalizedPhone;
  
  // Só faz busca se NÃO temos uma conversa definida
  if (!targetConversation) {
    const directRef = db.collection("conversations").doc(targetPhone);
    const directSnap = await directRef.get();
    
    if (!directSnap.exists) {
      // Busca conversa existente - usa últimos 11 dígitos (mais preciso que 8)
      const allConvs = await db.collection("conversations").get();
      const last11 = normalizedPhone.slice(-11);
      
      for (const doc of allConvs.docs) {
        const docDigits = doc.id.replace(/\D/g, "");
        const docLast11 = docDigits.slice(-11);
        
        // Match APENAS por últimos 11 dígitos (DDD + número completo)
        if (last11.length >= 11 && docLast11.length >= 11 && docLast11 === last11) {
          console.log(`[saveMessage] Conversa encontrada por 11-digitos: ${doc.id}`);
          targetPhone = doc.id;
          phoneAliasMap.set(normalizedPhone, targetPhone);
          break;
        }
      }
    }
  }

  // Registra alias para futuras mensagens
  if (targetPhone !== normalizedPhone) {
    phoneAliasMap.set(normalizedPhone, targetPhone);
  }

  const convRef = db.collection("conversations").doc(targetPhone);
  const msgRef = convRef.collection("messages").doc(msgId);
  const existing = await msgRef.get();
  if (existing.exists) {
    console.log(`[saveMessage] Mensagem ${msgId} já existe - ignorando duplicata`);
    return;
  }
  
  await msgRef.set({ id: msgId, body, fromMe, timestamp: Timestamp.now(), read: fromMe });
  const convSnap = await convRef.get();
  const currentUnread = convSnap.exists ? (convSnap.data().unreadCount || 0) : 0;
  
  await convRef.set(
    { telefone: targetPhone, lastMessage: body, lastMessageAt: Timestamp.now(), unreadCount: fromMe ? 0 : currentUnread + 1 },
    { merge: true }
  );
  
  console.log(`[saveMessage] Mensagem salva na conversa: ${targetPhone}, fromMe: ${fromMe}`);
}

// Sincronizar lead: cria se novo, NAO sobrescreve se ja existe
// RETORNA o telefone correto da conversa para ser usado pelo saveMessage
async function syncLead(telefone, pushName, firstMessage) {
  try {
    if (telefone.length < 12) {
      console.error(`[syncLead] Rejeitando telefone invalido: "${telefone}"`);
      return null;
    }

    const crmRef = db.collection("crm_data").doc("shared");
    const doc = await crmRef.get();
    const leads = doc.exists ? doc.data()?.leads || [] : [];
    const telDigits = telefone.replace(/\D/g, "");
    const last11 = telDigits.slice(-11);

    // Busca lead por últimos 11 dígitos (DDD + número) - mais preciso que 8
    let existing = leads.find((l) => {
      const d = l.telefone?.replace(/\D/g, "") || "";
      return d.length >= 11 && last11.length >= 11 && d.slice(-11) === last11;
    });
    
    // Fallback: busca por últimos 8 dígitos (para números com DDD diferente)
    if (!existing) {
      const last8 = telDigits.slice(-8);
      existing = leads.find((l) => {
        const d = l.telefone?.replace(/\D/g, "") || "";
        return d.length >= 8 && d.slice(-8) === last8;
      });
    }

    if (existing) {
      let nomeAtual = existing.nome;
      const leadPhone = existing.telefone.replace(/\D/g, "");
      const leadPhoneNormalized = leadPhone.startsWith("55") ? leadPhone : `55${leadPhone}`;

      // Se o nome foi gerado automaticamente ("WhatsApp XXXX") e agora temos o nome real, atualiza
      if (pushName && /^WhatsApp \d+$/.test(existing.nome)) {
        console.log(`[syncLead] Atualizando nome gerado "${existing.nome}" -> "${pushName}"`);
        const updatedLeads = leads.map((l) => l.id === existing.id ? { ...l, nome: pushName } : l);
        await crmRef.update({ leads: updatedLeads });
        nomeAtual = pushName;
      }

      // Buscar conversa existente para este lead
      let conversationPhone = null;
      const allConvs = await db.collection("conversations").get();
      const leadLast11 = leadPhoneNormalized.slice(-11);
      
      // 1ª tentativa: buscar por telefone do LEAD (últimos 11 dígitos)
      for (const convDoc of allConvs.docs) {
        const convDigits = convDoc.id.replace(/\D/g, "");
        if (convDigits.length >= 11 && leadLast11.length >= 11 && convDigits.slice(-11) === leadLast11) {
          conversationPhone = convDoc.id;
          console.log(`[syncLead] Conversa encontrada por telefone do lead: ${conversationPhone}`);
          break;
        }
      }
      
      // 2ª tentativa: buscar por leadNome (conversa já existente para este contato)
      if (!conversationPhone) {
        const nameKey = String(nomeAtual || "").trim().toLowerCase();
        if (nameKey && !/^whatsapp \d+$/i.test(nameKey)) {
          for (const convDoc of allConvs.docs) {
            const convName = String(convDoc.data()?.leadNome || "").trim().toLowerCase();
            if (convName === nameKey) {
              conversationPhone = convDoc.id;
              console.log(`[syncLead] Conversa encontrada por nome: ${conversationPhone} (nome: "${nomeAtual}")`);
              break;
            }
          }
        }
      }
      
      // 3ª tentativa: criar conversa com telefone normalizado do LEAD (não o recebido)
      if (!conversationPhone) {
        conversationPhone = leadPhoneNormalized;
        console.log(`[syncLead] Criando conversa com telefone do lead: ${conversationPhone}`);
      }

      // Registra alias: telefone recebido -> conversa do lead
      phoneAliasMap.set(telDigits, conversationPhone);
      phoneAliasMap.set(telefone, conversationPhone);

      const updateData = { telefone: conversationPhone };
      if (nomeAtual) {
        updateData.leadNome = nomeAtual;
      }
      await db.collection("conversations").doc(conversationPhone).set(updateData, { merge: true });

      // Limpa leadNome duplicado em outras conversas
      try {
        const targetName = String(nomeAtual || "").trim().toLowerCase();
        if (targetName) {
          for (const convDoc of allConvs.docs) {
            if (convDoc.id === conversationPhone) continue;
            const convName = String(convDoc.data()?.leadNome || "").trim().toLowerCase();
            if (convName === targetName) {
              await convDoc.ref.set({ leadNome: "" }, { merge: true });
              console.log(`[syncLead] leadNome duplicado removido de ${convDoc.id}`);
            }
          }
        }
      } catch (cleanupErr) {
        console.warn("[syncLead] Falha ao limpar leadNome duplicado:", cleanupErr.message);
      }
      
      console.log(`[syncLead] Lead "${nomeAtual}" -> conversa: ${conversationPhone}`);
      return conversationPhone;
    }

    // Lead novo
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const nome = pushName || `WhatsApp ${telefone.slice(-4)}`;

    console.log(`[syncLead] Novo lead: nome='${nome}', tel='${telefone}'`);

    const newLead = {
      id: `lead_${Date.now()}`,
      dataCriacao: dateStr,
      dataContato: dateStr,
      nome,
      telefone: telefone,
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
    console.log(`Novo lead criado: ${nome} (${telefone})`);
    
    // Cria conversa com o telefone recebido
    await db.collection("conversations").doc(telefone).set(
      { leadNome: nome, telefone },
      { merge: true }
    );
    
    return telefone;
  } catch (e) {
    console.error("Erro ao sincronizar lead:", e);
    return null;
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
  
  // Resolve telefone UMA VEZ e usa o mesmo em todas as operações
  // isInbound=true: NÃO tentar getContact() que pode retornar número errado
  const telefone = await getRealPhone(msg, false, true);
  
  // Rejeita mensagens com telefone inválido/não resolvível
  if (!telefone) {
    console.warn(`[message] Telefone não resolvido: ${msg.from}. Ignorando mensagem.`);
    return;
  }

  // Validar telefone: minimo "55" + DDD(2) + numero(8-9) = 12-14 chars
  if (telefone.length < 12 || telefone.length > 14) {
    console.warn(`[message] Telefone invalido (tamanho ${telefone.length}): "${telefone}" de ${msg.from}. Ignorando.`);
    return;
  }
  
  // Valida que começa com "55"
  if (!telefone.startsWith("55")) {
    console.warn(`[message] Telefone invalido (não começa com 55): "${telefone}" de ${msg.from}. Ignorando.`);
    return;
  }
  
  // Extrai e valida DDD (2 dígitos após "55", deve ser 11-99)
  const ddd = telefone.substring(2, 4);
  const dddNum = parseInt(ddd, 10);
  if (dddNum < 11 || dddNum > 99) {
    console.warn(`[message] DDD inválido (${ddd}): telefone "${telefone}" de ${msg.from}. Ignorando.`);
    return;
  }

  // Tenta extrair nome real do WhatsApp por múltiplas fontes
  let pushName = msg.notifyName || msg._data?.notifyName || msg._data?.pushName || null;
  if (!pushName) {
    try {
      const contact = await msg.getContact();
      pushName = contact?.pushname || contact?.name || null;
      if (pushName) console.log(`[pushName] Resolvido via getContact: ${pushName}`);
    } catch (_) {}
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
      body = body || "📦 Arquivo";
    }
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
      body = "🎙️ Áudio";
    }
  }

  console.log(`RECV ${telefone} (desde ${msg.from}): ${body || "[sem conteúdo]"}`);
  
  // syncLead retorna o telefone CORRETO da conversa - usá-lo em saveMessage
  const firstMsg = typeof body === "string" && body.startsWith("[audio:") ? "🎙️ Áudio" : body;
  const conversationPhone = await syncLead(telefone, pushName, firstMsg);
  await saveMessage({ telefone, body, fromMe: false, msgId: msg.id._serialized, targetConversation: conversationPhone });
});

client.on("message_create", async (msg) => {
  if (!msg.fromMe || msg.isGroupMsg) return;

  // Usa a mesma função getRealPhone para consistência (campo msg.to)
  const resolvedPhone = await getRealPhone(msg, true);
  
  // Rejeita mensagens com telefone inválido
  if (!resolvedPhone) {
    console.warn(`[message_create] Telefone não resolvido (msg.to=${msg.to}). Ignorando.`);
    return;
  }
  
  const msgId = msg.id?._serialized;
  
  // Verifica se há mapeamento forçado da API (quando enviamos via /send-message)
  const forcedConversationPhone = msgId ? sentMsgConversationMap.get(msgId) : null;
  
  // Usa a conversa mapeada, se existir; senão usa alias; senão usa o resolvido
  const telefone = forcedConversationPhone || phoneAliasMap.get(resolvedPhone) || resolvedPhone;

  // Se havia um mapeamento forçado diferente do resolvido, registra o alias
  if (forcedConversationPhone && forcedConversationPhone !== resolvedPhone) {
    phoneAliasMap.set(resolvedPhone, forcedConversationPhone);
    console.log(`[message_create] Alias registrado: ${resolvedPhone} -> ${forcedConversationPhone} via msgId ${msgId}`);
  }

  // Limpa o mapeamento temporário
  if (msgId) {
    sentMsgConversationMap.delete(msgId);
  }

  const body = msg.body || "(mídia)";
  console.log(`SENT ${telefone}: ${body}`);
  
  // Salva com telefone normalizado, passando targetConversation
  await saveMessage({ telefone, body, fromMe: true, msgId: msg.id._serialized, targetConversation: telefone });
});

// API: enviar mensagem
app.post("/send-message", async (req, res) => {
  const { telefone, message } = req.body;
  if (!telefone || !message) return res.status(400).json({ error: "telefone e message sao obrigatorios" });
  try {
    // Normaliza telefone (remove formatação, pode vir formatado do CRM: "(17) 99104-5246")
    const digits = telefone.replace(/\D/g, "");
    const normalizedPhone = digits.startsWith("55") ? digits : `55${digits}`;
    
    if (normalizedPhone.length < 12) {
      return res.status(400).json({ error: "telefone invalido (menos de 12 digitos)" });
    }
    
    // Busca o lead no CRM para obter o nome
    let leadName = null;
    try {
      const crmRef = db.collection("crm_data").doc("shared");
      const crmSnap = await crmRef.get();
      const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];
      const telDigits = normalizedPhone.replace(/\D/g, "");
      const matchedLead = leads.find((l) => {
        const leadDigits = String(l?.telefone || "").replace(/\D/g, "");
        return leadDigits.length >= 11 && telDigits.length >= 11 && leadDigits.slice(-11) === telDigits.slice(-11);
      });
      if (matchedLead) {
        leadName = String(matchedLead.nome || "").trim();
        console.log(`[send-message] Lead encontrado: "${leadName}" para telefone ${normalizedPhone}`);
      }
    } catch (leadErr) {
      console.warn("[send-message] Falha ao buscar lead do CRM:", leadErr.message);
    }

    // syncLead PRIMEIRO para obter a conversa correta
    const syncedConversation = await syncLead(normalizedPhone, leadName || null, message);
    const targetConv = syncedConversation || normalizedPhone;

    const waId = phoneToWAId(normalizedPhone);
    const sentMsg = await client.sendMessage(waId, message);

    // Mapeia msgId -> conversa CORRETA (para message_create usar a mesma)
    if (sentMsg?.id?._serialized) {
      sentMsgConversationMap.set(sentMsg.id._serialized, targetConv);
      setTimeout(() => sentMsgConversationMap.delete(sentMsg.id._serialized), 10 * 60 * 1000);
    }
    
    // Registra alias para consistência
    phoneAliasMap.set(normalizedPhone, targetConv);

    // Salva mensagem usando conversa retornada pelo syncLead
    await saveMessage({
      telefone: normalizedPhone,
      body: message,
      fromMe: true,
      msgId: sentMsg?.id?._serialized || `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      targetConversation: targetConv,
    });

    console.log(`[send-message] Mensagem enviada para ${targetConv}: ${message}`);
    res.json({ success: true });
  } catch (e) {
    console.error("[send-message] Erro:", e.message);
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
    const normalizedPhone = telefone.replace(/\D/g, "");
    
    // Encontra a conversa correta (pode ter ID diferente)
    let targetPhone = normalizedPhone;
    const last11 = normalizedPhone.slice(-11);
    
    // Tenta com ID exato primeiro
    const directSnap = await db.collection("conversations").doc(normalizedPhone).get();
    if (!directSnap.exists) {
      // Procura por últimos 11 dígitos (mais preciso)
      const allConvs = await db.collection("conversations").get();
      for (const doc of allConvs.docs) {
        const docDigits = doc.id.replace(/\D/g, "");
        if (docDigits.length >= 11 && last11.length >= 11 && docDigits.slice(-11) === last11) {
          targetPhone = doc.id;
          break;
        }
      }
    }
    
    await db.collection("conversations").doc(targetPhone).update({ unreadCount: 0 });
    const msgsRef = db.collection("conversations").doc(targetPhone).collection("messages");
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
