import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { findLeadIndex } from "../../../server/whatsappAgent.js";

function isFinalLead(lead = {}) {
  const stage = String(lead.etapaLead || "").toLowerCase();
  return Boolean(
    lead._deleted ||
    lead.comparecimento === "COMPARECEU" ||
    lead.lembretes?.disabled === true ||
    stage === "finalizado" ||
    stage === "desistência" ||
    stage === "desistencia" ||
    stage === "fora da região" ||
    stage === "fora da regiao"
  );
}

async function promoteDueScheduled(db, clinicId) {
  const clinicRef = db.collection("clinics").doc(clinicId);
  const scheduleCol = clinicRef.collection("whatsappSchedule");
  const queueCol = clinicRef.collection("whatsappQueue");
  const now = new Date();
  const nowIso = now.toISOString();

  const dueSnap = await scheduleCol.where("sendAfter", "<=", nowIso).limit(20).get();
  if (dueSnap.empty) return 0;

  const sharedSnap = await clinicRef.collection("shared").doc("shared").get();
  const shared = sharedSnap.exists ? (sharedSnap.data() || {}) : {};
  const leads = Array.isArray(shared.leads) ? shared.leads : [];
  const queueRefs = dueSnap.docs.map((doc) => queueCol.doc(String(doc.data()?.queueId || doc.id)));
  const existingQueueSnaps = queueRefs.length ? await db.getAll(...queueRefs) : [];
  const batch = db.batch();
  let promoted = 0;

  dueSnap.docs.forEach((scheduleDoc, index) => {
    const data = scheduleDoc.data() || {};
    const queueRef = queueRefs[index];
    const existingStatus = existingQueueSnaps[index]?.exists
      ? String(existingQueueSnaps[index].data()?.status || "")
      : "";
    const expiresAt = Date.parse(String(data.expiresAt || ""));
    const leadIndex = findLeadIndex(leads, { leadId: data.leadId, phone: data.phone });
    const lead = leadIndex >= 0 ? (leads[leadIndex] || {}) : null;
    const appointmentMatches = Boolean(lead && String(lead.dataAgendamento || "") === String(data.appointmentValue || ""));

    if (
      (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) ||
      !lead ||
      !appointmentMatches ||
      isFinalLead(lead) ||
      ["pending", "leased", "sent"].includes(existingStatus)
    ) {
      batch.delete(scheduleDoc.ref);
      return;
    }

    batch.set(queueRef, {
      ...data,
      status: "pending",
      promotedAt: nowIso,
      updatedAt: nowIso,
      attempts: Number(data.attempts || 0) || 0,
    }, { merge: true });
    batch.delete(scheduleDoc.ref);
    promoted += 1;
  });

  await batch.commit();
  return promoted;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireWhatsAppAgent(req);
    const clinicId = String(req.query.clinicId || "").trim();
    const limit = Math.max(1, Math.min(Number(req.query.limit || 10) || 10, 20));
    const recover = String(req.query.recover || "") === "1";
    const requestedKind = ["manual", "followup"].includes(String(req.query.kind || "")) ? String(req.query.kind) : "";
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const db = getAdminDb();
    const col = db.collection("clinics").doc(clinicId).collection("whatsappQueue");
    const now = Date.now();

    // O agente já consulta mensagens manuais a cada poucos segundos. Para não gerar
    // leituras desnecessárias, varremos a agenda futura só perto do início de cada minuto.
    if (requestedKind === "manual" && new Date().getUTCSeconds() < 10) {
      await promoteDueScheduled(db, clinicId).catch((error) => {
        console.warn("[whatsapp-agent/pull] falha ao promover lembretes:", error?.message || error);
      });
    }

    if (recover) {
      const leasedSnap = await col.where("status", "==", "leased").limit(50).get();
      const stale = leasedSnap.docs.filter((doc) => {
        const expiresAt = Date.parse(String(doc.data()?.leaseExpiresAt || ""));
        return !Number.isFinite(expiresAt) || expiresAt <= now;
      });
      if (stale.length) {
        const recoveryBatch = db.batch();
        const nowIso = new Date().toISOString();
        stale.forEach((doc) => recoveryBatch.set(doc.ref, {
          status: "pending",
          leaseRecoveredAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true }));
        await recoveryBatch.commit();
      }
    }

    const snap = await col.where("status", "==", "pending").limit(60).get();
    if (snap.empty) return res.status(200).json({ ok: true, items: [] });

    const nowMs = Date.now();
    let docs = [...snap.docs].filter((doc) => {
      const data = doc.data() || {};
      const sendAfter = Date.parse(String(data.sendAfter || ""));
      const expiresAt = Date.parse(String(data.expiresAt || ""));
      if (Number.isFinite(sendAfter) && sendAfter > nowMs) return false;
      if (Number.isFinite(expiresAt) && expiresAt <= nowMs) return false;
      return true;
    });

    if (requestedKind) {
      docs = docs.filter((doc) => String(doc.data()?.kind || "manual") === requestedKind);
    } else {
      docs.sort((a, b) => {
        const aData = a.data() || {};
        const bData = b.data() || {};
        const aPriority = String(aData.kind || "manual") === "manual" ? 0 : 1;
        const bPriority = String(bData.kind || "manual") === "manual" ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return String(aData.createdAt || "").localeCompare(String(bData.createdAt || ""));
      });
    }
    docs = docs.slice(0, limit);
    if (!docs.length) return res.status(200).json({ ok: true, items: [] });

    const leaseAt = new Date();
    const leaseExpiresAt = new Date(leaseAt.getTime() + 45 * 60 * 1000).toISOString();
    const batch = db.batch();
    const items = docs.map((doc) => {
      const data = doc.data() || {};
      batch.set(doc.ref, {
        status: "leased",
        leasedAt: leaseAt.toISOString(),
        leaseExpiresAt,
        attempts: (Number(data.attempts || 0) || 0) + 1,
        updatedAt: leaseAt.toISOString(),
      }, { merge: true });
      return {
        id: doc.id,
        leadId: data.leadId || "",
        phone: data.phone || "",
        name: data.name || "",
        message: data.message || "",
        kind: data.kind || "manual",
      };
    });

    await batch.commit();
    return res.status(200).json({ ok: true, items });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/pull]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro" });
  }
}
