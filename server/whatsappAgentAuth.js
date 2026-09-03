import crypto from "node:crypto";

export function requireWhatsAppAgent(req) {
  const expected = String(process.env.WHATSAPP_AGENT_SECRET || "").trim();
  const provided = String(req.headers["x-whatsapp-agent-secret"] || "").trim();

  if (!expected) {
    const err = new Error("WHATSAPP_AGENT_SECRET não configurado no servidor");
    err.statusCode = 503;
    throw err;
  }

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) {
    const err = new Error("Unauthorized agent");
    err.statusCode = 401;
    throw err;
  }
}
