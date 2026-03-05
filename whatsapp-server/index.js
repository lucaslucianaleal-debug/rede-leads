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
    
    // É um LID - verifica cache primeiro
    if (lidCache.has(rawFrom)) {
      const cached = lidCache.get(rawFrom);
      console.log(`[getRealPhone] Cache hit para LID ${rawFrom}: ${cached}`);
      return cached;
    }
    
    // E um LID - busca numero real via getContact()
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
    
    // Fallbacks se não conseguiu resolver via contact
    if (!resolvedPhone) {
      // Último fallback: tenta usar dígitos se tiver 11-13 (telefone brasileiro)
      if (digits.length >= 11 && digits.length <= 13) {
        resolvedPhone = digits.startsWith("55") ? digits : `55${digits}`;
        console.log(`[getRealPhone] Fallback com dígitos (${digits.length} chars): ${resolvedPhone}`);
      }
      // Se não conseguiu resolver e tem poucos dígitos, adiciona "55" na frente
      else if (digits.length > 0) {
        resolvedPhone = `55${digits.slice(-11)}`;
        console.warn(`[getRealPhone] Fallback final com últimos 11 dígitos: ${resolvedPhone}`);
      } else {
        resolvedPhone = "55";
        console.error(`[getRealPhone] Nao conseguiu extrair numero: rawFrom=${rawFrom}`);
      }
    }
    
    // Salva no cache para consistência futura
    lidCache.set(rawFrom, resolvedPhone);
    console.log(`[getRealPhone] Cache salvo: ${rawFrom} -> ${resolvedPhone}`);
    return resolvedPhone;
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
// Busca conversa existente pelos ultimos 8-11 digitos para evitar duplicatas
async function saveMessage({ telefone, body, fromMe, msgId }) {
  // Normaliza telefone (remove formatação, adiciona 55 se necessário) - MESMO PADRÃO DO /send-message
  const digits = telefone.replace(/\D/g, "");
  const normalizedPhone = digits.startsWith("55") ? digits : `55${digits}`;
  
  // Resolve alias para manter sempre o mesmo documento de conversa
  const canonicalPhone = phoneAliasMap.get(normalizedPhone) || normalizedPhone;

  // Prepara para busca: ultimos 8 e 11 digitos
  let targetPhone = canonicalPhone;
  const last8 = normalizedPhone.slice(-8);
  const last11 = normalizedPhone.slice(-11);
  
  // 1. Tenta procurar conversa com ID exato
  const directRef = db.collection("conversations").doc(canonicalPhone);
  const directSnap = await directRef.get();
  
  if (!directSnap.exists) {
    // 2. Não existe com esse ID exato - busca por conversas existentes com match
    const allConvs = await db.collection("conversations").get();
    let found = false;
    
    for (const doc of allConvs.docs) {
      const docDigits = doc.id.replace(/\D/g, "");
      const docLast8 = docDigits.slice(-8);
      const docLast11 = docDigits.slice(-11);
      const convTelField = doc.data()?.telefone?.replace(/\D/g, "") || "";
      const convTelLast8 = convTelField.slice(-8);
      const convTelLast11 = convTelField.slice(-11);
      
      // Priority 1: Match nos últimos 11 dígitos (telefone sem país)
      if (last11 && docLast11 && docLast11 === last11) {
        console.log(`[saveMessage] Encontrada conversa por 11-digitos: ${doc.id} (input: ${normalizedPhone})`);
        targetPhone = doc.id;
        phoneAliasMap.set(normalizedPhone, targetPhone);
        found = true;
        break;
      }
      
      // Priority 2: Match no campo telefone da conversa (ultimos 11)
      if (last11 && convTelField && convTelLast11 === last11) {
        console.log(`[saveMessage] Encontrada conversa por telefone field (11-dig): ${doc.id} (input: ${normalizedPhone})`);
        targetPhone = doc.id;
        phoneAliasMap.set(normalizedPhone, targetPhone);
        found = true;
        break;
      }
      
      // Priority 3: Match nos últimos 8 dígitos
      if (docDigits.length >= 8 && docLast8 === last8) {
        console.log(`[saveMessage] Encontrada conversa por 8-digitos: ${doc.id} (input: ${normalizedPhone})`);
        targetPhone = doc.id;
        phoneAliasMap.set(normalizedPhone, targetPhone);
        found = true;
        break;
      }
      
      // Priority 4: Match no campo telefone (ultimos 8)
      if (convTelField.length >= 8 && convTelLast8 === last8) {
        console.log(`[saveMessage] Encontrada conversa por telefone field (8-dig): ${doc.id} (input: ${normalizedPhone})`);
        targetPhone = doc.id;
        phoneAliasMap.set(normalizedPhone, targetPhone);
        found = true;
        break;
      }
    }
    
    if (found) {
      console.log(`[saveMessage] MATCH encontrado: usando conversa ${targetPhone}`);
    } else {
      console.log(`[saveMessage] Nenhuma conversa existente encontrada - CRIANDO NOVA com ID ${targetPhone}`);

      // 3. Fallback por leadNome: se houver lead com este telefone, tenta reaproveitar conversa já vinculada ao mesmo nome
      try {
        const crmRef = db.collection("crm_data").doc("shared");
        const crmSnap = await crmRef.get();
        const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];
        const matchedLead = leads.find((lead) => {
          const leadDigits = String(lead?.telefone || "").replace(/\D/g, "");
          return (
            (leadDigits.length >= 11 && last11 && leadDigits.slice(-11) === last11) ||
            (leadDigits.length >= 8 && leadDigits.slice(-8) === last8)
          );
        });

        if (matchedLead?.nome) {
          const allConvsByName = await db.collection("conversations").get();
          const byLeadName = allConvsByName.docs.find((doc) => {
            const name = String(doc.data()?.leadNome || "").trim().toLowerCase();
            return name && name === String(matchedLead.nome).trim().toLowerCase();
          });

          if (byLeadName) {
            targetPhone = byLeadName.id;
            phoneAliasMap.set(normalizedPhone, targetPhone);
            console.log(`[saveMessage] Fallback por leadNome: usando conversa ${targetPhone} para ${matchedLead.nome}`);
          }
        }
      } catch (err) {
        console.warn("[saveMessage] Falha no fallback por leadNome:", err.message);
      }
    }
  }

  // Salva mensagem na conversa identificada
  const convRef = db.collection("conversations").doc(targetPhone);
  const msgRef = convRef.collection("messages").doc(msgId);
  const existing = await msgRef.get();
  if (existing.exists) {
    console.log(`[saveMessage] Mensagem ${msgId} já existe - ignorando duplicata`);
    return; // Mensagem já foi salva
  }
  
  await msgRef.set({ id: msgId, body, fromMe, timestamp: Timestamp.now(), read: fromMe });
  const convSnap = await convRef.get();
  const currentUnread = convSnap.exists ? (convSnap.data().unreadCount || 0) : 0;
  
  await convRef.set(
    { telefone: targetPhone, lastMessage: body, lastMessageAt: Timestamp.now(), unreadCount: fromMe ? 0 : currentUnread + 1 },
    { merge: true }
  );
  
  console.log(`[saveMessage] Mensagem finalizada - conversa: ${targetPhone}, fromMe: ${fromMe}`);
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

      // PRIORIDADE: buscar conversa por NOME se foi passado um nome real (caso dos atalhos)
      let conversationPhone = telefone;
      const allConvs = await db.collection("conversations").get();
      
      // 1ª tentativa: buscar conversa por leadNome se foi passado nome real
      const isRealName = pushName && !/^WhatsApp \d+$/i.test(pushName) && /[a-zA-ZÀ-ÿ]/.test(pushName);
      if (isRealName) {
        const nameKey = String(nomeAtual || "").trim().toLowerCase();
        for (const convDoc of allConvs.docs) {
          const convName = String(convDoc.data()?.leadNome || "").trim().toLowerCase();
          if (convName && convName === nameKey) {
            conversationPhone = convDoc.id;
            console.log(`[syncLead] Conversa encontrada por NOME: ${conversationPhone} (nome: "${nomeAtual}")`);
            break;
          }
        }
      }

      // 2ª tentativa (fallback): buscar por últimos 8 dígitos do telefone
      if (conversationPhone === telefone) {
        for (const convDoc of allConvs.docs) {
          const convDigits = convDoc.id.replace(/\D/g, "");
          if (convDigits.length >= 8 && telDigits.slice(-8) === convDigits.slice(-8)) {
            conversationPhone = convDoc.id;
            console.log(`[syncLead] Conversa encontrada por TELEFONE: ${conversationPhone} (match com ${telefone})`);
            break;
          }
        }
      }

      const updateData = { telefone: conversationPhone };
      if (nomeAtual) {
        updateData.leadNome = nomeAtual; // Só atualiza se tem nome real
      }
      await db.collection("conversations").doc(conversationPhone).set(
        updateData,
        { merge: true }
      );

      // Limpa leadNome duplicado em outras conversas (evita 2 chats com o mesmo nome)
      try {
        const allConvs2 = await db.collection("conversations").get();
        const targetName = String(nomeAtual || "").trim().toLowerCase();
        for (const convDoc of allConvs2.docs) {
          if (convDoc.id === conversationPhone) continue;
          const convName = String(convDoc.data()?.leadNome || "").trim().toLowerCase();
          if (targetName && convName === targetName) {
            await convDoc.ref.set({ leadNome: "" }, { merge: true });
            console.log(`[syncLead] leadNome duplicado removido de ${convDoc.id}; mantido em ${conversationPhone}`);
          }
        }
      } catch (cleanupErr) {
        console.warn("[syncLead] Falha ao limpar leadNome duplicado:", cleanupErr.message);
      }
      return;
    }

    // Lead novo - fonte e captador em branco, primeira msg na observacao
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const nome = pushName || `WhatsApp ${telefone.slice(-4)}`;

    console.log(`[syncLead] Novo lead: nome='${nome}', tel='${telefone}' (limpo)`);

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
  
  // Resolve telefone UMA VEZ e usa o mesmo em todas as operações
  const telefone = await getRealPhone(msg);

  // Validar telefone: minimo "55" + 10 digitos = 12 chars
  if (telefone.length < 12) {
    console.warn(`[message] Telefone invalido (muito curto): "${telefone}" de ${msg.from}. Ignorando.`);
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
      body = "🎙️ Áudio";
    }
  }

  console.log(`RECV ${telefone} (desde ${msg.from}): ${body}`);
  
  // Usar o MESMO telefone em ambas as operações para evitar duplicação
  await syncLead(telefone, pushName, typeof body === "string" && body.startsWith("[audio:") ? "(audio)" : body);
  await saveMessage({ telefone, body, fromMe: false, msgId: msg.id._serialized });
});

