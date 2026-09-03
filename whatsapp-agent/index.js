import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;

const BASE_URL = String(process.env.REDE_LEADS_URL || "https://rede-leads.vercel.app").replace(/\/$/, "");
const CLINIC_ID = String(process.env.CLINIC_ID || "odontocompany-olimpia").trim();
const AGENT_SECRET = String(process.env.WHATSAPP_AGENT_SECRET || "").trim();
const MIN_DELAY_SECONDS = Math.max(60, Number(process.env.MIN_DELAY_SECONDS || 150) || 150);
const MAX_DELAY_SECONDS = Math.max(MIN_DELAY_SECONDS, Number(process.env.MAX_DELAY_SECONDS || 270) || 270);
const IDLE_POLL_SECONDS = Math.max(5, Number(process.env.IDLE_POLL_SECONDS || 8) || 8);
const AGENT_VERSION = "2.1.0";

if (!CLINIC_ID || !AGENT_SECRET) {
  console.error("\n[agent] Configure CLINIC_ID e WHATSAPP_AGENT_SECRET no arquivo .env antes de iniciar.\n");
  process.exit(1);
}

const STATE_DIR = path.join(process.cwd(), ".agent-state");
const SENT_CACHE_FILE = path.join(STATE_DIR, "sent-cache.json");
fs.mkdirSync(STATE_DIR, { recursive: true });

function loadSentCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SENT_CACHE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let sentCache = loadSentCache();
function persistSentCache() {
  try {
    const entries = Object.entries(sentCache).slice(-500);
    sentCache = Object.fromEntries(entries);
    fs.writeFileSync(SENT_CACHE_FILE, JSON.stringify(sentCache, null, 2));
  } catch (error) {
    console.warn("[agent] não foi possível salvar cache local:", error?.message || error);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function candidatePhones(raw) {
  let digits = digitsOnly(raw);
  if (!digits) return [];
  if (digits.startsWith("55")) digits = digits.slice(2);

  const variants = [];
  if (digits.length === 11 && digits[2] === "9") {
    variants.push(`55${digits}`);
    variants.push(`55${digits.slice(0, 2)}${digits.slice(3)}`);
  } else if (digits.length === 10) {
    const subscriberFirst = Number(digits[2]);
    if (subscriberFirst >= 6) variants.push(`55${digits.slice(0, 2)}9${digits.slice(2)}`);
    variants.push(`55${digits}`);
  } else if (digits.length >= 12 && digits.length <= 13) {
    variants.push(digits.startsWith("55") ? digits : `55${digits}`);
  }

  return [...new Set(variants)];
}

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-whatsapp-agent-secret": AGENT_SECRET,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

async function heartbeat({ connected, connectedPhone = "", lastError = null, qrCode = undefined }) {
  try {
    const body = {
      clinicId: CLINIC_ID,
      connected,
      connectedPhone,
      lastError,
      agentVersion: AGENT_VERSION,
      hostname: os.hostname(),
    };
    if (qrCode !== undefined) body.qrCode = qrCode;
    await api("/api/whatsapp/agent/heartbeat", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.warn("[agent] heartbeat falhou:", error?.message || error);
  }
}

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: `rede-leads-${CLINIC_ID}`,
    dataPath: path.join(STATE_DIR, "auth"),
  }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

let connected = false;
let connectedPhone = "";
let queueRunning = false;
let firstPull = true;
let queueTimer = null;
let nextFollowupAt = 0;

async function resolveWhatsAppId(phone) {
  for (const candidate of candidatePhones(phone)) {
    try {
      const id = await client.getNumberId(candidate);
      if (id?._serialized) return id._serialized;
    } catch {
      // tenta a próxima variação
    }
  }
  return null;
}

async function reportResult(queueId, status, extra = {}) {
  return api("/api/whatsapp/agent/result", {
    method: "POST",
    body: JSON.stringify({ clinicId: CLINIC_ID, queueId, status, ...extra }),
  });
}

async function canStillSend(queueId) {
  const query = new URLSearchParams({ clinicId: CLINIC_ID, queueId });
  return api(`/api/whatsapp/agent/check?${query.toString()}`);
}

async function pullQueue(kind, limit = 1, recover = false) {
  const query = new URLSearchParams({
    clinicId: CLINIC_ID,
    limit: String(limit),
    kind,
    recover: recover ? "1" : "0",
  });
  const result = await api(`/api/whatsapp/agent/pull?${query.toString()}`);
  return Array.isArray(result?.items) ? result.items : [];
}

function scheduleQueuePoll(delayMs = IDLE_POLL_SECONDS * 1000) {
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = setTimeout(() => processQueue().catch(() => {}), delayMs);
}

async function sendQueueItem(item) {
  const cached = sentCache[item.id];
  if (cached?.messageId) {
    console.log(`[fila] ${item.name || item.phone}: já enviado localmente; confirmando no Rede Leads.`);
    await reportResult(item.id, "sent", { messageId: cached.messageId }).catch((error) => {
      console.warn("[fila] não foi possível confirmar envio em cache:", error?.message || error);
    });
    return true;
  }

  let check;
  try {
    check = await canStillSend(item.id);
  } catch (error) {
    console.warn(`[fila] falha ao validar ${item.name || item.phone}; não vou enviar:`, error?.message || error);
    return false;
  }
  if (!check?.allowed) {
    console.log(`[fila] cancelado: ${item.name || item.phone} (${check?.reason || "bloqueado"}).`);
    return false;
  }

  const target = await resolveWhatsAppId(item.phone);
  if (!target) {
    const error = "Número não encontrado no WhatsApp";
    console.warn(`[fila] ${item.name || item.phone}: ${error}`);
    await reportResult(item.id, "failed", { error }).catch(() => {});
    return false;
  }

  try {
    try {
      const chat = await client.getChatById(target);
      await chat.sendStateTyping();
      await sleep(item.kind === "followup" ? randomBetween(1200, 3500) : randomBetween(500, 1400));
      await chat.clearState();
    } catch {
      // presença é opcional
    }

    const sent = await client.sendMessage(target, item.message);
    const messageId = sent?.id?._serialized || sent?.id?.id || "";
    sentCache[item.id] = { messageId, sentAt: new Date().toISOString() };
    persistSentCache();
    await reportResult(item.id, "sent", { messageId });
    console.log(`[enviado] ${item.kind === "followup" ? "FU" : "MSG"} • ${item.name || item.phone}`);
    return true;
  } catch (error) {
    console.error(`[erro] ${item.name || item.phone}:`, error?.message || error);
    await reportResult(item.id, "failed", { error: error?.message || String(error) }).catch(() => {});
    return false;
  }
}

async function processQueue() {
  if (!connected || queueRunning) {
    scheduleQueuePoll();
    return;
  }

  queueRunning = true;
  try {
    // Mensagens manuais têm prioridade e não esperam a régua de follow-up.
    const manualItems = await pullQueue("manual", 5, firstPull);
    firstPull = false;
    if (manualItems.length) {
      for (let i = 0; i < manualItems.length && connected; i += 1) {
        await sendQueueItem(manualItems[i]);
        if (i < manualItems.length - 1) await sleep(randomBetween(900, 2200));
      }
    }

    // Follow-up automático: no máximo um por janela aleatória de 150–270s.
    if (connected && Date.now() >= nextFollowupAt) {
      const followupItems = await pullQueue("followup", 1, false);
      if (followupItems.length) {
        await sendQueueItem(followupItems[0]);
        const waitSeconds = randomBetween(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS);
        nextFollowupAt = Date.now() + waitSeconds * 1000;
        console.log(`[fila] próximo follow-up automático liberado em ~${waitSeconds}s.`);
      }
    }
  } catch (error) {
    console.warn("[fila] erro ao processar:", error?.message || error);
  } finally {
    queueRunning = false;
    scheduleQueuePoll();
  }
}

async function resolveInboundIdentity(msg) {
  let contact = null;
  try {
    contact = await msg.getContact();
  } catch {
    // sem contato confiável = não inventar telefone
  }

  const candidates = [contact?.number, contact?.id?.user, msg?.from];
  let phone = null;
  for (const value of candidates) {
    const digits = digitsOnly(value);
    if (digits.length >= 12 && digits.length <= 13 && digits.startsWith("55")) {
      phone = digits;
      break;
    }
  }

  const name = String(
    contact?.pushname ||
    contact?.name ||
    contact?.shortName ||
    msg?._data?.notifyName ||
    ""
  ).trim();
  return { phone, name };
}

function referralFromMessage(msg) {
  const raw = msg?._data?.referral || msg?._data?.ctwaContext || msg?._data?.contextInfo?.externalAdReply || {};
  return {
    sourceId: raw?.sourceId || raw?.source_id || raw?.adId || raw?.ad_id || "",
    sourceUrl: raw?.sourceUrl || raw?.source_url || "",
    headline: raw?.headline || raw?.title || "",
    body: raw?.body || "",
    ctwaClid: raw?.ctwaClid || raw?.ctwa_clid || "",
  };
}

function normalizeMessageType(type) {
  const value = String(type || "text").toLowerCase();
  if (value === "chat") return "text";
  if (value === "ptt" || value === "audio") return "audio";
  if (["image", "video", "document", "sticker"].includes(value)) return value;
  return value || "text";
}

client.on("qr", async (qr) => {
  console.log("\n[WhatsApp] QR gerado. Ele também aparecerá no Rede Leads.\n");
  qrcodeTerminal.generate(qr, { small: true });
  try {
    const qrCode = await QRCode.toDataURL(qr, { width: 360, margin: 1 });
    await heartbeat({ connected: false, connectedPhone: "", qrCode });
  } catch (error) {
    console.warn("[WhatsApp] não foi possível publicar o QR no Rede Leads:", error?.message || error);
  }
});

client.on("authenticated", () => {
  console.log("[WhatsApp] sessão autenticada.");
});

client.on("ready", async () => {
  connected = true;
  connectedPhone = digitsOnly(client?.info?.wid?._serialized || client?.info?.wid?.user || "");
  console.log(`[WhatsApp] conectado${connectedPhone ? `: ${connectedPhone}` : ""}.`);
  await heartbeat({ connected: true, connectedPhone, qrCode: null });
  processQueue().catch(() => {});
});

client.on("auth_failure", async (message) => {
  connected = false;
  console.error("[WhatsApp] falha de autenticação:", message);
  await heartbeat({ connected: false, lastError: String(message || "auth_failure"), qrCode: null });
});

client.on("disconnected", async (reason) => {
  connected = false;
  console.warn("[WhatsApp] desconectado:", reason);
  await heartbeat({ connected: false, lastError: String(reason || "disconnected"), qrCode: null });
});

client.on("message", async (msg) => {
  try {
    if (!msg || msg.fromMe) return;
    const from = String(msg.from || "");
    if (from.endsWith("@g.us") || from === "status@broadcast" || from.endsWith("@newsletter")) return;

    const identity = await resolveInboundIdentity(msg);
    if (!identity.phone) {
      console.warn("[entrada] mensagem ignorada: não consegui resolver um telefone brasileiro confiável.");
      return;
    }

    const messageType = normalizeMessageType(msg.type);
    const payload = {
      clinicId: CLINIC_ID,
      phone: identity.phone,
      name: identity.name,
      text: String(msg.body || ""),
      messageType,
      messageId: msg?.id?._serialized || msg?.id?.id || "",
      referral: referralFromMessage(msg),
    };

    const result = await api("/api/whatsapp/agent/inbound", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(`[entrada] ${identity.name || identity.phone}: ${messageType}${result?.matched ? " → lead existente" : " → triagem"}`);
  } catch (error) {
    console.warn("[entrada] erro:", error?.message || error);
  }
});

setInterval(() => {
  heartbeat({ connected, connectedPhone }).catch(() => {});
}, 5 * 60 * 1000);

process.on("SIGINT", async () => {
  console.log("\n[agent] encerrando...");
  connected = false;
  await heartbeat({ connected: false, connectedPhone, qrCode: null }).catch(() => {});
  try { await client.destroy(); } catch {}
  process.exit(0);
});

console.log("\n=== Rede Leads • WhatsApp Agent v2.1 ===");
console.log(`Clínica: ${CLINIC_ID}`);
console.log(`Rede Leads: ${BASE_URL}`);
console.log(`Follow-ups automáticos: intervalo ${MIN_DELAY_SECONDS}s a ${MAX_DELAY_SECONDS}s`);
console.log(`Mensagens manuais: prioridade, checagem a cada ~${IDLE_POLL_SECONDS}s`);
console.log("O agente NÃO baixa mídia e NÃO lê o Firebase diretamente.\n");

client.initialize();
