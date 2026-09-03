import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";
import { brDateKey, canonicalPhoneKey, whatsappPhone } from "../../server/whatsappAgent.js";

async function requireFirebaseUser(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
  const token = header.slice("Bearer ".length).trim();
  return getAdminAuth().verifyIdToken(token);
}

function safeId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);
}

function nextFollowUpStage(stage) {
  const current = String(stage || "");
  const match = current.match(/^Follow-Up\s+(\d+)$/i);
  if (!match) return "Follow-Up 1";
  const n = Math.min(Number(match[1]) + 1, 12);
  return `Follow-Up ${n}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireFirebaseUser(req);
    const body = req.body || {};
    const clinicId = String(body.clinicId || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });
    if (!items.length) return res.status(400).json({ error: "Nenhuma mensagem informada" });
    if (items.length > 50) return res.status(400).json({ error: "Limite de 50 mensagens por lote" });

    const db = getAdminDb();
    const queueCol = db.collection("clinics").doc(clinicId).collection("whatsappQueue");
    const dayKey = brDateKey();
    const normalized = [];

    for (const raw of items) {
      const leadId = String(raw?.leadId || "").trim();
      const phone = whatsappPhone(raw?.phone);
      const phoneKey = canonicalPhoneKey(raw?.phone);
      const message = String(raw?.message || "").trim();
      const kind = raw?.kind === "followup" ? "followup" : "manual";

      if (!leadId || !phone || !phoneKey || !message) continue;
      if (message.length > 4000) continue;

      const requestId = safeId(raw?.clientRequestId || "");
      const manualSuffix = requestId || safeId(`${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
      const id = kind === "followup"
        ? `fu_${dayKey}_${safeId(leadId)}`
        : `msg_${dayKey}_${safeId(leadId)}_${manualSuffix}`;

      normalized.push({
        id,
        leadId,
        phone,
        phoneKey,
        name: String(raw?.name || "").trim().slice(0, 150),
        message,
        kind,
        clientRequestId: requestId,
        nextStage: raw?.nextStage || nextFollowUpStage(raw?.stage),
        stageBefore: String(raw?.stage || ""),
      });
    }

    if (!normalized.length) {
      return res.status(400).json({ error: "Nenhuma mensagem válida no lote" });
    }

    const refs = normalized.map((item) => queueCol.doc(item.id));
    const existingSnaps = await db.getAll(...refs);
    const batch = db.batch();
    const nowIso = new Date().toISOString();
    let queued = 0;
    let skipped = 0;
    const queuedIds = [];
    const skippedIds = [];

    normalized.forEach((item, index) => {
      const existing = existingSnaps[index];
      const currentStatus = existing.exists ? String(existing.data()?.status || "") : "";
      if (["pending", "leased", "sent"].includes(currentStatus)) {
        skipped += 1;
        skippedIds.push(item.leadId);
        return;
      }

      batch.set(refs[index], {
        clinicId,
        leadId: item.leadId,
        phone: item.phone,
        phoneKey: item.phoneKey,
        name: item.name,
        message: item.message,
        kind: item.kind,
        clientRequestId: item.clientRequestId,
        stageBefore: item.stageBefore,
        nextStage: item.nextStage,
        status: "pending",
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user.uid,
        attempts: 0,
        dayKey,
      }, { merge: true });
      queued += 1;
      queuedIds.push(item.leadId);
    });

    if (queued > 0) await batch.commit();

    return res.status(200).json({ ok: true, queued, skipped, total: normalized.length, queuedIds, skippedIds });
  } catch (error) {
    const status = error?.statusCode || (String(error?.code || "").includes("auth/") ? 401 : 500);
    console.error("[whatsapp-queue]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : "Erro ao criar fila" });
  }
}