client.on("message_create", async (msg) => {
  if (!msg.fromMe || msg.isGroupMsg) return;

  // Usa a mesma função getRealPhone para consistência (campo msg.to)
  const resolvedPhone = await getRealPhone(msg, true);
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
  
  // Salva com telefone normalizado
  await saveMessage({ telefone, body, fromMe: true, msgId: msg.id._serialized });
});

// API: enviar mensagem
app.post("/send-message", async (req, res) => {
  const { telefone, message } = req.body;
  if (!telefone || !message) return res.status(400).json({ error: "telefone e message sao obrigatorios" });
  try {
    // Normaliza telefone (remove formatação, pode vir formatado do CRM: "(17) 99104-5246")
    const digits = telefone.replace(/\D/g, "");
    // Adiciona prefixo 55 (Brasil) se não tiver
    const normalizedPhone = digits.startsWith("55") ? digits : `55${digits}`;
    
    if (normalizedPhone.length < 12) {
      return res.status(400).json({ error: "telefone invalido (menos de 12 digitos)" });
    }
    
    // Busca o lead no CRM para obter o nome (será usado como referência primária nos atalhos)
    let leadName = null;
    try {
      const crmRef = db.collection("crm_data").doc("shared");
      const crmSnap = await crmRef.get();
      const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];
      const telDigits = normalizedPhone.replace(/\D/g, "");
      const matchedLead = leads.find((l) => {
        const leadDigits = String(l?.telefone || "").replace(/\D/g, "");
        return (
          (leadDigits.length >= 11 && telDigits.length >= 11 && leadDigits.slice(-11) === telDigits.slice(-11)) ||
          (leadDigits.length >= 8 && telDigits.length >= 8 && leadDigits.slice(-8) === telDigits.slice(-8))
        );
      });
      if (matchedLead) {
        leadName = String(matchedLead.nome || "").trim();
        console.log(`[send-message] Lead encontrado: "${leadName}" para telefone ${normalizedPhone}`);
      }
    } catch (leadErr) {
      console.warn("[send-message] Falha ao buscar lead do CRM:", leadErr.message);
    }

    const waId = phoneToWAId(normalizedPhone);
    const sentMsg = await client.sendMessage(waId, message);

    // Garante que futuras mensagens para este contato usem o mesmo ID de conversa
    // Registra o msgId se disponível
    if (sentMsg?.id?._serialized) {
      sentMsgConversationMap.set(sentMsg.id._serialized, normalizedPhone);
      setTimeout(() => sentMsgConversationMap.delete(sentMsg.id._serialized), 10 * 60 * 1000);
    }
    
    // Força o alias: qualquer variação deste telefone -> normalizedPhone
    // Isso garante que se getRealPhone retornar valor ligeiramente diferente,
    // será mapeado para a mesma conversa
    for (const key of phoneAliasMap.keys()) {
      const keyDigits = key.replace(/\D/g, "");
      const normalizedDigits = normalizedPhone.replace(/\D/g, "");
      // Se últimos 8 dígitos batem, assumir que é o mesmo contato
      if (keyDigits.length >= 8 && normalizedDigits.length >= 8 &&
          keyDigits.slice(-8) === normalizedDigits.slice(-8)) {
        phoneAliasMap.set(normalizedPhone, normalizedPhone);
        break;
      }
    }
    if (!phoneAliasMap.has(normalizedPhone)) {
      phoneAliasMap.set(normalizedPhone, normalizedPhone);
    }

    // Garante sincronização do lead/conversa nos atalhos - PASSA O NOME para usar como referência primária
    await syncLead(normalizedPhone, leadName || null, message);

    // Salva mensagem com telefone normalizado
    await saveMessage({
      telefone: normalizedPhone,
      body: message,
      fromMe: true,
      msgId: sentMsg?.id?._serialized || `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });

    console.log(`[send-message] Mensagem enviada para ${normalizedPhone}: ${message}`);
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
    const last8 = normalizedPhone.slice(-8);
    
    // Tenta com ID exato primeiro
    const directSnap = await db.collection("conversations").doc(normalizedPhone).get();
    if (!directSnap.exists) {
      // Procura por últimos 8 dígitos
      const allConvs = await db.collection("conversations").get();
      for (const doc of allConvs.docs) {
        const docDigits = doc.id.replace(/\D/g, "");
        if (docDigits.length >= 8 && docDigits.slice(-8) === last8) {
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
