
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import express from "express";
import cors from "cors";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { EventEmitter } from "events";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { blockIfMissingDoc, blockIfEmptyArray, attachLastWriter } from './lib/crmGuard.mjs';
import zapiWebhookRouter from './webhooks/z-api-webhook.js';


// Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(new URL("./serviceAccountKey.json", import.meta.url))
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Express API
const app = express();
// Allow frontend origins (development and production). Adjust as needed.
const allowedOrigins = [
  'http://localhost:5173',
  'https://rede-leads.vercel.app',
];
// CORS configuration: allow known origins and handle preflight explicitly.
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    console.warn(`[CORS] Rejected origin: ${origin}`);
    return callback(new Error('CORS policy: origin not allowed'), false);
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Middleware to log CORS-related rejects with method info for easier debugging
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.indexOf(origin) === -1) {
    console.warn(`[CORS] Incoming request from disallowed origin ${origin} - method ${req.method} - path ${req.path}`);
  }
  next();
});
app.use(express.json());

// Rotas de webhook Z-API (triagem automática de leads)
app.use('/webhook/z-api', zapiWebhookRouter);

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
// Número do próprio bot (capturado no evento "ready") — usado para trava anti-auto-conversa
let myOwnPhone = null;
// Flag para logs verbosos temporários (ligar por 24h)
let VERBOSE_LOGGING = true; // ativado por solicitação do operador (ligado por 24h via endpoint também)
// agenda desligar os logs verbosos após 24h caso ativado
function enableVerboseFor24h() {
  VERBOSE_LOGGING = true;
  console.log('[logs] Verbose logging ativado por 24h');
  setTimeout(() => {
    VERBOSE_LOGGING = false;
    console.log('[logs] Verbose logging desativado automaticamente (24h)');
  }, 24 * 60 * 60 * 1000);
}

// Cache para evitar processamento duplicado de mensagens do WhatsApp
const recentMsgCache = new Map();
// Função global para processar mensagens recebidas (usada em todos os handlers)
async function processIncomingMessage({ telefone, body, msgId, targetConversation }) {
  // Salva mensagem no Firestore usando saveMessage
  await saveMessage({ telefone, body, fromMe: false, msgId, targetConversation });
}

function isDuplicateMessage(msgId) {
  if (recentMsgCache.has(msgId)) {
    return true;
  }
  recentMsgCache.set(msgId, Date.now());
  // remover automaticamente após 5 minutos
  setTimeout(() => {
    recentMsgCache.delete(msgId);
  }, 5 * 60 * 1000);
  return false;
}
// Constante fixa de segurança: mesmo que myOwnPhone não esteja populado ainda, este número NUNCA vira conversa
const MY_PHONE = '17991040452';

// Centralização da Normalização (A 'Régua')
// Agora retorna o ID canônico de 10 dígitos (DDD + número sem o 9 extra)
function normalizeToCanvas(phoneOrId) {
  // normalizeToCanvas agora delega ao ensure10Digits para garantir
  // comportamento unificado: remover prefixo 55 e o '9' extra quando aplicável
  try {
    return ensure10Digits(phoneOrId);
  } catch (e) {
    return null;
  }
}

// Sanitiza número: remove apenas caracteres não numéricos, preservando prefixos (55) e
// dígitos extras (9). Usar para salvar exatamente o que veio do anúncio/webhook.
function sanitizeNumber(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  return digits || null;
}

// Força ID canônico de 10 dígitos: remove '55' e o '9' extra após o DDD quando presente
function ensure10Digits(phoneOrId) {
  if (!phoneOrId) return null;
  let digits = String(phoneOrId).replace(/\D/g, "");
  if (digits.startsWith("55")) digits = digits.slice(2);
  // Se tiver 11 dígitos e for celular com '9' após o DDD, remover o 9
  if (digits.length === 11 && digits[2] === "9") {
    digits = digits.slice(0,2) + digits.slice(3);
  }
  // Se ainda maior, pegar os últimos 10 dígitos como fallback
  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length === 10) return digits;
  return null;
}

// Pasta para arquivos de midia (audios)
const __dirname = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(__dirname, "media");
mkdirSync(MEDIA_DIR, { recursive: true });
// Ensure audio files are served with correct Content-Type before static
app.use('/media', (req, res, next) => {
  try {
    const p = req.path || '';
    const ext = p.split('.').pop() || '';
    if (ext.toLowerCase() === 'ogg') {
      res.setHeader('Content-Type', 'audio/ogg');
    } else if (ext.toLowerCase() === 'mp3') {
      res.setHeader('Content-Type', 'audio/mpeg');
    }
    // Allow range requests for audio seeking/playback
    res.setHeader('Accept-Ranges', 'bytes');
  } catch (e) {
    // ignore
  }
  next();
});
app.use("/media", express.static(MEDIA_DIR));

// Serve frontend build if present (allows accessing the SPA at /)
const FRONTEND_DIST = join(__dirname, '..', 'dist');
if (existsSync(FRONTEND_DIST)) {
  console.log(`[static] Servindo frontend estático de ${FRONTEND_DIST}`);
  app.use(express.static(FRONTEND_DIST));
} else {
  console.log('[static] Frontend build não encontrado em ../dist — acesse o frontend via npm run dev ou gere o build');
}
// Verifica se e um LID (ID interno do WA) em vez de telefone real
function isLID(jid) {
  const digits = normalizeToCanvas(jid);
  return digits && digits.length > 13;
}

// Extrai numero real com fallback para getContact()
async function getRealPhone(msg, useToField = false, isInbound = false) {
  try {
    const rawFrom = useToField ? (msg.to || "") : (msg.from || "");
    let digits = normalizeToCanvas(rawFrom);
    if (!digits) return null;
    if (useToField && myOwnPhone && digits === myOwnPhone) {
      console.warn(`[getRealPhone] msg.to resolveu para o PRÓPRIO número (${digits}). Retornando null para forçar fallback.`);
      return null;
    }
    if (!isLID(rawFrom)) {
      return digits;
    }
    if (lidCache.has(rawFrom)) {
      return lidCache.get(rawFrom);
    }
    let resolvedPhone = null;
    try {
      const contact = await msg.getContact();
      if (contact?.number) {
        const num = normalizeToCanvas(contact.number);
        if (num) resolvedPhone = num;
      }
      if (!resolvedPhone && contact?._data?.id) {
        const id = normalizeToCanvas(contact._data.id);
        if (id) resolvedPhone = id;
      }
      if (resolvedPhone && isInbound && msg.to) {
        const toDigits = normalizeToCanvas(msg.to);
        if (resolvedPhone === toDigits) resolvedPhone = null;
      }
      if (!resolvedPhone) {
        const candidates = [msg._data?.author, msg._data?.participant, msg._data?.id, msg._data?.senderJid];
        for (const c of candidates) {
          if (!c) continue;
          const cd = normalizeToCanvas(c);
          if (cd && (!msg.to || cd !== normalizeToCanvas(msg.to))) {
            resolvedPhone = cd;
            break;
          }
        }
      }
    } catch (contactErr) {
      console.warn("[getRealPhone] Erro ao buscar contact:", contactErr?.message || contactErr);
    }
    if (!resolvedPhone) {
      resolvedPhone = digits;
    }
    lidCache.set(rawFrom, resolvedPhone);
    return resolvedPhone;
  } catch (e) {
    console.error("[getRealPhone] Erro inesperado:", e);
    return null;
  }
}

