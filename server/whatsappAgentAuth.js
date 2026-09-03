import crypto from "node:crypto";
import { getAdminDb } from "./firebaseAdmin.js";

function timingSafeStringEqual(aValue, bValue) {
  const a = Buffer.from(String(aValue || ""));
  const b = Buffer.from(String(bValue || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function signingSecret() {
  const value = String(
    process.env.WHATSAPP_AGENT_SIGNING_SECRET ||
    process.env.CRON_SECRET ||
    process.env.FIREBASE_PRIVATE_KEY ||
    ""
  ).trim();
  if (!value) {
    const err = new Error("Chave de assinatura do agente não configurada no servidor");
    err.statusCode = 503;
    throw err;
  }
  return value;
}

function signPayload(encodedPayload) {
  return crypto.createHmac("sha256", signingSecret()).update(encodedPayload).digest("base64url");
}

export function hashWhatsAppAgentSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

export function issueWhatsAppAgentToken(clinicId) {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    clinicId: String(clinicId || "").trim(),
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(12).toString("base64url"),
  })).toString("base64url");
  return `rlwa1.${payload}.${signPayload(payload)}`;
}

function verifySignedToken(token, expectedClinicId) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "rlwa1") return false;
  const [, encodedPayload, signature] = parts;
  const expectedSignature = signPayload(encodedPayload);
  if (!timingSafeStringEqual(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return payload?.v === 1 && String(payload?.clinicId || "") === String(expectedClinicId || "");
  } catch {
    return false;
  }
}

export async function requireWhatsAppAgent(req) {
  const provided = String(req.headers["x-whatsapp-agent-secret"] || "").trim();
  if (!provided) {
    const err = new Error("Chave do agente não informada");
    err.statusCode = 401;
    throw err;
  }

  const clinicId = String(req.body?.clinicId || req.query?.clinicId || "").trim();
  if (!clinicId) {
    const err = new Error("clinicId obrigatório para autenticar o agente");
    err.statusCode = 400;
    throw err;
  }

  // Chaves novas são tokens HMAC verificáveis localmente no servidor: zero leitura no Firestore.
  if (verifySignedToken(provided, clinicId)) return true;

  // Compatibilidade com configuração antiga via variável global, se existir.
  const globalExpected = String(process.env.WHATSAPP_AGENT_SECRET || "").trim();
  if (globalExpected && timingSafeStringEqual(globalExpected, provided)) return true;

  // Compatibilidade temporária com chaves pareadas no modelo anterior. Só esse caminho legado lê o Firestore.
  const snap = await getAdminDb()
    .collection("clinics")
    .doc(clinicId)
    .collection("integrations")
    .doc("whatsappAgent")
    .get();
  const expectedHash = snap.exists ? String(snap.data()?.agentSecretHash || "") : "";
  if (expectedHash && timingSafeStringEqual(expectedHash, hashWhatsAppAgentSecret(provided))) return true;

  const err = new Error("Unauthorized agent");
  err.statusCode = 401;
  throw err;
}
