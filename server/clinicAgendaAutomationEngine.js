import { canonicalPhoneKey, whatsappPhone } from "./whatsappAgent.js";

const MAX_AUTOMATIC_MESSAGES_PER_CYCLE = 1;
const AUTO_SEND_START_HOUR = 7;
const AUTO_SEND_END_HOUR = 20;
const PAUSED_CANCEL_REASONS = new Set([
  "clinic_automation_paused_for_safety",
  "clinic_automation_paused",
]);
const MANUAL_STATUSES = new Set(["confirmed", "wont_attend", "cancelled", "reschedule"]);

function safeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140);
}

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function firstName(value) {
  const name = String(value || "").trim().split(/\s+/)[0] || "";
  return name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : "";
}

function prettyProfessional(value) {
  const clean = String(value || "")
    .replace(/\s+-\s+(ORTO|ENDO|ORC|ORÇ).*$/i, "")
    .replace(/\s+-\s*$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return clean.replace(/^Dra\.?\s*/i, "Dra. ") || "profissional";
}

function parseAppointment(data = {}) {
  const match = `${data.date || ""} ${data.startTime || ""}`.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const appointment = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
  if (Number.isNaN(appointment.getTime())) return null;
  return { appointment, date: `${day}/${month}/${year}`, time: `${hour}:${minute}` };
}

function hoursBefore(date, hours) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

function isBlockedName(name) {
  const text = normalizeText(name);
  return text.includes("nao agendar") || text === "feriado" || text.includes("folga") || text.includes("bloqueio") || text.includes("bloqueado");
}

function isTerminalStatus(status) {
  return ["wont_attend", "cancelled", "reschedule", "released_unconfirmed", "late_reply"].includes(String(status || ""));
}

function isConfirmed(status) {
  return String(status || "") === "confirmed";
}

function effectiveAgendaStatus(data = {}) {
  const current = String(data.confirmationStatus || "pending");
  const saved = String(data.manualReviewDecision || "");
  const manualAt = Date.parse(String(data.manualReviewedAt || ""));
  const replyAt = Date.parse(String(data.lastReplyAt || ""));
  const replyClassification = String(data.replyClassification || "");

  const laterExplicitNegative = saved === "confirmed"
    && Number.isFinite(manualAt)
    && Number.isFinite(replyAt)
    && replyAt > manualAt
    && ["wont_attend", "reschedule", "cancelled"].includes(current)
    && (replyClassification === current || current === "cancelled");

  if (laterExplicitNegative) return current;
  if (data.manualReviewedAt && MANUAL_STATUSES.has(saved)) return saved;
  return current;
}

function statusRank(status) {
  return {
    pending: 1,
    queued: 2,
    failed: 3,
    sent: 4,
    replied: 5,
    released_unconfirmed: 6,
    late_reply: 7,
    reschedule: 8,
    wont_attend: 9,
    cancelled: 9,
    confirmed: 10,
  }[String(status || "pending")] || 0;
}

function visitStatus(items) {
  const winner = [...items].sort((a, b) => statusRank(effectiveAgendaStatus(b.data)) - statusRank(effectiveAgendaStatus(a.data)))[0];
  return winner ? effectiveAgendaStatus(winner.data) : "pending";
}

function deadlineLabel(date) {
  return date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

function saoPauloHour(date = new Date()) {
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(value);
}

function canSendNow(date = new Date()) {
  const hour = saoPauloHour(date);
  return Number.isFinite(hour) && hour >= AUTO_SEND_START_HOUR && hour < AUTO_SEND_END_HOUR;
}

function buildMessages(data, parsed) {
  const name = firstName(data.name);
  const professional = prettyProfessional(data.professional);
  const deadline = hoursBefore(parsed.appointment, 3);
  const deadlineTime = deadlineLabel(deadline);
  return {
    h24:
      `Olá, ${name}! 💚\n\n` +
      `Passando para confirmar sua consulta na OdontoCompany Olímpia, dia ${parsed.date}, às ${parsed.time}, com ${professional}.\n\n` +
      `Pode me confirmar sua presença?`,
    h6:
      `Olá, ${name}! 💚\n\n` +
      `Sua consulta está agendada para hoje, às ${parsed.time}, com ${professional}.\n\n` +
      `Precisamos da sua confirmação até ${deadlineTime}. Caso não tenhamos a confirmação até esse horário, precisaremos liberar a vaga para outro paciente, para não deixarmos um horário reservado sem utilização.\n\n` +
      `Pode me confirmar sua presença?`,
    h1:
      `Olá, ${name}! 💚\n\n` +
      `Está chegando a hora da sua consulta na OdontoCompany Olímpia, às ${parsed.time}, com ${professional}.\n\n` +
      `Sua presença está confirmada e estamos te aguardando. Até já! ✨`,
    released:
      `Olá, ${name}! 💚\n\n` +
      `Como não recebemos sua confirmação dentro do prazo, o horário de ${parsed.time} foi liberado para outro paciente.\n\n` +
      `Se quiser, posso te ajudar a encontrar um novo horário.`,
  };
}

function visitKey(data = {}) {
  const phoneKey = canonicalPhoneKey(data.phone) || "sem-fone";
  return [String(data.date || ""), normalizeText(data.name || ""), phoneKey].join("|");
}

async function queueClinicMessage({ clinicRef, appointmentDoc, appointmentData, parsed, suffix, automationType, automationLabel, message, nowIso, expiresAt }) {
  const phone = whatsappPhone(appointmentData.phone);
  const phoneKey = canonicalPhoneKey(appointmentData.phone);
  if (!phone || !phoneKey || !message) return false;

  const queueRef = clinicRef.collection("whatsappQueue").doc(`clinic_appt_${safeId(appointmentDoc.id)}_${suffix}`);
  const queueSnap = await queueRef.get();
  const existing = queueSnap.exists ? (queueSnap.data() || {}) : {};
  const existingStatus = String(existing.status || "");
  const cancelReason = String(existing.cancelReason || "");

  if (["pending", "leased", "sent", "failed"].includes(existingStatus)) return false;
  if (existingStatus === "cancelled" && !PAUSED_CANCEL_REASONS.has(cancelReason)) return false;

  await queueRef.set({
    clinicId: clinicRef.id,
    leadId: appointmentDoc.id,
    clinicAppointmentId: appointmentDoc.id,
    phone,
    phoneKey,
    name: String(appointmentData.name || "").trim().slice(0, 150),
    message: message.slice(0, 4000),
    kind: "manual",
    automationType,
    automationLabel,
    appointmentValue: `${appointmentData.date} ${appointmentData.startTime}`,
    appointmentIso: parsed.appointment.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "pending",
    sendAfter: nowIso,
    createdAt: queueSnap.exists ? (existing.createdAt || nowIso) : nowIso,
    updatedAt: nowIso,
    createdBy: "clinic-agenda-automation",
    attempts: Number(existing.attempts || 0) || 0,
    cancelReason: null,
    cancelledAt: null,
  }, { merge: true });
  return true;
}

async function cancelPendingForVisit(clinicRef, visitItems, reason, nowIso) {
  for (const item of visitItems) {
    const queueSnap = await clinicRef.collection("whatsappQueue").where("clinicAppointmentId", "==", item.doc.id).get();
    if (queueSnap.empty) continue;
    const batch = clinicRef.firestore.batch();
    let writes = 0;
    queueSnap.docs.forEach((snapshotDoc) => {
      const q = snapshotDoc.data() || {};
      if (!["pending", "leased"].includes(String(q.status || ""))) return;
      batch.set(snapshotDoc.ref, {
        status: "cancelled",
        cancelReason: reason,
        cancelledAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });
      writes += 1;
    });
    if (writes) await batch.commit();
  }
}

async function releaseVisitUnconfirmed({ clinicRef, visitItems, releaseAt, nowIso }) {
  const batch = clinicRef.firestore.batch();
  visitItems.forEach(({ doc }) => {
    batch.set(doc.ref, {
      confirmationStatus: "released_unconfirmed",
      confirmationDeadlineAt: releaseAt.toISOString(),
      vacancyReleasedAt: nowIso,
      vacancyReleaseReason: "no_confirmation_by_deadline",
      updatedAt: nowIso,
    }, { merge: true });
  });
  await batch.commit();
  await cancelPendingForVisit(clinicRef, visitItems, "clinic_vacancy_released", nowIso);
  return true;
}

/**
 * Régua da agenda importada, tratada como máquina de estados:
 * - 24h: primeira confirmação, somente enquanto ainda não confirmou
 * - 6h: aviso de prazo, somente enquanto ainda não confirmou
 * - 3h: libera a visita se ainda não confirmou; daqui em diante 24h/6h/1h não podem mais sair
 * - 1h: lembrete somente para visita confirmada
 * - resposta após liberação: tratada no bridge como late_reply e exige revisão humana
 *
 * Segurança de reativação:
 * - no máximo 1 mensagem automática entra na fila por ciclo
 * - mensagens automáticas só são enfileiradas entre 07h e 20h (America/Sao_Paulo)
 * - uma visita com mais de uma profissional é tratada como uma única visita para disparo
 */
export async function processClinicAgendaAutomation(db, clinicId) {
  const clinicRef = db.collection("clinics").doc(clinicId);
  const agendaSnap = await clinicRef.collection("clinicAgenda").get();
  if (agendaSnap.empty) return { paused: false, queued: 0, released: 0 };

  const now = new Date();
  const nowIso = now.toISOString();
  const horizon = new Date(now.getTime() + 30 * 60 * 60 * 1000);
  const active = agendaSnap.docs
    .map((doc) => ({ doc, data: doc.data() || {}, parsed: parseAppointment(doc.data() || {}) }))
    .filter(({ data, parsed }) => data.active !== false && parsed && parsed.appointment <= horizon && !isBlockedName(data.name));

  const visits = new Map();
  active.forEach((item) => {
    const key = visitKey(item.data);
    const list = visits.get(key) || [];
    list.push(item);
    visits.set(key, list);
  });

  const orderedVisits = [...visits.values()]
    .map((items) => [...items].sort((a, b) => a.parsed.appointment.getTime() - b.parsed.appointment.getTime()))
    .sort((a, b) => a[0].parsed.appointment.getTime() - b[0].parsed.appointment.getTime());

  let queued = 0;
  let released = 0;

  for (const visitItems of orderedVisits) {
    const driver = visitItems[0];
    const { doc, data, parsed } = driver;
    if (!parsed || parsed.appointment.getTime() <= now.getTime()) continue;

    const phone = whatsappPhone(data.phone);
    const phoneKey = canonicalPhoneKey(data.phone);
    if (!phone || !phoneKey) continue;

    const status = String(visitStatus(visitItems));
    const h24 = hoursBefore(parsed.appointment, 24);
    const h6 = hoursBefore(parsed.appointment, 6);
    const h3 = hoursBefore(parsed.appointment, 3);
    const h1 = hoursBefore(parsed.appointment, 1);
    const messages = buildMessages(data, parsed);

    const missingDeadline = visitItems.some((item) => !item.data.confirmationDeadlineAt);
    if (missingDeadline) {
      const batch = db.batch();
      visitItems.forEach((item) => {
        if (item.data.confirmationDeadlineAt) return;
        batch.set(item.doc.ref, { confirmationDeadlineAt: h3.toISOString(), updatedAt: item.data.updatedAt || nowIso }, { merge: true });
      });
      await batch.commit();
    }

    if (status === "released_unconfirmed") {
      if (queued < MAX_AUTOMATIC_MESSAGES_PER_CYCLE && canSendNow(now)) {
        const releasedAt = Date.parse(String(data.vacancyReleasedAt || ""));
        const recentRelease = !releasedAt || now.getTime() - releasedAt <= 30 * 60 * 1000;
        if (recentRelease && await queueClinicMessage({
          clinicRef,
          appointmentDoc: doc,
          appointmentData: data,
          parsed,
          suffix: "released",
          automationType: "appointment_clinic_released",
          automationLabel: "Clínica • vaga liberada",
          message: messages.released,
          nowIso,
          expiresAt: parsed.appointment,
        })) queued += 1;
      }
      continue;
    }

    if (isTerminalStatus(status)) continue;

    if (!isConfirmed(status) && now >= h3) {
      await releaseVisitUnconfirmed({ clinicRef, visitItems, releaseAt: h3, nowIso });
      released += 1;
      if (queued < MAX_AUTOMATIC_MESSAGES_PER_CYCLE && canSendNow(now)) {
        if (await queueClinicMessage({
          clinicRef,
          appointmentDoc: doc,
          appointmentData: data,
          parsed,
          suffix: "released",
          automationType: "appointment_clinic_released",
          automationLabel: "Clínica • vaga liberada",
          message: messages.released,
          nowIso,
          expiresAt: parsed.appointment,
        })) queued += 1;
      }
      continue;
    }

    if (!canSendNow(now) || queued >= MAX_AUTOMATIC_MESSAGES_PER_CYCLE) continue;

    if (isConfirmed(status)) {
      if (now >= h1 && now < parsed.appointment) {
        if (await queueClinicMessage({
          clinicRef,
          appointmentDoc: doc,
          appointmentData: data,
          parsed,
          suffix: "1h",
          automationType: "appointment_clinic_1h",
          automationLabel: "Clínica • lembrete 1h",
          message: messages.h1,
          nowIso,
          expiresAt: parsed.appointment,
        })) queued += 1;
      }
      continue;
    }

    if (now >= h6 && now < h3) {
      if (await queueClinicMessage({
        clinicRef,
        appointmentDoc: doc,
        appointmentData: data,
        parsed,
        suffix: "6h",
        automationType: "appointment_clinic_6h",
        automationLabel: "Clínica • prazo de confirmação",
        message: messages.h6,
        nowIso,
        expiresAt: h3,
      })) queued += 1;
      continue;
    }

    if (now >= h24 && now < h6) {
      if (await queueClinicMessage({
        clinicRef,
        appointmentDoc: doc,
        appointmentData: data,
        parsed,
        suffix: "24h",
        automationType: "appointment_clinic_24h",
        automationLabel: "Clínica • confirmação 24h",
        message: messages.h24,
        nowIso,
        expiresAt: h6,
      })) queued += 1;
    }
  }

  return { paused: false, queued, released };
}
