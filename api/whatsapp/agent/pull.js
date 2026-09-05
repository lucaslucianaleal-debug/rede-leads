import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { canonicalPhoneKey, findLeadIndex, whatsappPhone } from "../../../server/whatsappAgent.js";

function safeId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);
}

function isFinalLead(lead = {}) {
  const stage = String(lead.etapaLead || "").toLowerCase();
  return Boolean(
    lead._deleted ||
    lead.comparecimento === "COMPARECEU" ||
    lead.comparecimento === "NÃO COMPARECEU" ||
    lead.lembretes?.disabled === true ||
    stage === "finalizado" ||
    stage === "desistência" ||
    stage === "desistencia" ||
    stage === "fora da região" ||
    stage === "fora da regiao"
  );
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
    date: `${day}/${month}/${year}`,
    time: `${hour}:${minute}`,
  };
}

function hoursBefore(date, hours) {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

function reminderMessages(lead, parsed) {
  const name = firstName(lead.nome);
  return {
    "24h":
      `Olá, ${name}! Tudo bem?\n\n` +
      `Passando para lembrar da sua consulta na OdontoCompany Olímpia, dia ${parsed.date}, às ${parsed.time}.\n\n` +
      `Já deixamos tudo reservado para o seu atendimento.\n\n` +
      `Te esperamos! 🦷💚`,
    "12h":
      `Olá, ${name}! Tudo bem?\n\n` +
      `Só reforçando o seu horário na OdontoCompany Olímpia: dia ${parsed.date}, às ${parsed.time}.\n\n` +
      `Seu atendimento está reservado e estaremos te aguardando. 💚`,
    "1h":
      `Olá, ${name}! 💚\n\n` +
      `Está chegando a hora do seu atendimento na OdontoCompany Olímpia. Seu horário é às ${parsed.time}.\n\n` +
      `Já estamos preparando sua sala e te aguardamos por aqui.\n\n` +
      `Até já! ✨`,
  };
}

/**
 * Migra/garante a nova régua para agendamentos que já existiam antes do deploy.
 * Trabalha apenas com as próximas 72h; consultas mais distantes serão preparadas
 * automaticamente quando entrarem nessa janela.
 */
async function ensureUpcomingAppointmentReminders(db, clinicId) {
  const clinicRef = db.collection("clinics").doc(clinicId);
  const sharedSnap = await clinicRef.collection("shared").doc("shared").get();
  if (!sharedSnap.exists) return 0;

  const shared = sharedSnap.data() || {};
  const leads = Array.isArray(shared.leads) ? shared.leads : [];
  const scheduleCol = clinicRef.collection("whatsappSchedule");
  const queueCol = clinicRef.collection("whatsappQueue");
  const now = new Date();
  const horizon = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  let touched = 0;

  const candidates = leads
    .filter((lead) => !isFinalLead(lead))
    .map((lead) => ({ lead, parsed: parseAppointment(lead.dataAgendamento) }))
    .filter(({ parsed }) => parsed && parsed.appointment > now && parsed.appointment <= horizon)
    .slice(0, 40);

  for (const { lead, parsed } of candidates) {
    const leadId = String(lead.id || "").trim();
    const phone = whatsappPhone(lead.telefone);
    const phoneKey = canonicalPhoneKey(lead.telefone);
    if (!leadId || !phone || !phoneKey) continue;

    const messages = reminderMessages(lead, parsed);
    const appointmentValue = String(lead.dataAgendamento || "");
    const appointmentIso = parsed.appointment.toISOString();
    const specs = [
      {
        suffix: "24h",
        automationType: "appointment_reminder_24h",
        automationLabel: "Lembrete • 24h antes",
        message: messages["24h"],
        sendAfter: hoursBefore(parsed.appointment, 24),
        expiresAt: hoursBefore(parsed.appointment, 12),
      },
      {
        suffix: "12h",
        automationType: "appointment_reminder_12h",
        automationLabel: "Lembrete • 12h antes",
        message: messages["12h"],
        sendAfter: hoursBefore(parsed.appointment, 12),
        expiresAt: hoursBefore(parsed.appointment, 1),
      },
      {
        suffix: "1h",
        automationType: "appointment_reminder_1h",
        automationLabel: "Lembrete • 1h antes",
        message: messages["1h"],
        sendAfter: hoursBefore(parsed.appointment, 1),
        expiresAt: parsed.appointment,
      },
    ];

    // Cancela o lembrete legado "no dia" para este agendamento.
    const legacyId = `appt_${safeId(leadId)}_${parsed.key}_today`;
    const legacyScheduleRef = scheduleCol.doc(legacyId);
    const legacyQueueRef = queueCol.doc(legacyId);
    const [legacyScheduleSnap, legacyQueueSnap] = await Promise.all([
      legacyScheduleRef.get(),
      legacyQueueRef.get(),
    ]);
    const legacyBatch = db.batch();
    let legacyWrites = 0;
    if (legacyScheduleSnap.exists) {
      legacyBatch.delete(legacyScheduleRef);
      legacyWrites += 1;
    }
    if (legacyQueueSnap.exists && ["pending", "leased"].includes(String(legacyQueueSnap.data()?.status || ""))) {
      legacyBatch.set(legacyQueueRef, {
        status: "cancelled",
        cancelReason: "replaced_by_1h_reminder",
        cancelledAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });
      legacyWrites += 1;
    }
    if (legacyWrites) await legacyBatch.commit();

    for (const spec of specs) {
      if (spec.expiresAt <= now) continue;

      const id = `appt_${safeId(leadId)}_${parsed.key}_${spec.suffix}`;
      const queueRef = queueCol.doc(id);
      const scheduleRef = scheduleCol.doc(id);
      const [queueSnap, scheduleSnap] = await Promise.all([queueRef.get(), scheduleRef.get()]);
      const queueStatus = queueSnap.exists ? String(queueSnap.data()?.status || "") : "";

      if (["pending", "leased", "sent"].includes(queueStatus)) continue;

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
        createdBy: "agent-backfill",
        attempts: 0,
      };

      if (spec.sendAfter <= now) {
        // Estamos dentro da janela deste slot: coloca na fila agora.
        await queueRef.set({
          ...baseData,
          status: "pending",
          sendAfter: nowIso,
          migratedAt: nowIso,
        }, { merge: true });
        if (scheduleSnap.exists) await scheduleRef.delete();
        touched += 1;
      } else {
        await scheduleRef.set({
          ...baseData,
          queueId: id,
          sendAfter: spec.sendAfter.toISOString(),
          migratedAt: nowIso,
        }, { merge: true });
        touched += 1;
      }
    }
  }

  return touched;
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

    // O agente consulta mensagens manuais a cada poucos segundos. No início de cada
    // minuto, migramos agendamentos existentes e promovemos os lembretes vencidos.
    if (requestedKind === "manual" && new Date().getUTCSeconds() < 10) {
      await ensureUpcomingAppointmentReminders(db, clinicId).catch((error) => {
        console.warn("[whatsapp-agent/pull] falha ao garantir régua de agendamentos:", error?.message || error);
      });
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
        clientRequestId: data.clientRequestId || "",
        automationType: data.automationType || "",
        automationLabel: data.automationLabel || "",
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
