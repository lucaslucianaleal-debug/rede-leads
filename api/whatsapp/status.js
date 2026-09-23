import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";
import { issueWhatsAppAgentToken } from "../../server/whatsappAgentAuth.js";

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

function clinicAppointmentIdFromQueue(data = {}) {
  const explicit = String(data?.clinicAppointmentId || "").trim();
  if (explicit) return explicit;
  const leadId = String(data?.leadId || "").trim();
  return leadId.startsWith("clinic_") ? leadId : "";
}

async function reconcileClinicQueue(db, clinicId, integrationRef, integrationData = {}) {
  const lastRunMs = Date.parse(String(integrationData.lastClinicQueueReconcileAt || ""));
  if (Number.isFinite(lastRunMs) && Date.now() - lastRunMs < 20_000) return;

  const clinicRef = db.collection("clinics").doc(clinicId);
  const queueSnap = await clinicRef
    .collection("whatsappQueue")
    .where("status", "in", ["sent", "failed"])
    .limit(120)
    .get();

  const clinicQueueDocs = queueSnap.docs
    .map((queueDoc) => ({ queueDoc, data: queueDoc.data() || {} }))
    .map((item) => ({ ...item, appointmentId: clinicAppointmentIdFromQueue(item.data) }))
    .filter((item) => item.appointmentId);

  if (!clinicQueueDocs.length) {
    await integrationRef.set({ lastClinicQueueReconcileAt: new Date().toISOString() }, { merge: true });
    return;
  }

  const appointmentRefs = clinicQueueDocs.map((item) => clinicRef.collection("clinicAgenda").doc(item.appointmentId));
  const appointmentSnaps = await db.getAll(...appointmentRefs);
  const batch = db.batch();
  const nowIso = new Date().toISOString();
  let writes = 0;

  clinicQueueDocs.forEach((item, index) => {
    const queue = item.data;
    const appointmentSnap = appointmentSnaps[index];
    const queueNeedsIdentity = !String(queue.automationType || "").startsWith("appointment_")
      || !String(queue.automationLabel || "").trim()
      || !String(queue.clinicAppointmentId || "").trim();

    if (queueNeedsIdentity) {
      batch.set(item.queueDoc.ref, {
        clinicAppointmentId: item.appointmentId,
        automationType: "appointment_clinic_manual",
        automationLabel: "Confirmação da clínica",
        updatedAt: String(queue.updatedAt || nowIso),
      }, { merge: true });
      writes += 1;
    }

    if (!appointmentSnap.exists) return;
    const appointment = appointmentSnap.data() || {};

    if (String(queue.status) === "sent") {
      const sentAt = String(queue.sentAt || queue.updatedAt || nowIso);
      if (!appointment.remindersSent?.manual || appointment.confirmationStatus === "queued") {
        batch.set(appointmentSnap.ref, {
          confirmationStatus: "sent",
          remindersSent: {
            ...(appointment.remindersSent || {}),
            manual: sentAt,
          },
          lastReminderSentAt: sentAt,
          lastReminderMessageId: String(queue.messageId || appointment.lastReminderMessageId || ""),
          lastReminderError: null,
          updatedAt: nowIso,
        }, { merge: true });
        writes += 1;
      }
    } else if (String(queue.status) === "failed") {
      const failedAt = String(queue.failedAt || queue.updatedAt || nowIso);
      if (appointment.confirmationStatus === "queued" || appointment.lastReminderError !== queue.error) {
        batch.set(appointmentSnap.ref, {
          confirmationStatus: "pending",
          lastReminderFailedAt: failedAt,
          lastReminderError: String(queue.error || "Falha no envio").slice(0, 500),
          updatedAt: nowIso,
        }, { merge: true });
        writes += 1;
      }
    }
  });

  batch.set(integrationRef, { lastClinicQueueReconcileAt: nowIso }, { merge: true });
  writes += 1;
  if (writes) await batch.commit();
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await requireFirebaseUser(req);
    const clinicId = String(req.method === "POST" ? req.body?.clinicId : req.query.clinicId || "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const db = getAdminDb();
    const ref = db
      .collection("clinics")
      .doc(clinicId)
      .collection("integrations")
      .doc("whatsappAgent");

    if (req.method === "POST") {
      const action = String(req.body?.action || "pair").trim();
      if (action === "pair") {
        const secret = issueWhatsAppAgentToken(clinicId);
        const nowIso = new Date().toISOString();
        await ref.set({
          agentSecretHash: null,
          pairedAt: nowIso,
          pairedBy: user.uid,
          authMode: "signed-token-v1",
          connected: false,
          connectedPhone: "",
          qrCode: null,
          qrUpdatedAt: null,
          lastError: null,
          updatedAt: nowIso,
        }, { merge: true });
        return res.status(200).json({ ok: true, agentSecret: secret });
      }

      if (action === "revoke") {
        const nowIso = new Date().toISOString();
        await ref.set({
          agentSecretHash: null,
          pairedAt: null,
          pairedBy: null,
          authMode: null,
          connected: false,
          connectedPhone: "",
          qrCode: null,
          qrUpdatedAt: null,
          updatedAt: nowIso,
        }, { merge: true });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: "Ação inválida" });
    }

    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(200).json({ configured: false, paired: false, online: false, connected: false, qrCode: null });
    }

    const data = snap.data() || {};

    try {
      await reconcileClinicQueue(db, clinicId, ref, data);
    } catch (error) {
      console.warn("[whatsapp-status] falha ao reconciliar confirmações da clínica:", error?.message || error);
    }

    const lastSeenMs = Date.parse(String(data.lastSeenAt || ""));
    const online = Number.isFinite(lastSeenMs) && (Date.now() - lastSeenMs) < 10 * 60 * 1000;
    const connected = online && data.connected === true;
    const qrUpdatedMs = Date.parse(String(data.qrUpdatedAt || ""));
    const qrFresh = !connected && Number.isFinite(qrUpdatedMs) && (Date.now() - qrUpdatedMs) < 2 * 60 * 1000;

    return res.status(200).json({
      configured: true,
      paired: !!data.pairedAt || !!data.agentSecretHash || !!String(process.env.WHATSAPP_AGENT_SECRET || "").trim(),
      online,
      connected,
      lastSeenAt: data.lastSeenAt || null,
      connectedPhone: data.connectedPhone || "",
      lastError: data.lastError || null,
      agentVersion: data.agentVersion || null,
      qrCode: qrFresh && typeof data.qrCode === "string" ? data.qrCode : null,
      qrUpdatedAt: qrFresh ? data.qrUpdatedAt || null : null,
    });
  } catch (error) {
    const status = error?.statusCode || (String(error?.code || "").includes("auth/") ? 401 : 500);
    console.error("[whatsapp-status]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : "Erro ao consultar agente" });
  }
}