// Limpa lastMessage para exibição na lista lateral (remove nomes técnicos de arquivos)
function cleanLastMessage(body) {
  if (!body || typeof body !== "string") return "";
  if (body.startsWith("[audio:")) return "🎤 Áudio";
  if (body.startsWith("[image:")) return "📷 Foto";
  if (body.startsWith("[video:")) return "🎬 Vídeo";
  if (body.startsWith("[document:")) return "📄 Documento";
  if (body === "🎙️ Áudio") return "🎤 Áudio";
  if (body === "📷 Imagem") return "📷 Foto";
  if (body === "🎬 Vídeo") return "🎬 Vídeo";
  if (body === "📄 Documento") return "📄 Documento";
  if (body === "🎙️ Áudio" || body.includes(".ogg") || body.includes(".mp3")) return "🎤 Áudio";
  return body;
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

// Sanitiza filename: remove espaços, query strings, partes "_lid_" e caracteres perigosos
function sanitizeFilename(name) {
  if (!name) return null;
  let s = String(name).trim();
  // Strip any trailing _lid_… fragment generated by whatsapp-web
  s = s.replace(/_lid_[A-Za-z0-9]+/, '');
  // Remove codec hints like " codecs=opus" if present (keep only the filename part)
  if (s.indexOf(' ') !== -1) s = s.split(' ')[0];
  // Remove query strings
  const q = s.indexOf('?');
  if (q !== -1) s = s.slice(0, q);
  // Keep only safe characters
  s = s.replace(/[^0-9a-zA-Z._-]/g, '');
  return s;
}

// Bloqueia bodies que contenham hints de codec ou strings perigosas
function validateMediaBody(body) {
  if (!body) return;
  if (String(body).includes('codecs=')) {
    throw new Error('Invalid media body: codec hint detected in URL');
  }
}

// Gera nome seguro para arquivos de áudio: {phoneDigits}_{timestamp}.{ext}
function generateAudioFilename(phone, ext) {
  const digits = String((phone || '')).replace(/\D/g, '') || String(Date.now());
  const ts = Date.now();
  const safeDigits = digits.replace(/[^0-9]/g, '') || ts;
  return `${safeDigits}_${ts}.${ext}`;
}

// Salvar mensagem na conversa correta
async function saveMessage({ telefone, body, fromMe, msgId, targetConversation }) {
  // normalize input phone and prepare alias key for lookups
  const normalizedPhone = String(telefone || "").replace(/\D/g, "");
  let aliasKey = normalizedPhone || String(telefone || "").replace(/\D/g, "") || null;
  // Se telefone tem 10 dígitos, trata como adTrackingNumber
  const digits = String(telefone).replace(/\D/g, "");
  let telefoneReal = null;
  let adTrackingNumber = null;
  if (digits.length === 10) {
    adTrackingNumber = digits;
  } else if (digits.length === 11 && digits.startsWith("9")) {
    telefoneReal = digits;
  } else if (digits.length === 13 && digits.startsWith("55")) {
    telefoneReal = digits;
  }
  // Bloqueia auto-conversa
  if (telefoneReal && (telefoneReal === MY_PHONE || (myOwnPhone && telefoneReal === myOwnPhone))) {
    console.warn(`[saveMessage] BLOQUEADO (auto-conversa): "${telefoneReal}" é o próprio número do bot (${MY_PHONE}). Mensagem descartada.`);
    return;
  }
  // Vínculo inteligente: se adTrackingNumber, busca telefone real
  if (adTrackingNumber) {
    const leadsSnap = await db.collection("leads").where("id_rastreio_anuncio", "==", adTrackingNumber).get();
    if (!leadsSnap.empty) {
      const lead = leadsSnap.docs[0].data();
      if (lead.telefone_real) {
        telefoneReal = lead.telefone_real;
      }
    }
  }
  // Define conversationId
  const conversationId = telefoneReal || adTrackingNumber;
  if (!conversationId) {
    console.warn('[saveMessage] Falha ao derivar conversationId (ignorar)');
    return;
  }
  const convRef = db.collection("conversations").doc(conversationId);
  // Salva campos separados
  await convRef.set({
    telefone: telefoneReal || null,
    adTrackingNumber: adTrackingNumber || null,
    lastMessage: body,
    lastMessageAt: Timestamp.now()
  }, { merge: true });
  // mensagem será salva mais abaixo após validações e normalizações
  // aliasKey may still be null; ensure it's defined for later logic
  if (!aliasKey) aliasKey = normalizedPhone || conversationId;
  // PRIORIDADE: 1) tentar match EXATO (numero completo salvo no CRM/conversations)
  // 2) tentar mapear pela conversa existente no Firestore
  // 3) por último recurso, fallback por sufixo (apenas se não houver correspondência melhor)
  try {
    const crmSnap = await db.collection("crm_data").doc("shared").get();
    const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];
    let aliasCandidate = null;
    // Inicializa aliasKey com conversationId
    let aliasKey = conversationId;

    // 1) procura por match exato no array de leads
    for (const lead of leads) {
      const leadSan = sanitizeNumber(lead.telefone);
      if (!leadSan) continue;
      if (leadSan === aliasKey) {
        aliasKey = leadSan;
        if (VERBOSE_LOGGING) console.log('[saveMessage] matched lead by exact full number', leadSan);
        break;
      }
    }

    // 2) se não houve match direto, tenta encontrar um documento de conversa com ID exato
    if (!phoneAliasMap.has(aliasKey)) {
      try {
        const doc = await db.collection('conversations').doc(aliasKey).get();
        if (doc.exists) {
          phoneAliasMap.set(aliasKey, aliasKey);
          if (VERBOSE_LOGGING) console.log('[saveMessage] matched existing conversation by exact id', aliasKey);
        }
      } catch (e) {
        if (VERBOSE_LOGGING) console.warn('[saveMessage] erro ao verificar conversa exata:', e && e.message ? e.message : e);
      }
    }

    // 3) como último recurso, tenta fallback por sufixo (preservando DDD preferido quando possível)
    if (!phoneAliasMap.has(aliasKey)) {
      const suffix8 = aliasKey.slice(-8);
      const receivedDDD = aliasKey.slice(0, 2);
      for (const lead of leads) {
        const leadNorm = sanitizeNumber(lead.telefone);
        if (!leadNorm) continue;
        const leadDDD = leadNorm.slice(0, 2);
        const leadSuffix8 = leadNorm.slice(-8);
        if (leadSuffix8 === suffix8) {
          if (leadDDD === receivedDDD) {
            aliasKey = leadNorm;
            if (VERBOSE_LOGGING) console.log('[saveMessage] matched lead by suffix+DDD', leadNorm);
            break;
          }
          // keep candidate if DDD differs — only use if nothing better found
          if (!aliasCandidate) aliasCandidate = leadNorm;
        }
      }
      if (!phoneAliasMap.has(aliasKey) && aliasCandidate) {
        aliasKey = aliasCandidate;
        if (VERBOSE_LOGGING) console.log('[saveMessage] matched lead by suffix fallback', aliasCandidate);
      }
    }
  } catch (leadLookupErr) {
    console.warn('[saveMessage] Erro ao buscar lead para correspondência:', leadLookupErr && leadLookupErr.message ? leadLookupErr.message : leadLookupErr);
  }
  let targetPhone = targetConversation ? sanitizeNumber(targetConversation) : null;
  if (targetPhone) {
    const directSnap = await db.collection("conversations").doc(targetPhone).get();
    if (!directSnap.exists) {
      targetPhone = null;
    }
  }
  if (!targetPhone) {
    const mappedPhone = phoneAliasMap.get(aliasKey);
    if (mappedPhone) {
      targetPhone = mappedPhone;
    } else {
      const allConvs = await db.collection("conversations").get();
      for (const convDoc of allConvs.docs) {
        const idSan = sanitizeNumber(convDoc.id);
        const telSan = sanitizeNumber(convDoc.data().telefone);
        if ((idSan && idSan === aliasKey) || (telSan && telSan === aliasKey)) {
          targetPhone = convDoc.id;
          phoneAliasMap.set(aliasKey, targetPhone);
          break;
        }
      }
      if (!targetPhone) {
        const convSnaps2 = await db.collection("conversations").get();
        for (const convDoc2 of convSnaps2.docs) {
          const idSan2 = sanitizeNumber(convDoc2.id);
          if (idSan2 && idSan2 === aliasKey) {
            targetPhone = convDoc2.id;
            phoneAliasMap.set(aliasKey, targetPhone);
            break;
          }
        }
        if (!targetPhone) {
          targetPhone = aliasKey;
        }
      }
    }
  }
  // Use the full sanitized number (no 10-digit forcing) as conversation ID
  const targetId = targetPhone || aliasKey;
  // canonicalId: versão canônica de 10 dígitos quando aplicável — usada para comparar/mesclar conversas
  const canonicalId = ensure10Digits(targetId) || sanitizeNumber(targetId) || targetId;
  if (!targetId) {
    console.warn('[saveMessage] Falha ao derivar targetId (ignorar)');
    return;
  }
  // convRef já foi declarado anteriormente neste escopo, reutilize se necessário
  try {
    const markerSnap = await convRef.get();
    if (markerSnap.exists && markerSnap.data()?.doNotRecreate) {
      return;
    }
  } catch (markerErr) {
    console.warn('[saveMessage] Could not read doNotRecreate marker:', markerErr && markerErr.message ? markerErr.message : markerErr);
  }
  try {
    const convSnaps = await db.collection('conversations').get();
    for (const docSnap of convSnaps.docs) {
      const docId = docSnap.id;
      if (docId === canonicalId) continue;
      const idAs10 = normalizeToCanvas(docId);
      const telAs10 = normalizeToCanvas(docSnap.data()?.telefone);
      if ((idAs10 && idAs10 === canonicalId) || (telAs10 && telAs10 === canonicalId)) {
        try {
          const srcRef = db.collection('conversations').doc(docId);
          const srcMsgs = await srcRef.collection('messages').get();
          for (const m of srcMsgs.docs) {
            const targetMsgRef = convRef.collection('messages').doc(m.id);
            const exists = await targetMsgRef.get();
            if (!exists.exists) {
              await targetMsgRef.set(m.data());
            }
          }
          const srcData = docSnap.data() || {};
          const targetSnap = await convRef.get();
          const updates = {};
          if (!targetSnap.exists || !targetSnap.data()?.leadId) updates.leadId = srcData.leadId;
          if (!targetSnap.exists || !targetSnap.data()?.leadNome) updates.leadNome = srcData.leadNome;
          if (!targetSnap.exists || !targetSnap.data()?.telefone) updates.telefone = canonicalId;
          if (Object.keys(updates).length) await convRef.set(updates, { merge: true });
          await srcRef.delete();
          phoneAliasMap.set(canonicalId, canonicalId);
        } catch (mergeErr) {
          console.warn('[saveMessage] Falha ao mesclar conversa não-canônica:', docId, mergeErr && mergeErr.message ? mergeErr.message : mergeErr);
        }
      }
    }
  } catch (scanErr) {
    console.warn('[saveMessage] Falha ao varrer conversas para mesclar duplicatas:', scanErr && scanErr.message ? scanErr.message : scanErr);
  }
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(convRef);
      if (!snap.exists) {
        tx.set(convRef, { telefone: canonicalId }, { merge: true });
      } else {
        const cur = snap.data();
        const curTel = normalizeToCanvas(cur?.telefone);
        if (curTel !== canonicalId) {
          tx.set(convRef, { telefone: canonicalId }, { merge: true });
        }
      }
    });
  } catch (txErr) {
    console.warn('[saveMessage] Transacao falhou ao garantir conversa canonica:', txErr && txErr.message ? txErr.message : txErr);
  }
  const msgRef = convRef.collection("messages").doc(msgId);
  const existing = await msgRef.get();
  if (existing.exists) {
    return;
  }
  // Validate and sanitize media bodies before saving
  try {
    validateMediaBody(body);
  } catch (e) {
    console.warn('[saveMessage] Bloqueado media body inválido:', e.message || e);
    return;
  }
  let safeBody = body;
  try {
    safeBody = String(body).replace(/\[(audio|image|video|document|media):([^\]]+)\]/g, (m, type, token) => {
      const cleaned = sanitizeFilename(token) || token;
      return `[${type}:${cleaned}]`;
    });
  } catch (e) {
    // fallback to original body
    safeBody = body;
  }
  await msgRef.set({ id: msgId, body: safeBody, fromMe, timestamp: Timestamp.now(), read: fromMe });
  const convSnap = await convRef.get();
  const currentUnread = convSnap.exists ? (convSnap.data().unreadCount || 0) : 0;
  const cleanMessage = cleanLastMessage(body);
  await convRef.set(
    { telefone: canonicalId, lastMessage: cleanMessage, lastMessageAt: Timestamp.now(), unreadCount: fromMe ? 0 : currentUnread + 1 },
    { merge: true }
  );
  console.log(`[SUCCESS] Mensagem de ${normalizedPhone} salva com sucesso na conversa canônica.`);
}

