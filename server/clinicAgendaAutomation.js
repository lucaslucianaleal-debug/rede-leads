import { processClinicAgendaAutomation as runClinicAgendaAutomation } from "./clinicAgendaAutomationEngine.js";
import { canonicalPhoneKey } from "./whatsappAgent.js";

const CONFLICT_HORIZON_HOURS = 30;

function normalizeName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseAppointment(data = {}) {
  const match = `${data.date || ""} ${data.startTime || ""}`.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const appointment = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
  return Number.isNaN(appointment.getTime()) ? null : appointment;
}

async function cancelPendingClinicAutomation(db, clinicId, reason = "clinic_automation_paused_by_user") {
  const clinicRef = db.collection("clinics").doc(clinicId);
  const queueCol = clinicRef.collection("whatsappQueue");
  const nowIso = new Date().toISOString();
  let cancelled = 0;

  for (const status of ["pending", "leased"]) {
    const snap = await queueCol.where("status", "==", status).limit(100).get();
    const docs = snap.docs.filter((item) => {
      const data = item.data() || {};
      return String(data.automationType || "").startsWith("appointment_clinic_") || String(data.createdBy || "") === "clinic-agenda-automation";
    });
    if (!docs.length) continue;

    const batch = db.batch();
    docs.forEach((item) => {
      batch.set(item.ref, {
        status: "cancelled",
        cancelReason: reason,
        cancelledAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });
      cancelled += 1;
    });
    await batch.commit();
  }

  return cancelled;
}

async function findRecipientConflicts(clinicRef) {
  const agendaSnap = await clinicRef.collection("clinicAgenda").get();
  const byPhoneDay = new Map();
  const now = new Date();
  const horizon = new Date(now.getTime() + CONFLICT_HORIZON_HOURS * 60 * 60 * 1000);

  agendaSnap.docs.forEach((snapshotDoc) => {
    const data = snapshotDoc.data() || {};
    if (data.active === false) return;

    const appointment = parseAppointment(data);
    if (!appointment || appointment <= now || appointment > horizon) return;

    const phoneKey = canonicalPhoneKey(data.phone);
    const date = String(data.date || "");
    const name = normalizeName(data.name);
    if (!phoneKey || !date || !name) return;

    const key = `${date}|${phoneKey}`;
    const entry = byPhoneDay.get(key) || { names: new Set(), phoneKey, date };
    entry.names.add(name);
    byPhoneDay.set(key, entry);
  });

  return [...byPhoneDay.entries()]
    .filter(([, entry]) => entry.names.size > 1)
    .map(([key, entry]) => ({ key, phoneKey: entry.phoneKey, date: entry.date, names: [...entry.names] }))
    .slice(0, 20);
}

function queueMatchesConflict(data, conflictKeys) {
  const phoneKey = String(data.phoneKey || canonicalPhoneKey(data.phone) || "");
  if (!phoneKey) return false;
  const appointmentDate = String(data.appointmentValue || "").slice(0, 10);
  if (!appointmentDate) return false;
  return conflictKeys.has(`${appointmentDate}|${phoneKey}`);
}

async function cancelConflictingAutomaticMessages(clinicRef, conflicts) {
  if (!conflicts.length) return 0;
  const conflictKeys = new Set(conflicts.map((item) => item.key));
  const queueCol = clinicRef.collection("whatsappQueue");
  const nowIso = new Date().toISOString();
  let cancelled = 0;

  for (const status of ["pending", "leased"]) {
    const snap = await queueCol.where("status", "==", status).limit(100).get();
    const docs = snap.docs.filter((item) => {
      const data = item.data() || {};
      const automatic = String(data.automationType || "").startsWith("appointment_clinic_") || String(data.createdBy || "") === "clinic-agenda-automation";
      return automatic && queueMatchesConflict(data, conflictKeys);
    });
    if (!docs.length) continue;

    const batch = clinicRef.firestore.batch();
    docs.forEach((item) => {
      batch.set(item.ref, {
        status: "cancelled",
        cancelReason: "clinic_recipient_conflict_skipped",
        cancelledAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });
      cancelled += 1;
    });
    await batch.commit();
  }

  return cancelled;
}

/**
 * Gate de segurança da régua da clínica.
 * - settings/clinicAutomation.paused controla a automação.
 * - padrão seguro: pausada quando a configuração ainda não existe.
 * - ao pausar, mensagens automáticas pendentes/leased são canceladas.
 * - conflito de telefone NÃO pausa mais a clínica inteira: somente o(s)
 *   destinatário(s) ambíguo(s) são bloqueados para envio automático.
 * - conflitos antigos fora da janela operacional não contam.
 * - envio manual do Rede Leads não é afetado.
 */
export async function processClinicAgendaAutomation(db, clinicId) {
  const clinicRef = db.collection("clinics").doc(clinicId);
  const settingsRef = clinicRef.collection("settings").doc("clinicAutomation");
  const settingsSnap = await settingsRef.get();
  const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
  const paused = settingsSnap.exists ? settings.paused !== false : true;

  if (paused) {
    const cancelled = await cancelPendingClinicAutomation(db, clinicId);
    return { paused: true, queued: 0, released: 0, cancelled, reason: String(settings.pauseReason || "manual") };
  }

  const conflicts = await findRecipientConflicts(clinicRef);
  const result = await runClinicAgendaAutomation(db, clinicId);
  const skippedConflicts = await cancelConflictingAutomaticMessages(clinicRef, conflicts);
  const nowIso = new Date().toISOString();

  await settingsRef.set({
    recipientConflicts: conflicts,
    recipientConflictCount: conflicts.length,
    recipientConflictsUpdatedAt: nowIso,
    updatedAt: nowIso,
  }, { merge: true });

  if (conflicts.length) {
    console.warn(`[clinic-automation] ${conflicts.length} conflito(s) futuro(s) de destinatário isolado(s); demais pacientes seguem normalmente.`);
  }

  return {
    ...result,
    paused: false,
    recipientConflicts: conflicts.length,
    skippedConflicts,
  };
}
