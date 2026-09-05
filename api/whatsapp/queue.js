import { getAdminAuth, getAdminDb } from "../../server/firebaseAdmin.js";
import { brDateKey, canonicalPhoneKey, findLeadIndex, whatsappPhone } from "../../server/whatsappAgent.js";

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

function parseAppointment(value) {
  const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const appointment = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
  if (Number.isNaN(appointment.getTime())) return null;
  return {
    appointment,
    key: `${year}${month}${day}_${hour}${minute}`,
  };
}

function hoursBefore(date, hours) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

function isAppointmentAutomation(data = {}) {
  return [
    "appointment_confirmation",
    "appointment_reminder_24h",
    "appointment_reminder_12h",
    "appointment_reminder_1h",
    // legado — mantido apenas para permitir limpeza/cancelamento seguro
    "appointment_reminder_today",
  ].includes(String(data.automationType || ""));
}

async function cancelLegacyTodayReminder({ db, clinicRef, leadId, appointmentKey, nowIso }) {
  const legacyId = `appt_${safeId(leadId)}_${appointmentKey}_today`;
  const scheduleRef = clinicRef.collection("whatsappSchedule").doc(legacyId);
  const queueRef = clinicRef.collection("whatsappQueue").doc(legacyId);
  const [scheduleSnap, queueSnap] = await Promise.all([scheduleRef.get(), queueRef.get()]);
  const batch = db.batch();
  let writes = 0;

  if (scheduleSnap.exists) {
    batch.delete(scheduleRef);
    writes += 1;
  }

  if (queueSnap.exists) {
    const status = String(queueSnap.data()?.status || "");
    if (["pending", "leased"].includes(status)) {
      batch.set(queueRef, {
        status: "cancelled",
        cancelReason: "replaced_by_1h_reminder",
        cancelledAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });
      writes += 1;
    }
  }

  if (writes) await batch.commit();
}

async function scheduleAppointmentAutomation({ db, user, clinicId, body }) {
  const leadId = String(body.leadId || "").trim();
  const appointmentValue = String(body.appointment || "").trim();
  const messages = body.messages && typeof body.messages === "object" ? body.messages : {};

  if (!leadId) {
    const err = new Error("leadId obrigatório");
    err.statusCode = 400;
    throw err;
  }

  const parsed = parseAppointment(appointmentValue);
  if (!parsed) {
    const err = new Error("Data de agendamento inválida");
    err.statusCode = 400;
    throw err;
  }

  const clinicRef = db.collection("clinics").doc(clinicId);
  const sharedRef = clinicRef.collection("shared").doc("shared");
  const queueCol = clinicRef.collection("whatsappQueue");
  const scheduleCol = clinicRef.collection("whatsappSchedule");

  const sharedSnap = await sharedRef.get();
  if (!sharedSnap.exists) {
    const err = new Error("Base da clínica não encontrada");
    err.statusCode = 404;
    throw err;
  }

  const shared = sharedSnap.data() || {};
  const leads = Array.isArray(shared.leads) ? shared.leads : [];
  const leadIndex = findLeadIndex(leads, { leadId });
  if (leadIndex < 0) {
    const err = new Error("Lead não encontrado");
    err.statusCode = 404;
    throw err;
  }

  const lead = leads[leadIndex] || {};
  const phone = whatsappPhone(lead.telefone);
  const phoneKey = canonicalPhoneKey(lead.telefone);
  if (!phone || !phoneKey) {
    const err = new Error("Telefone do lead inválido");
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const appointmentIso = parsed.appointment.toISOString();

  // Limpa automações de agendamentos anteriores do mesmo lead.
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

  // Remove a antiga mensagem "no dia" para este mesmo agendamento.
  await cancelLegacyTodayReminder({
    db,
    clinicRef,
    leadId,
    appointmentKey: parsed.key,
    nowIso,
  });

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
      automationLabel: "Lembrete • 24h antes",
      message: String(messages.h24 || "").trim(),
      sendAfter: hoursBefore(parsed.appointment, 24),
      expiresAt: hoursBefore(parsed.appointment, 12),
      immediate: false,
    },
    {
      suffix: "12h",
      automationType: "appointment_reminder_12h",
      automationLabel: "Lembrete • 12h antes",
      message: String(messages.h12 || "").trim(),
      sendAfter: hoursBefore(parsed.appointment, 12),
      expiresAt: hoursBefore(parsed.appointment, 1),
      immediate: false,
    },
    {
      suffix: "1h",
      automationType: "appointment_reminder_1h",
      automationLabel: "Lembrete • 1h antes",
      message: String(messages.h1 || "").trim(),
      sendAfter: hoursBefore(parsed.appointment, 1),
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
      // Se o horário exato do slot já passou, não enviamos uma mensagem "12h" com 6h restantes,
      // por exemplo. A confirmação imediata já cobre agendamentos criados em cima da hora.
      skipped.push(`${spec.suffix}:janela_iniciada`);
      continue;
    }
    if (spec.sendAfter.getTime() >= spec.expiresAt.getTime()) {
      skipped.push(`${spec.suffix}:horario_invalido`);
      continue;
    }

    const id = `appt_${safeId(leadId)}_${parsed.key}_${spec.suffix}`;
    const queueRef = queueCol.doc(id);
    const scheduleRef = scheduleCol.doc(id);
    const [queueSnap, scheduleSnap] = await Promise.all([queueRef.get(), scheduleRef.get()]);
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
      createdAt: scheduleSnap.exists ? (scheduleSnap.data()?.createdAt || nowIso) : nowIso,
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
      await scheduleRef.set({
        ...baseData,
        queueId: id,
        sendAfter: spec.sendAfter.toISOString(),
      }, { merge: true });
      scheduled.push(spec.automationType);
    }
  }

  return {
    ok: true,
    confirmationQueued,
    scheduled,
    skipped,
    appointment: appointmentValue,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireFirebaseUser(req);
    const body = req.body || {};
    const clinicId = String(body.clinicId || "").trim();

    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const db = getAdminDb();

    if (body.action === "schedule_appointment") {
      const result = await scheduleAppointmentAutomation({ db, user, clinicId, body });
      return res.status(200).json(result);
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return res.status(400).json({ error: "Nenhuma mensagem informada" });
    if (items.length > 50) return res.status(400).json({ error: "Limite de 50 mensagens por lote" });

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
    const fallback = status === 401 ? "Não autorizado" : "Erro ao criar fila";
    return res.status(status).json({ error: error?.message || fallback });
  }
}