// Sincronizar lead: cria se novo, NAO sobrescreve se ja existe
// RETORNA o telefone correto da conversa para ser usado pelo saveMessage
async function syncLead(telefone, pushName, firstMessage) {
  try {
    // Criação do perfil imediata: cria lead com adTrackingNumber mesmo sem telefone
    let digits = String(telefone).replace(/\D/g, "");
    let adTrackingNumber = null;
    let telefoneReal = null;
    if (digits.length === 10) adTrackingNumber = digits;
    else if (digits.length === 11 || digits.length === 13) telefoneReal = digits;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const nome = pushName || `WhatsApp ${digits.slice(-4)}`;
    const leadRef = db.collection("leads").doc(adTrackingNumber || telefoneReal);
    const newLead = {
      id_rastreio_anuncio: adTrackingNumber || null,
      telefone_real: telefoneReal || null,
      dataCriacao: dateStr,
      dataContato: dateStr,
      nome,
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
    await leadRef.set(newLead, { merge: true });
    console.log(`[syncLead] Lead criado/vinculado: ${nome}`);
    return telefoneReal || adTrackingNumber;
  } catch (e) {
    console.error("Erro ao sincronizar lead:", e);
    return null;
  }
  try {
    // Normaliza para 10 dígitos: DDD + número sem o 9 extra
    let digits = String(telefone).replace(/\D/g, "");
    // Remove prefixo 55 se existir
    if (digits.startsWith("55")) digits = digits.slice(2);
    // Remove o 9 extra se for celular (11 dígitos)
    if (digits.length === 11 && digits[2] === "9") digits = digits.slice(0,2) + digits.slice(3);
    // Agora digits deve ter 10 dígitos (DDD + número)
    if (digits.length !== 10) {
      console.error(`[syncLead] Rejeitando telefone inválido para ID: "${telefone}" -> "${digits}"`);
      return null;
    }

    // TRAVA: nunca criar lead/conversa para o próprio número do bot
    if (digits === MY_PHONE.slice(0,10) || (myOwnPhone && digits === myOwnPhone.slice(0,10))) {
      console.warn(`[syncLead] BLOQUEADO: tentativa de criar lead para o próprio número do bot (${digits}). Ignorando.`);
      return null;
    }

    // Busca lead diretamente pelo ID normalizado
    const leadRef = db.collection("leads").doc(digits);
    const leadSnap = await leadRef.get();
    let adTrackingNumber = null;
    let telefoneReal = null;
    if (digits.length === 10) {
      adTrackingNumber = digits;
    } else if (digits.length === 11 && digits.startsWith("9")) {
      telefoneReal = digits;
    } else if (digits.length === 13 && digits.startsWith("55")) {
      telefoneReal = digits;
    }
    // Busca lead por adTrackingNumber
    if (adTrackingNumber) {
      const leadsSnap = await db.collection("leads").where("id_rastreio_anuncio", "==", adTrackingNumber).get();
      if (!leadsSnap.empty) {
        const lead = leadsSnap.docs[0].data();
        if (lead.telefone_real) {
          telefoneReal = lead.telefone_real;
        }
      }
    }
    // Cria lead
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const nome = pushName || `WhatsApp ${digits.slice(-4)}`;
    const leadRef2 = db.collection("leads").doc(adTrackingNumber || telefoneReal);
    const newLead = {
      id_rastreio_anuncio: adTrackingNumber || null,
      telefone_real: telefoneReal || null,
      dataCriacao: dateStr,
      dataContato: dateStr,
      nome,
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
    await leadRef2.set(newLead, { merge: true });
    console.log(`[syncLead] Lead criado/vinculado: ${nome}`);
    return telefoneReal || adTrackingNumber;
  } catch (e) {
    console.error("Erro ao sincronizar lead (phase2):", e && e.message ? e.message : e);
    return null;
  }

}

// Preload: registra também pelo campo 'telefone' dentro do documento
// (pode ter formato diferente do ID, ex: "5527..." vs "270...")
async function preloadPhoneAliasMap() {
  try {
    const convSnaps = await db.collection("conversations").get();
    let count = 0;
    for (const doc of convSnaps.docs) {
      const data = doc.data();
      const docId = doc.id;
      if (data && data.telefone) {
        const telDigits = (data.telefone || "").replace(/\D/g, "");
        const telAs10 = ensure10Digits(telDigits);
        if (telAs10 && telAs10.length === 10 && !phoneAliasMap.has(telAs10)) {
          phoneAliasMap.set(telAs10, docId);
          count++;
        }
      }
    }
    console.log(`[preload] phoneAliasMap: ${count} entradas de ${convSnaps.size} conversas`);
  } catch (e) {
    console.error("[preload] erro ao pré-carregar alias map:", e && e.message ? e.message : e);
  }
}

// Também percorre os leads no CRM e garante mapeamento forçado
// para evitar que conversas sejam criadas em formatos diferentes (ex: com 55 prefix)
async function preloadPhoneAliasMapFromLeads() {
  try {
    const crmRef = db.collection("crm_data").doc("shared");
    const doc = await crmRef.get();
    const leads = doc.exists ? doc.data()?.leads || [] : [];
    if (!leads || leads.length === 0) return;

    const convSnaps = await db.collection("conversations").get();
    for (const l of leads) {
      const tel = String(l.telefone || "").replace(/\D/g, "");
      if (!tel || tel.length < 8) continue;
      // Deriva versão 10 dígitos canonical
      const as10 = ensure10Digits(tel);
      if (!as10) continue;

      // Se já tem no alias map, pula
      if (phoneAliasMap.has(as10)) continue;

      // Tenta encontrar um documento cuja ID corresponda (versão canônica de 10 dígitos)
      let found = null;
      for (const convDoc of convSnaps.docs) {
        const convIdDigits = convDoc.id.replace(/\D/g, "");
        const convAs10 = ensure10Digits(convIdDigits);
        if (convAs10 === as10) {
          found = convDoc.id;
          break;
        }
      }

      if (found) {
        phoneAliasMap.set(as10, found);
      } else {
        phoneAliasMap.set(as10, as10);
      }
    }
    console.log(`[preload] phoneAliasMap alimentado a partir dos leads: ${leads.length} leads varridos`);
  } catch (e) {
    console.error("[preload] Erro ao pré-carregar alias map a partir dos leads:", e.message);
  }
}

// Executa imediatamente ao iniciar o servidor (antes do WhatsApp conectar)
await preloadPhoneAliasMap();
await preloadPhoneAliasMapFromLeads();

// Atualiza conversas associadas a um lead quando o lead é editado
async function updateConversationsForLead(lead) {
  try {
    if (!lead || !lead.telefone) return;
    const leadDigits = String(lead.telefone || "").replace(/\D/g, "");
    const leadNorm = leadDigits.startsWith("55") ? leadDigits.slice(2) : leadDigits;
    if (leadNorm.length < 8) return;
    const leadCanonical = ensure10Digits(leadNorm) || leadNorm.slice(-10);
    const leadLast8 = leadCanonical.slice(-8);

    const convSnaps = await db.collection('conversations').get();
    // Ensure target conversation exists (create if necessary)
    const targetId = leadCanonical;
    const targetRef = db.collection('conversations').doc(targetId);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      await targetRef.set({ telefone: leadCanonical, leadId: lead.id, leadNome: lead.nome }, { merge: true });
    } else {
      // ensure leadId/leadNome present
      await targetRef.set({ leadId: lead.id, leadNome: lead.nome }, { merge: true });
    }

    for (const doc of convSnaps.docs) {
      const idDigits = doc.id.replace(/\D/g, "");
      const idCanonical = ensure10Digits(idDigits) || idDigits.slice(-10);
      if (idCanonical === leadCanonical) continue; // already the canonical one
      const data = doc.data() || {};
      const telFieldDigits = String(data.telefone || "").replace(/\D/g, "");
      const telFieldCanonical = ensure10Digits(telFieldDigits) || telFieldDigits.slice(-10);
      // match by last8 and different canonical
      if ((idCanonical && idCanonical.slice(-8) === leadLast8) || (telFieldCanonical && telFieldCanonical.slice(-8) === leadLast8)) {
        // merge this doc into targetId
        const srcRef = db.collection('conversations').doc(doc.id);
        const msgs = await srcRef.collection('messages').get();
        for (const m of msgs.docs) {
          const targetMsgRef = targetRef.collection('messages').doc(m.id);
          const exists = await targetMsgRef.get();
          if (!exists.exists) {
            await targetMsgRef.set(m.data());
          }
        }
        // update metadata if target missing
        const srcData = doc.data() || {};
        const updates = {};
        if (!targetSnap.exists || !targetSnap.data()?.leadId) updates.leadId = lead.id;
        if (!targetSnap.exists || !targetSnap.data()?.leadNome) updates.leadNome = lead.nome;
        if (!targetSnap.exists || !targetSnap.data()?.telefone) updates.telefone = leadCanonical;
        if (Object.keys(updates).length) await targetRef.set(updates, { merge: true });
        // delete source
        await srcRef.delete();
        console.log(`[lead-sync] Mesclada conversa ${doc.id} -> ${targetId} para lead ${lead.id}`);
      }
    }
  } catch (e) {
    console.error('[lead-sync] erro ao atualizar conversas para lead', lead?.id, e.message || e);
  }
}

// Escuta alterações no documento de leads e sincroniza conversas automaticamente
const crmSharedRef = db.collection('crm_data').doc('shared');
crmSharedRef.onSnapshot(async (snap) => {
  try {
    if (!snap.exists) return;
    const leads = snap.data()?.leads || [];
    console.log('[lead-sync] snapshot de leads recebido, sincronizando', leads.length, 'leads');
    for (const l of leads) {
      // executar sem bloquear tudo (fire-and-forget com await para ordem)
      await updateConversationsForLead(l);
    }
    // repopular alias map após sync
    await preloadPhoneAliasMapFromLeads();
  } catch (e) {
    console.error('[lead-sync] falha no snapshot handler:', e.message || e);
  }
});

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

client.on("ready", async () => {
  console.log("WhatsApp conectado! Escutando mensagens...");
  currentQR = null;
  isConnected = true;
  // Captura o próprio número para trava anti-auto-conversa
  try {
    if (client.info?.wid?._serialized) {
      const ownDigits = client.info.wid._serialized.replace("@c.us", "").replace(/\D/g, "");
      myOwnPhone = ensure10Digits(ownDigits);
      console.log(`[ready] Meu número (bot): ${myOwnPhone}`);
    }
  } catch (e) {
    console.warn("[ready] Não foi possível capturar phone do bot:", e.message);
  }
  // Recarrega alias map com dados atuais do Firestore (cobertura de conversas criadas após o startup)
  preloadPhoneAliasMap();
  preloadPhoneAliasMapFromLeads();
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

// queue used to process incoming messages sequentially without blocking the client
const messageQueue = [];
let processingQueue = false;

async function processQueue() {
  if (processingQueue) return;
  processingQueue = true;
  while (messageQueue.length) {
    const msg = messageQueue.shift();
    await handleIncomingMessage(msg).catch((err) => console.error('[queue] erro processamento', err));
  }
  processingQueue = false;
}

async function handleIncomingMessage(msg) {
  // 1️⃣ obter contato e normalizar para 10 dígitos
  let canonicalPhone = null;
  try {
    const contact = await msg.getContact();
    let num = String(contact?.number || "").replace(/\D/g, "");
    if (num.startsWith("55")) num = num.slice(2);
    if (num.length === 11 && num[2] === "9") num = num.slice(0,2) + num.slice(3);
    if (num.length === 10) canonicalPhone = num;
  } catch (e) {
    console.warn('[handleIncomingMessage] getContact falhou:', e.message || e);
  }
  if (!canonicalPhone) {
    // fallback do campo from
    let raw = String(msg.from || "").replace(/\D/g, "");
    if (raw.startsWith("55")) raw = raw.slice(2);
    if (raw.length === 11 && raw[2] === "9") raw = raw.slice(0,2) + raw.slice(3);
    if (raw.length === 10) canonicalPhone = raw;
  }
  if (!canonicalPhone) {
    console.warn('[handleIncomingMessage] Não foi possível normalizar telefone', msg.from);
    return;
  }

  // 2️⃣ canonical message ID e fallback
  let mid = msg.id?.id || msg.id?._serialized || '';
  let fallback = false;
  if (mid.startsWith('false_')) {
    mid = mid.slice(6);
    fallback = true;
    console.log('[FALLBACK HANDLED] ajustado id para', mid);
  }

  // 3️⃣ vincular ou criar lead
  let leadId = null;
  if (phoneAliasMap.has(canonicalPhone)) {
    const convId = phoneAliasMap.get(canonicalPhone);
    try {
      const convSnap = await db.collection('conversations').doc(convId).get();
      leadId = convSnap.data()?.leadId || null;
    } catch {}
  }
  if (!leadId) {
    // cria lead automaticamente via syncLead (ele também retorna o ID normalizado)
    leadId = await syncLead(canonicalPhone, null, msg.body);
  }

  // 4️⃣ salvar mensagem + anexar leadId
  await saveMessage({ telefone: canonicalPhone, body: msg.body, fromMe: false, msgId: mid, targetConversation: null });
  try {
    const msgRef = db.collection('conversations').doc(canonicalPhone).collection('messages').doc(mid);
    await msgRef.set({ leadId }, { merge: true });
  } catch (e) {
    console.warn('[handleIncomingMessage] não pôde adicionar leadId à mensagem', e.message || e);
  }

  // também garanto leadId no documento de conversa
  if (leadId) {
    try {
      await db.collection('conversations').doc(canonicalPhone).set({ leadId }, { merge: true });
    } catch (e) {}
  }

  console.log(fallback ? '[FALLBACK HANDLED] mensagem salva' : '[SUCCESS] mensagem salva', canonicalPhone, mid);
}

client.on("message", async (msg) => {
  if (!msg || !msg.id) return;
  let raw = String(msg.from || "").replace(/\D/g, "");
  if (raw.startsWith("55")) raw = raw.slice(2);
  if (raw.length === 11 && raw[2] === "9") raw = raw.slice(0,2) + raw.slice(3);
  if (raw.length > 10) raw = raw.slice(-10);
  if (raw.length !== 10) {
    console.warn('[IGNORADO] Número inválido:', msg.from, 'após limpeza:', raw);
    return;
  }

  // Detecta e salva mídia (áudio, imagem, vídeo, documento)
  let body = msg.body;
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          const ext = (media.mimetype || '').split('/')[1] || 'bin';
          // Prefer usar o número canônico 'raw' quando disponível
          let base = '';
          try { base = String(raw || msg.from || msg._data?.author || ''); } catch (e) { base = ''; }
          if (!base) base = (msg.id && (msg.id._serialized || msg.id)) ? String(msg.id._serialized || msg.id) : '';
          if (base.startsWith('false_')) base = base.replace(/^false_+/, '');
          // Gere nome no formato {phone}_{timestamp}.{ext}
          const filename = generateAudioFilename(base, ext);
          const filepath = join(MEDIA_DIR, filename);
          writeFileSync(filepath, Buffer.from(media.data, 'base64'));
          // Marca o body para exibição no frontend (sempre usando filename limpo)
          const cleanFile = sanitizeFilename(filename) || filename;
          if (media.mimetype.startsWith('audio')) {
            body = `[audio:${cleanFile}]`;
          } else if (media.mimetype.startsWith('image')) {
            body = `[image:${cleanFile}]`;
          } else if (media.mimetype.startsWith('video')) {
            body = `[video:${cleanFile}]`;
          } else if (media.mimetype.startsWith('application')) {
            body = `[document:${cleanFile}]`;
          } else {
            body = `[media:${cleanFile}]`;
          }
          console.log(`[media] Arquivo salvo: ${cleanFile} (${media.mimetype})`);
        }
      } catch (mediaErr) {
        console.warn('[media] Falha ao baixar/salvar mídia:', mediaErr && mediaErr.message ? mediaErr.message : mediaErr);
      }
    }

  console.log('✅ SUCESSO: Gravando mensagem para o número de 10 dígitos:', raw);
  await saveMessage({ telefone: raw, body, fromMe: false, msgId: msg.id._serialized || msg.id, targetConversation: null });
});
// Graceful Shutdown (Desligamento Suave)
function shutdownHandler(signal) {
  console.log(`[shutdown] Recebido sinal ${signal}. Fechando WhatsApp e Chrome...`);
  client.destroy().then(() => {
    console.log("[shutdown] Instância WhatsApp/Chrome finalizada.");
    process.exit(0);
  }).catch((err) => {
    console.error("[shutdown] Falha ao destruir client:", err);
    process.exit(1);
  });
}

