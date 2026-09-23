import { canonicalPhoneKey, whatsappPhone } from "./whatsappAgent.js";

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
  return ["wont_attend", "cancelled", "reschedule", "released_unconfirmed"].includes(String(status || ""));
}

function isConfirmed(status) {
  return String(status || "") === "confirmed";
}

function deadlineLabel(date) {
  return date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
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
  };
}

async function queueClinicMessage({ db, clinicRef, appointmentDoc, appointmentData, parsed, suffix, automationType, automationLabel, message, nowIso, expiresAt }) {
  const phone = whatsappPhone(appointmentData.phone);
  const phoneKey = canonicalPhoneKey(appointmentData.phone);
  if (!phone || !phoneKey || !message) return false;

  const queueRef = clinicRef.collection("whatsappQueue").doc(`clinic_appt_${safeId(appointmentDoc.id)}_${suffix}`);
  const queueSnap = await queueRef.get();
  const existingStatus = queueSnap.exists ? String(queueSnap.data()?.status || "") : "";
  if (["pending", "leased", "sent", "cancelled"].includes(existingStatus)) return false;

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
    createdAt: queueSnap.exists ? (queueSnap.data()?.createdAt || nowIso) : nowIso,
    updatedAt: nowIso,
    createdBy: "clinic-agenda-automation",
    attempts: Number(queueSnap.data()?.attempts || 0) || 0,
  }, { merge: true });
  return true;
}

async function releaseUnconfirmed({ db, clinicRef, appointmentDoc, appointmentData, parsed, nowIso }) {
  const status = String(appointmentData.confirmationStatus || "pending");
  if (isConfirmed(status) || isTerminalStatus(status)) return false;

  const releaseAt = hoursBefore(parsed.appointment, 3);
  if (releaseAt.getTime() > Date.now() || parsed.appointment.getTime() <= Date.now()) return false;

  const batch = db.batch();
  batch.set(appointmentDoc.ref, {
    confirmationStatus: "released_unconfirmed",
    confirmationDeadlineAt: releaseAt.toISOString(),
    vacancyReleasedAt: nowIso,
    vacancyReleaseReason: "no_confirmation_by_deadline",
    updatedAt: nowIso,
  }, { merge: true });

  const queueSnap = await clinicRef.collection("whatsappQueue").where("clinicAppointmentId", "==", appointmentDoc.id).get();
  queueSnap.docs.forEach((snapshotDoc) => {
    const q = snapshotDoc.data() || {};
    if (!["pending", "leased"].includes(String(q.status || ""))) return;
    batch.set(snapshotDoc.ref, {
      status: "cancelled",
      cancelReason: "clinic_vacancy_released",
      cancelledAt: nowIso,
      updatedAt: nowIso,
    }, { merge: true });
  });

  await batch.commit();
  return true;
}

/**
 * Régua da agenda importada:
 * - 24h: primeira confirmação
 * - 6h: aviso de prazo até 3h antes
 * - 3h: libera vaga se não houver confirmação
 * - 1h: lembrete apenas para presença confirmada
 *
 * É chamada pelo agente WhatsApp no início de cada minuto. Não depende do paciente existir no Rede Leads.
 */
export async function processClinicAgendaAutomation(db, clinicId) {
  const clinicRef = db.collection("clinics").doc(clinicId);
  const agendaSnap = await clinicRef.collection("clinicAgenda").get();
  if (agendaSnap.empty) return { queued: 0, released: 0 };

  const now = new Date();
  const nowIso = now.toISOString();
  const horizon = new Date(now.getTime() + 30 * 60 * 60 * 1000);
  let queued = 0;
  let released = 0;

  const candidates = agendaSnap.docs
    .map((doc) => ({ doc, data: doc.data() || {}, parsed: parseAppointment(doc.data() || {}) }))
    .filter(({ data, parsed }) => data.active !== false && parsed && parsed.appointment > now && parsed.appointment <= horizon && !isBlockedName(data.name))
    .sort((a, b) => a.parsed.appointment.getTime() - b.parsed.appointment.getTime())
    .slice(0, 120);

  for (const item of candidates) {
    const { doc, data, parsed } = item;
    const phone = whatsappPhone(data.phone);
    const phoneKey = canonicalPhoneKey(data.phone);
    if (!phone || !phoneKey) continue;

    const status = String(data.confirmationStatus || "pending");
    const h24 = hoursBefore(parsed.appointment, 24);
    const h6 = hoursBefore(parsed.appointment, 6);
    const h3 = hoursBefore(parsed.appointment, 3);
    const h1 = hoursBefore(parsed.appointment, 1);
    const messages = buildMessages(data, parsed);

    if (!data.confirmationDeadlineAt) {
      await doc.ref.set({ confirmationDeadlineAt: h3.toISOString(), updatedAt: data.updatedAt || nowIso }, { merge: true });
    }

    if (!isConfirmed(status) && !isTerminalStatus(status)) {
      if (now >= h24 && now < h6) {
        if (await queueClinicMessage({ db, clinicRef, appointmentDoc: doc, appointmentData: data, parsed, suffix: "24h", automationType: "appointment_clinic_24h", automationLabel: "Clínica • confirmação 24h", message: messages.h24, nowIso, expiresAt: h6 })) queued += 1;
      } else if (now >= h6 && now < h3) {
        if (await queueClinicMessage({ db, clinicRef, appointmentDoc: doc, appointmentData: data, parsed, suffix: "6h", automationType: "appointment_clinic_6h", automationLabel: "Clínica • prazo de confirmação", message: messages.h6, nowIso, expiresAt: h3 })) queued += 1;
      }
    }

    if (now >= h3 && !isConfirmed(status) && !isTerminalStatus(status)) {
      if (await releaseUnconfirmed({ db, clinicRef, appointmentDoc: doc, appointmentData: data, parsed, nowIso })) released += 1;
      continue;
    }

    if (isConfirmed(status) && now >= h1 && now < parsed.appointment) {
      if (await queueClinicMessage({ db, clinicRef, appointmentDoc: doc, appointmentData: data, parsed, suffix: "1h", automationType: "appointment_clinic_1h", automationLabel: "Clínica • lembrete 1h", message: messages.h1, nowIso, expiresAt: parsed.appointment })) queued += 1;
    }
  }

  return { queued, released };
}
