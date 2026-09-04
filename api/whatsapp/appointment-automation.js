import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";
import { canonicalPhoneKey, findLeadIndex, whatsappPhone } from "../../server/whatsappAgent.js";

async function requireFirebaseUser(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  return getAdminAuth().verifyIdToken(header.slice("Bearer ".length).trim());
}

function safeId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);
}

function parseAppointment(value) {
  const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const appointment = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
  if (Number.isNaN(appointment.getTime())) return null;
  const dayStart = new Date(`${year}-${month}-${day}T00:00:00-03:00`);
  const todayAtEight = new Date(`${year}-${month}-${day}T08:00:00-03:00`);
  return {
    appointment,
    dayStart,
    todayAtEight,
    key: `${year}${month}${day}_${hour}${minute}`,
  };
}

function isAppointmentAutomation(data = {}) {
  return [
    "appointment_confirmation",
    "appointment_reminder_24h",
    "appointment_reminder_today",
  ].includes(String(data.automationType || ""));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await requireFirebaseUser(req);
    const body = req.body || {};
    const clinicId = String(body.clinicId || "").trim();
    const leadId = String(body.leadId || "").trim();
    const appointmentValue = String(body.appointment || "").trim();
    const messages = body.messages && typeof body.messages === "object" ? body.messages : {};

    if (!clinicId || !leadId) return res.status(400).json({ error: "clinicId e leadId obrigatórios" });
    const parsed = parseAppointment(appointmentValue);
    if (!parsed) return res.status(400).json({ error: "Data de agendamento inválida" });

    const db = getAdminDb();
    const clinicRef = db.collection("clinics").doc(clinicId);
    const sharedRef = clinicRef.collection("shared").doc("shared");
    const queueCol = clinicRef.collection("whatsappQueue");
    const scheduleCol = clinicRef.collection("whatsappSchedule");

    const sharedSnap = await sharedRef.get();
    if (!sharedSnap.exists) return res.status(404).json({ error: "Base da clínica não encontrada" });
    const shared = sharedSnap.data() || {};
    const leads = Array.isArray(shared.leads) ? shared.leads : [];
    const leadIndex = findLeadIndex(leads, { leadId });
    if (leadIndex < 0) return res.status(404).json({ error: "Lead não encontrado" });

    const lead = leads[leadIndex] || {};
    const phone = whatsappPhone(lead.telefone);
    const phoneKey = canonicalPhoneKey(lead.telefone);
    if (!phone || !phoneKey) return res.status(400).json({ error: "Telefone do lead inválido" });

    const now = new Date();
    const nowIso = now.toISOString();
    const appointmentIso = parsed.appointment.toISOString();

    // Remove programações futuras antigas do mesmo lead. Elas serão recriadas abaixo
    // para o horário atual, sem tocar em follow-ups ou mensagens manuais.
    const oldScheduleSnap = await scheduleCol.where("leadId", "==", leadId).get();
    const oldQueueSnap = await queueCol.where("leadId", "==", leadId).get();
    const cleanupBatch = db.batch();
    let cleanupWrites = 0;

    oldScheduleSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (isAppointmentAutomation(data) && String(data.appointmentValue || "") !== appointmentValue) {
        cleanupBatch.delete(doc.ref);
        cleanupWrites += 1;
      }
    });

    oldQueueSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (!isAppointmentAutomation(data)) return;
      if (String(data.appointmentValue || "") === appointmentValue) return;
      const status = String(data.status || "");
      if (status === "pending" || status === "leased") {
        cleanupBatch.set(doc.ref, {
          status: "cancelled",
          cancelledAt: nowIso,
          cancelReason: "appointment_rescheduled",
          updatedAt: nowIso,
        }, { merge: true });
        cleanupWrites += 1;
      }
    });

    if (cleanupWrites) await cleanupBatch.commit();

    const specs = [
      {
        suffix: "confirmation",
        automationType: "appointment_confirmation",
        automationLabel: "Confirmação de agendamento",
        message: String(messages.confirmation || "").trim(),
        sendAfter: now,
        expiresAt: parsed.appointment,
        immediate: true,
      },
      {
        suffix: "24h",
        automationType: "appointment_reminder_24h",
        automationLabel: "Lembrete • amanhã",
        message: String(messages.h24 || "").trim(),
        sendAfter: new Date(parsed.appointment.getTime() - 24 * 60 * 60 * 1000),
        expiresAt: parsed.dayStart,
        immediate: false,
      },
      {
        suffix: "today",
        automationType: "appointment_reminder_today",
        automationLabel: "Lembrete • hoje",
        message: String(messages.today || "").trim(),
        sendAfter: parsed.todayAtEight,
        expiresAt: parsed.appointment,
        immediate: false,
      },
    ];

    const scheduled = [];
    const skipped = [];
    let confirmationQueued = false;

    for (const spec of specs) {
      if (!spec.message) {
        skipped.push(`${spec.suffix}:sem_mensagem`);
        continue;
      }
      if (spec.expiresAt.getTime() <= now.getTime()) {
        skipped.push(`${spec.suffix}:expirado`);
        continue;
      }
      if (!spec.immediate && spec.sendAfter.getTime() <= now.getTime()) {
        skipped.push(`${spec.suffix}:janela_passou`);
        continue;
      }
      if (spec.sendAfter.getTime() >= spec.expiresAt.getTime()) {
        skipped.push(`${spec.suffix}:horario_invalido`);
        continue;
      }

      const id = `appt_${safeId(leadId)}_${parsed.key}_${spec.suffix}`;
      const queueRef = queueCol.doc(id);
      const queueSnap = await queueRef.get();
      const existingQueueStatus = queueSnap.exists ? String(queueSnap.data()?.status || "") : "";
      if (["pending", "leased", "sent"].includes(existingQueueStatus)) {
        skipped.push(`${spec.suffix}:ja_programado`);
        if (spec.immediate && existingQueueStatus !== "sent") confirmationQueued = true;
        continue;
      }

      const baseData = {
        clinicId,
        leadId,
        phone,
        phoneKey,
        name: String(lead.nome || "").trim().slice(0, 150),
        message: spec.message.slice(0, 4000),
        kind: "manual",
        automationType: spec.automationType,
        automationLabel: spec.automationLabel,
        appointmentValue,
        appointmentIso,
        expiresAt: spec.expiresAt.toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: user.uid,
        attempts: 0,
      };

      if (spec.immediate) {
        await queueRef.set({
          ...baseData,
          status: "pending",
          sendAfter: nowIso,
        }, { merge: true });
        confirmationQueued = true;
      } else {
        await scheduleCol.doc(id).set({
          ...baseData,
          queueId: id,
          sendAfter: spec.sendAfter.toISOString(),
        }, { merge: true });
        scheduled.push(spec.automationType);
      }
    }

    return res.status(200).json({
      ok: true,
      confirmationQueued,
      scheduled,
      skipped,
      appointment: appointmentValue,
    });
  } catch (error) {
    const status = error?.statusCode || (String(error?.code || "").includes("auth/") ? 401 : 500);
    console.error("[appointment-automation]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro ao programar mensagens" });
  }
}