process.on("SIGINT", () => shutdownHandler("SIGINT"));
process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

client.on("message_create", async (msg) => {
  // Handler reativado: processa mensagens enviadas pelo bot
  try {
    if (!msg || !msg.id) return;
    // Evita duplicatas
    if (isDuplicateMessage(msg.id._serialized || msg.id)) return;
    // Ignora mensagens recebidas (apenas processa enviadas pelo bot)
    if (!msg.fromMe) return;
    // Busca conversa correta se mapeada
    const targetConversation = sentMsgConversationMap.get(msg.id._serialized || msg.id) || null;
    const telefone = await getRealPhone(msg, true, false);
    if (!telefone) return;
    // Se for mídia, faça download e marque o body adequadamente (mesma lógica das mensagens recebidas)
    let bodyToSave = msg.body || '';
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          const ext = (media.mimetype || '').split('/')[1] || 'bin';
          let base = telefone || '';
          if (!base) base = (msg.id && (msg.id._serialized || msg.id)) ? String(msg.id._serialized || msg.id) : '';
          if (base.startsWith('false_')) base = base.replace(/^false_+/, '');
          const filename = generateAudioFilename(base, ext);
          const filepath = join(MEDIA_DIR, filename);
          writeFileSync(filepath, Buffer.from(media.data, 'base64'));
          const cleanFile = sanitizeFilename(filename) || filename;
          if ((media.mimetype || '').startsWith('audio')) {
            bodyToSave = `[audio:${cleanFile}]`;
          } else if ((media.mimetype || '').startsWith('image')) {
            bodyToSave = `[image:${cleanFile}]`;
          } else if ((media.mimetype || '').startsWith('video')) {
            bodyToSave = `[video:${cleanFile}]`;
          } else if ((media.mimetype || '').startsWith('application')) {
            bodyToSave = `[document:${cleanFile}]`;
          } else {
            bodyToSave = `[media:${cleanFile}]`;
          }
          console.log(`[media][outgoing] Arquivo salvo: ${cleanFile} (${media.mimetype})`);
        }
      } catch (e) {
        console.warn('[media][outgoing] falha ao baixar mídia enviada pelo bot:', e && e.message ? e.message : e);
      }
    }

    await saveMessage({
      telefone,
      body: bodyToSave || '(mídia)',
      fromMe: true,
      msgId: msg.id._serialized || msg.id,
      targetConversation
    });
  } catch (e) {
    console.error('[message_create handler] erro:', e && e.message ? e.message : e);
  }
});

