import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";

const LEASE_MS = 3 * 60 * 1000;

function parseMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function docsByStatusAndKind(col, status, kind, max = 200) {
  try {
    // Duas igualdades simples. Se o projeto ainda não tiver índice compatível,
    // o fallback abaixo mantém a fila funcionando sem derrubar o agente.
    const snap = await col
      .where("status", "==", status)
      .where("kind", "==", kind)
      .limit(max)
      .get();
    return snap.docs;
  } catch (error) {
    console.warn(`[whatsapp-agent/pull] fallback ${status}/${kind}:`, error?.message || error);
    const snap = await col.where("status", "==", status).limit(500).get();
    return snap.docs.filter((doc) => String(doc.data()?.kind || "manual") === kind);
  }
}

async function recoverExpiredLeases(db, col, kind, now) {
  const leasedDocs = await docsByStatusAndKind(col, "leased", kind, 100);
  const stale = leasedDocs.filter((doc) => {
    const data = doc.data() || {};
    const leaseExpiresAt = parseMs(data.leaseExpiresAt);
    return !leaseExpiresAt || leaseExpiresAt <= now;
  });

  if (!stale.length) return 0;

  const batch = db.batch();
  const nowIso = new Date(now).toISOString();
  stale.forEach((doc) => {
    batch.set(doc.ref, {
      status: "pending",
      leaseRecoveredAt: nowIso,
      leaseExpiresAt: null,
      updatedAt: nowIso,
    }, { merge: true });
  });
  await batch.commit();
  return stale.length;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireWhatsAppAgent(req);

    const clinicId = String(req.query.clinicId || "").trim();
    const kind = ["manual", "followup"].includes(String(req.query.kind || ""))
      ? String(req.query.kind)
      : "manual";
    const limit = Math.max(1, Math.min(Number(req.query.limit || 10) || 10, 20));

    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const db = getAdminDb();
    const col = db.collection("clinics").doc(clinicId).collection("whatsappQueue");
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Sempre recupera leases vencidos. Não depende de reiniciar o agente.
    await recoverExpiredLeases(db, col, kind, now);

    let docs = await docsByStatusAndKind(col, "pending", kind, 200);

    docs = docs.filter((doc) => {
      const data = doc.data() || {};
      const sendAfter = parseMs(data.sendAfter);
      const expiresAt = parseMs(data.expiresAt);
      if (sendAfter && sendAfter > now) return false;
      if (expiresAt && expiresAt <= now) return false;
      return true;
    });

    docs.sort((a, b) => {
      const aCreated = parseMs(a.data()?.createdAt);
      const bCreated = parseMs(b.data()?.createdAt);
      if (aCreated !== bCreated) return aCreated - bCreated;
      return a.id.localeCompare(b.id);
    });

    docs = docs.slice(0, limit);
    if (!docs.length) return res.status(200).json({ ok: true, items: [] });

    const leaseExpiresAt = new Date(now + LEASE_MS).toISOString();
    const batch = db.batch();

    const items = docs.map((doc) => {
      const data = doc.data() || {};
      batch.set(doc.ref, {
        status: "leased",
        leasedAt: nowIso,
        leaseExpiresAt,
        attempts: (Number(data.attempts || 0) || 0) + 1,
        updatedAt: nowIso,
      }, { merge: true });

      return {
        id: doc.id,
        leadId: data.leadId || "",
        phone: data.phone || "",
        name: data.name || "",
        message: data.message || "",
        kind: data.kind || kind,
        clientRequestId: data.clientRequestId || "",
        automationType: data.automationType || "",
        automationLabel: data.automationLabel || "",
      };
    });

    await batch.commit();
    return res.status(200).json({ ok: true, items });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/pull]", error?.message || error);
    return res.status(status).json({
      error: status === 401 ? "Não autorizado" : error?.message || "Erro ao buscar fila",
    });
  }
}
