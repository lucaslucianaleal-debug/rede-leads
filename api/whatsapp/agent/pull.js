import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import legacyPull from "./pull-original.js";

const CLINIC_MANUAL_STALE_MS = 10 * 60 * 1000;
const CLINIC_LEASE_RECOVER_MS = 2 * 60 * 1000;
const LEASE_MS = 3 * 60 * 1000;

function isClinicManual(data = {}) {
  return String(data.leadId || "").startsWith("clinic_") || String(data.automationType || "") === "appointment_clinic_manual";
}

function parseMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function docsByStatusAndKind(col, status, kind, max = 200) {
  try {
    const snap = await col.where("status", "==", status).where("kind", "==", kind).limit(max).get();
    return snap.docs;
  } catch (error) {
    // Fallback para bases sem índice composto pronto. Mantém a fila viva enquanto
    // o Firestore provisiona/usa os índices simples existentes.
    console.warn(`[whatsapp-agent/pull] fallback ${status}/${kind}:`, error?.message || error);
    const snap = await col.where("status", "==", status).limit(500).get();
    return snap.docs.filter((doc) => String(doc.data()?.kind || "manual") === kind);
  }
}

async function recoverLeases(db, clinicRef, kind, now) {
  const col = clinicRef.collection("whatsappQueue");
  const leasedDocs = await docsByStatusAndKind(col, "leased", kind, 100);
  const nowIso = new Date(now).toISOString();
  const batch = db.batch();
  let writes = 0;

  leasedDocs.forEach((doc) => {
    const data = doc.data() || {};
    const leaseExpiresAt = parseMs(data.leaseExpiresAt);
    const leasedAt = parseMs(data.leasedAt);
    const expired = !leaseExpiresAt || leaseExpiresAt <= now;
    const clinicStuck = isClinicManual(data) && leasedAt > 0 && leasedAt + CLINIC_LEASE_RECOVER_MS <= now;
    if (!expired && !clinicStuck) return;
    batch.set(doc.ref, {
      status: "pending",
      leaseRecoveredAt: nowIso,
      leaseExpiresAt: null,
      updatedAt: nowIso,
    }, { merge: true });
    writes += 1;
  });

  if (writes) await batch.commit();
  return writes;
}

async function cancelStaleClinicManual(db, clinicRef, docs, now) {
  const nowIso = new Date(now).toISOString();
  const batch = db.batch();
  const keep = [];
  let writes = 0;

  docs.forEach((doc) => {
    const data = doc.data() || {};
    if (!isClinicManual(data)) {
      keep.push(doc);
      return;
    }

    const createdAt = parseMs(data.createdAt);
    if (!createdAt || now - createdAt <= CLINIC_MANUAL_STALE_MS) {
      keep.push(doc);
      return;
    }

    batch.set(doc.ref, {
      status: "cancelled",
      cancelReason: "stale_clinic_manual_not_replayed",
      cancelledAt: nowIso,
      updatedAt: nowIso,
    }, { merge: true });

    const appointmentId = String(data.clinicAppointmentId || data.leadId || "").trim();
    if (appointmentId.startsWith("clinic_")) {
      batch.set(clinicRef.collection("clinicAgenda").doc(appointmentId), {
        confirmationStatus: "pending",
        lastReminderError: "Envio antigo retirado da fila por segurança. Reenvie manualmente se necessário.",
        updatedAt: nowIso,
      }, { merge: true });
    }
    writes += 1;
  });

  if (writes) await batch.commit();
  return keep;
}

async function pullSeparatedQueue(req, res, kind) {
  await requireWhatsAppAgent(req);
  const clinicId = String(req.query.clinicId || "").trim();
  const requestedLimit = Math.max(1, Math.min(Number(req.query.limit || 10) || 10, 20));
  if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

  const db = getAdminDb();
  const clinicRef = db.collection("clinics").doc(clinicId);
  const col = clinicRef.collection("whatsappQueue");
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Recupera leases em TODA consulta. Antes isso dependia apenas do primeiro pull
  // do processo e um item podia ficar congelado por 45 minutos.
  await recoverLeases(db, clinicRef, kind, now);

  let docs = await docsByStatusAndKind(col, "pending", kind, 200);
  if (kind === "manual") docs = await cancelStaleClinicManual(db, clinicRef, docs, now);

  docs = docs.filter((doc) => {
    const data = doc.data() || {};
    const sendAfter = parseMs(data.sendAfter);
    const expiresAt = parseMs(data.expiresAt);
    if (sendAfter && sendAfter > now) return false;
    if (expiresAt && expiresAt <= now) return false;
    return true;
  });

  docs.sort((a, b) => parseMs(a.data()?.createdAt) - parseMs(b.data()?.createdAt));
  docs = docs.slice(0, requestedLimit);
  if (!docs.length) return null;

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
      kind: data.kind || "manual",
      clientRequestId: data.clientRequestId || "",
      automationType: data.automationType || "",
      automationLabel: data.automationLabel || "",
    };
  });

  await batch.commit();
  return res.status(200).json({ ok: true, items });
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const kind = ["manual", "followup"].includes(String(req.query.kind || "")) ? String(req.query.kind) : "";
  if (!kind) return legacyPull(req, res);

  try {
    const response = await pullSeparatedQueue(req, res, kind);
    if (response) return response;

    // Quando a fila manual está vazia, executa o fluxo legado apenas para manter
    // as rotinas de manutenção/programações já existentes. Se ele promover algo,
    // o próximo poll (em ~8s) pega pelo caminho corrigido acima.
    if (kind === "manual") return legacyPull(req, res);
    return res.status(200).json({ ok: true, items: [] });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/pull-v2]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro" });
  }
}
