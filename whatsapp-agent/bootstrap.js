import "dotenv/config";
import pkg from "whatsapp-web.js";

const { Client } = pkg;
const BASE_URL = String(process.env.REDE_LEADS_URL || "https://rede-leads.vercel.app").replace(/\/$/, "");
const CLINIC_ID = String(process.env.CLINIC_ID || "odontocompany-olimpia").trim();
const AGENT_SECRET = String(process.env.WHATSAPP_AGENT_SECRET || "").trim();

const messagePhones = new Map();
const originalEmit = Client.prototype.emit;

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeBrazilPhone(value) {
  let digits = digitsOnly(value);
  if (!digits) return "";
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  return digits.startsWith("55") && digits.length >= 12 && digits.length <= 13 ? digits : "";
}

function messageIdOf(msg) {
  return String(msg?.id?._serialized || msg?.id?.id || "").trim();
}

async function resolvePhone(msg) {
  const direct = normalizeBrazilPhone(msg?.to || msg?._data?.to || "");
  if (direct) return direct;

  try {
    const chat = await msg.getChat();
    const fromChat = normalizeBrazilPhone(chat?.id?.user || chat?.id?._serialized || "");
    if (fromChat) return fromChat;
  } catch {
    // Alguns eventos ACK não expõem chat resolvível; usamos o cache do message_create.
  }
  return "";
}

async function publishAck(msg, ack) {
  const messageId = messageIdOf(msg);
  if (!messageId || !CLINIC_ID || !AGENT_SECRET) return;

  let phone = messagePhones.get(messageId) || "";
  if (!phone) phone = await resolvePhone(msg);
  if (!phone) return;

  const response = await fetch(`${BASE_URL}/api/whatsapp/agent/inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-whatsapp-agent-secret": AGENT_SECRET,
    },
    body: JSON.stringify({
      clinicId: CLINIC_ID,
      direction: "ack",
      phone,
      messageId,
      ack: Number(ack),
      messageType: "ack",
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  if (Number(ack) >= 3) messagePhones.delete(messageId);
}

Client.prototype.emit = function patchedEmit(event, ...args) {
  if (event === "message_create") {
    const msg = args[0];
    if (msg?.fromMe) {
      Promise.resolve().then(async () => {
        const messageId = messageIdOf(msg);
        if (!messageId) return;
        const phone = await resolvePhone(msg);
        if (!phone) return;
        messagePhones.set(messageId, phone);
        if (messagePhones.size > 1000) {
          const oldest = messagePhones.keys().next().value;
          if (oldest) messagePhones.delete(oldest);
        }
      }).catch(() => {});
    }
  }

  if (event === "message_ack") {
    const [msg, ack] = args;
    if (msg?.fromMe) {
      Promise.resolve().then(() => publishAck(msg, ack)).catch((error) => {
        console.warn("[ack] não foi possível atualizar status no Rede Leads:", error?.message || error);
      });
    }
  }

  return originalEmit.call(this, event, ...args);
};

await import("./index.js");
