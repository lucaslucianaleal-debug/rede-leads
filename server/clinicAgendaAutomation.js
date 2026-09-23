// Hotfix de segurança: automação da agenda da clínica temporariamente pausada.
// Enquanto estiver pausada, esta rotina apenas cancela itens automáticos da clínica
// que ainda estiverem pendentes/leased. Envios manuais continuam intactos.

function isClinicAutomation(data = {}) {
  const type = String(data.automationType || "");
  return type.startsWith("appointment_clinic_") || String(data.createdBy || "") === "clinic-agenda-automation";
}

export async function processClinicAgendaAutomation(db, clinicId) {
  const clinicRef = db.collection("clinics").doc(clinicId);
  const queueCol = clinicRef.collection("whatsappQueue");
  const nowIso = new Date().toISOString();
  let cancelled = 0;

  for (const status of ["pending", "leased"]) {
    const snap = await queueCol.where("status", "==", status).limit(100).get();
    const automaticDocs = snap.docs.filter((doc) => isClinicAutomation(doc.data() || {}));
    if (!automaticDocs.length) continue;

    const batch = db.batch();
    automaticDocs.forEach((doc) => {
      batch.set(doc.ref, {
        status: "cancelled",
        cancelReason: "clinic_automation_paused_for_safety",
        cancelledAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });
      cancelled += 1;
    });
    await batch.commit();
  }

  return {
    paused: true,
    queued: 0,
    released: 0,
    cancelled,
  };
}