// Fallback listener: log mínimo para capturar qualquer mensagem que fugir do handler principal
client.on("message", (msg) => {
  try {
    if (!msg) return;
    const id = msg.id?._serialized || msg.id || '(no-id)';
    const from = msg.from || '(no-from)';
    const body = msg.body || '(no-body)';
    console.log(`[FALLBACK] id:${id} from:${from} body:${body}`);
  } catch (e) {
    console.error('[FALLBACK] erro ao logar msg:', e && e.message ? e.message : e);
  }
});

// API: enviar mensagem
app.post("/send-message", async (req, res) => {
  console.log('[send-message] payload:', req.body);
  const { telefone, message } = req.body;
  if (!telefone || !message) return res.status(400).json({ error: "telefone e message sao obrigatorios" });
  try {
    const rawInput = String(telefone || "").replace(/\D/g, "");
    const canonical = ensure10Digits(telefone) || (rawInput.length >= 10 ? rawInput.slice(-10) : null);
    if (!canonical) {
      return res.status(400).json({ error: "Não foi possível derivar o ID de 10 dígitos a partir do telefone informado" });
    }

    // busca nome do lead (se disponível) — não é crítico para envio
    let leadName = null;
    try {
      const crmRef = db.collection("crm_data").doc("shared");
      const crmSnap = await crmRef.get();
      const leads = crmSnap.exists ? (crmSnap.data()?.leads || []) : [];
      const matchedLead = leads.find((l) => {
        const leadDigits = String(l?.telefone || "").replace(/\D/g, "");
        const lead10 = ensure10Digits(leadDigits) || (leadDigits.length >= 10 ? leadDigits.slice(-10) : null);
        return lead10 === canonical;
      });
      if (matchedLead) {
        leadName = String(matchedLead.nome || "").trim();
        console.log(`[send-message] Lead encontrado: "${leadName}" para telefone ${canonical}`);
      }
    } catch (leadErr) {
      console.warn("[send-message] Falha ao buscar lead do CRM:", leadErr && leadErr.message ? leadErr.message : leadErr);
    }

    const syncedConversation = await syncLead(canonical, leadName || null, message);
    const targetConv = syncedConversation || canonical;

    // Sequência oficial (Trindade do Envio):
    // 1) 55 + DDD + 9 + Número (formato internacional completo)
      // Strategy: try the full number from the DB first (sanitize only), then try variations
      const stored = sanitizeNumber(telefone) || rawInput;
      const attempts = [];
      if (stored) attempts.push({ label: 'stored', digits: stored });
      // If stored starts with 55, add variant without 55; else add variant with 55
      if (stored && stored.startsWith('55')) {
        attempts.push({ label: 'without-55', digits: stored.slice(2) });
      } else if (stored) {
        attempts.push({ label: 'with-55', digits: `55${stored}` });
      }
      // Try removing a '9' after DDD if present (both with and without 55)
      const maybeRemove9 = (s) => {
        if (!s) return null;
        let d = s;
        if (d.length >= 11 && d[2] === '9') return d.slice(0,2) + d.slice(3);
        if (d.length >= 13 && d.startsWith('55') && d[4] === '9') return d.slice(0,4) + d.slice(5);
        return null;
      };
      const r1 = maybeRemove9(stored);
      if (r1) attempts.push({ label: 'remove-9', digits: r1 });
      // ensure unique order
      const seen = new Set();
      const uniqAttempts = [];
      for (const a of attempts) {
        const d = String(a.digits || '').replace(/\D/g, '');
        if (!d) continue;
        if (seen.has(d)) continue;
        seen.add(d);
        uniqAttempts.push({ label: a.label, digits: d });
      }

    let succeeded = false;
    let successfulVariant = null;
    let lastError = null;
    let sentMsg = null;

    for (const att of uniqAttempts) {
      try {
        const maybe = String(att.digits).replace(/\D/g, '');
        console.log(`[send-message] Tentativa ${att.label}: verificando getNumberId para ${maybe}`);
        let nid = null;
        try {
          nid = await client.getNumberId(maybe);
        } catch (gErr) {
          console.warn(`[send-message] getNumberId error (${att.label}) for ${maybe}:`, gErr && gErr.message ? gErr.message : gErr);
        }
        // if getNumberId not found we still may attempt to send (client.sendMessage may return 'No LID')
        const waId = `${maybe}@c.us`;
        try {
          sentMsg = await client.sendMessage(waId, message);
          console.log(`[send-message] Enviado com sucesso usando variação '${att.label}' -> ${waId}`);
          succeeded = true;
          successfulVariant = att.label;
          // Mapear msgId -> conversa alvo
          if (sentMsg?.id?._serialized) {
            sentMsgConversationMap.set(sentMsg.id._serialized, targetConv);
            setTimeout(() => sentMsgConversationMap.delete(sentMsg.id._serialized), 10 * 60 * 1000);
          }
          break;
        } catch (sendErr) {
          lastError = sendErr;
          // If sendErr mentions 'No LID' treat as retriable and continue to next attempt
          const msgText = String(sendErr && sendErr.message ? sendErr.message : sendErr || '');
          console.warn(`[send-message] Falha ao enviar usando '${att.label}' (${waId}):`, msgText);
          if (!/no lid/i.test(msgText)) {
            // for non-No LID errors, log and continue trying other variants
            console.warn(`[send-message] Erro não-retratável detectado (mas continuando tentativas): ${msgText}`);
          }
        }
      } catch (e) {
        lastError = e;
        console.warn('[send-message] Erro inesperado durante tentativa:', e && e.message ? e.message : e);
      }
    }

    if (!succeeded) {
      console.error('[send-message] Todas as tentativas falharam. Último erro:', lastError && lastError.message ? lastError.message : lastError);
      return res.status(500).json({ error: `Falha ao enviar para ${canonical}: nenhuma variação funcionou` });
    }

    // Registrar alias e salvar mensagem na conversa
    try {
      const aliasKey = canonical;
      phoneAliasMap.set(aliasKey, targetConv);
      await saveMessage({
        telefone: canonical,
        body: message,
        fromMe: true,
        msgId: sentMsg?.id?._serialized || `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        targetConversation: targetConv,
      });
    } catch (saveErr) {
      console.warn('[send-message] enviado mas falha ao salvar mensagem:', saveErr && saveErr.message ? saveErr.message : saveErr);
    }

    res.json({ success: true, variant: successfulVariant });
  } catch (e) {
    console.error("[send-message] Erro:", e && e.message ? e.message : e);
    res.status(500).json({ error: e && e.message ? e.message : String(e) });
  }
});

// API: status
app.get("/status", (req, res) => {
  const info = client.info;
  res.json({ connected: !!info, number: info?.wid?.user || null });
});

// Endpoint de debug: salvar mensagem diretamente (apenas localhost)
app.post("/debug/save-message", async (req, res) => {
  try {
    if (req.ip !== '::1' && req.ip !== '127.0.0.1' && req.hostname !== 'localhost') {
      return res.status(403).json({ error: 'forbidden' });
    }
    const { telefone, body, fromMe, msgId, targetConversation } = req.body || {};
    if (!telefone || !msgId) return res.status(400).json({ error: 'telefone and msgId required' });
    await saveMessage({ telefone, body: body || '(mídia)', fromMe: !!fromMe, msgId, targetConversation });
    res.json({ success: true });
  } catch (e) {
    console.error('[debug/save-message] erro:', e && e.message ? e.message : e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// Endpoint para ativar logs verbosos (apenas localhost)
app.post('/debug/enable-verbose', (req, res) => {
  try {
    if (req.ip !== '::1' && req.ip !== '127.0.0.1' && req.hostname !== 'localhost') {
      return res.status(403).json({ error: 'forbidden' });
    }
    enableVerboseFor24h();
    res.json({ success: true, verbose: true });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
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
    const last10 = ensure10Digits(normalizedPhone) || normalizedPhone.slice(-10);
    
    // Tenta com ID exato primeiro
    const directSnap = await db.collection("conversations").doc(normalizedPhone).get();
    if (!directSnap.exists) {
      // Procura por últimos 10 dígitos (mais preciso)
      const allConvs = await db.collection("conversations").get();
      for (const doc of allConvs.docs) {
        const docDigits = doc.id.replace(/\D/g, "");
        if (ensure10Digits(docDigits) === last10) {
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
    blockIfMissingDoc(doc, 'cleanup-invalid-leads');
    const leads = doc.data()?.leads || [];
    
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
    
    blockIfEmptyArray(cleaned, 'cleanup-invalid-leads');
    await crmRef.update(attachLastWriter({ leads: cleaned }, 'cleanup-invalid-leads', 'index-cleanup'));
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

// API: sincronizar histórico do WhatsApp desde um timestamp
app.post('/sync-history', async (req, res) => {
  // Endpoint desativado: sincronização de histórico bloqueada
  return res.status(403).json({ error: 'Sincronização de histórico está DESATIVADA.' });
});

// API: próximos disparos agendados (para dashboard em tempo real)
app.get("/api/next-sends", (req, res) => {
  try {
    const nextSendsFile = join(__dirname, "next-sends.json");
    
    if (!existsSync(nextSendsFile)) {
      return res.json([]);
    }
    
    const data = readFileSync(nextSendsFile, "utf8");
    const nextSends = JSON.parse(data);
    
    res.json(nextSends || []);
  } catch (e) {
    console.error("[/api/next-sends]", e.message);
    res.json([]);
  }
});

// API: falhas de envio (para alertas de reconexão)
app.get("/api/send-failures", (req, res) => {
  try {
    const failuresFile = join(__dirname, "send-failures.json");
    
    if (!existsSync(failuresFile)) {
      return res.json({});
    }
    
    const data = readFileSync(failuresFile, "utf8");
    const failures = JSON.parse(data);
    
    res.json(failures || {});
  } catch (e) {
    console.error("[/api/send-failures]", e.message);
    res.json({});
  }
});

app.listen(PORT, () => {
  // Endpoint para corrigir createdAt das mensagens usando o timestamp real do WhatsApp
  app.post("/fix-conversation-timestamps", async (req, res) => {
    try {
      const conversations = await db.collection("conversations").get();
      let totalMsgs = 0;
      let updatedMsgs = 0;
      for (const conv of conversations.docs) {
        const messagesRef = db.collection("conversations").doc(conv.id).collection("messages");
        const messages = await messagesRef.get();
        for (const msg of messages.docs) {
          const data = msg.data();
          totalMsgs++;
          if (!data.timestamp) continue;
          const correctDate = new Date(data.timestamp * 1000);
          await msg.ref.update({ createdAt: correctDate });
          updatedMsgs++;
        }
      }
      res.send(`Timestamps corrigidos com sucesso. Mensagens atualizadas: ${updatedMsgs} / ${totalMsgs}`);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  console.log(`\nServidor CRM WhatsApp na porta ${PORT}\n`);
});

// SPA fallback: serve index.html for unknown GET routes AFTER API routes are declared
if (existsSync(FRONTEND_DIST)) {
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next();
    // don't override API or media routes
    const p = req.path || '';
    if (p.startsWith('/api/') || p === '/status' || p.startsWith('/send-message') || p.startsWith('/media') || p.startsWith('/qr') || p.startsWith('/debug')) return next();
    res.sendFile(join(FRONTEND_DIST, 'index.html'));
  });
}

console.log("Iniciando WhatsApp... aguarde o QR Code...\n");
client.initialize();

// Corrige ordenação das mensagens/conversas para exibir a mais recente primeiro
// API: lista de conversas ordenadas por lastMessageAt (mais recente primeiro)
app.get("/conversations", async (req, res) => {
  try {
    const convSnaps = await db.collection("conversations").orderBy("lastMessageAt", "desc").get();
    const conversations = convSnaps.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(conversations);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: lista de mensagens de uma conversa, ordenadas por timestamp (mais recente primeiro)
app.get("/conversations/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const msgSnaps = await db.collection("conversations").doc(id).collection("messages").orderBy("timestamp", "desc").get();
    const messages = msgSnaps.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
