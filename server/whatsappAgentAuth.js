import crypto from "node:crypto";
import { getAdminDb } from "./firebaseAdmin.js";

function timingSafeStringEqual(aValue, bValue) {
  const a = Buffer.from(String(aValue || ""));
  const b = Buffer.from(String(bValue || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

export function hashWhatsAppAgentSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

export async function requireWhatsAppAgent(req) {
  const provided = String(req.headers["x-whatsapp-agent-secret"] || "").trim();
  if (!provided) {
    const err = new Error("Chave do agente não informada");
    err.statusCode = 401;
    throw err;
  }

  // Compatibilidade com a configuração antiga via Vercel, se existir.
  const globalExpected = String(process.env.WHATSAPP_AGENT_SECRET || "").trim();
  if (globalExpected && timingSafeStringEqual(globalExpected, provided)) return true;

  const clinicId = String(req.body?.clinicId || req.query?.clinicId || "").trim();
  if (!clinicId) {
    const err = new Error("clinicId obrigatório para autenticar o agente");
    err.statusCode = 400;
    throw err;
  }

  const snap = await getAdminDb()
    .collection("clinics")
    .doc(clinicId)
    .collection("integrations")
    .doc("whatsappAgent")
    .get();

  const expectedHash = snap.exists ? String(snap.data()?.agentSecretHash || "") : "";
  if (!expectedHash) {
    const err = new Error("Agente ainda não pareado. Gere uma chave no Rede Leads.");
    err.statusCode = 503;
    throw err;
  }

  const providedHash = hashWhatsAppAgentSecret(provided);
  if (!timingSafeStringEqual(expectedHash, providedHash)) {
    const err = new Error("Unauthorized agent");
    err.statusCode = 401;
    throw err;
  }

  return true;
}
