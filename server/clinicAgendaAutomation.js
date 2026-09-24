import { processClinicAgendaAutomation as runClinicAgendaAutomation } from "./clinicAgendaAutomationEngine.js";
import { canonicalPhoneKey } from "./whatsappAgent.js";

function normalizeName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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

  agendaSnap.docs.forEach((snapshotDoc) => {
    const data = snapshotDoc.data() || {};
    if (data.active === false) return;
    const phoneKey = canonicalPhoneKey(data.phone);
    const date = String(data.date || "");
    const name = normalizeName(data.name);
    if (!phoneKey || !date || !name) return;
    const key = `${date}|${phoneKey}`;
    const names = byPhoneDay.get(key) || new Set();
    names.add(name);
    byPhoneDay.set(key, names);
  });

  return [...byPhoneDay.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([key, names]) => ({ key, names: [...names] }))
    .slice(0, 20);
}

/**
 * Gate de segurança da régua da clínica.
 * - settings/clinicAutomation.paused controla a automação.
 * - padrão seguro: pausada quando a configuração ainda não existe.
 * - ao pausar, mensagens automáticas pendentes/leased são canceladas.
 * - se o mesmo telefone estiver ligado a pacientes diferentes no mesmo dia,
 *   a régua pausa sozinha antes de qualquer novo disparo.
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
  if (conflicts.length) {
    const nowIso = new Date().toISOString();
    await settingsRef.set({
      paused: true,
      pauseReason: "recipient_conflict",
      pausedAt: nowIso,
      recipientConflicts: conflicts,
      updatedAt: nowIso,
    }, { merge: true });
    const cancelled = await cancelPendingClinicAutomation(db, clinicId, "clinic_recipient_conflict");
    console.warn(`[clinic-automation] pausada: ${conflicts.length} conflito(s) de telefone entre pacientes.`);
    return { paused: true, queued: 0, released: 0, cancelled, reason: "recipient_conflict", conflicts: conflicts.length };
  }

  return runClinicAgendaAutomation(db, clinicId);
}
