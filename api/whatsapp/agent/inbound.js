import { getAdminDb } from "../../../server/firebaseAdmin.js";
import { requireWhatsAppAgent } from "../../../server/whatsappAgentAuth.js";
import { canonicalPhoneKey, cancelPendingForLead, findLeadIndex, processInboundEvent } from "../../../server/whatsappAgent.js";
import { recordWhatsAppChatMessage, updateWhatsAppMessageStatus } from "../../../server/whatsappChatStore.js";

const IGNORED_TYPES = new Set(["notification_template", "e2e_notification", "protocol", "ciphertext", "revoked"]);
const MANUAL_STATUSES = new Set(["confirmed", "wont_attend", "cancelled", "reschedule"]);

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isOptOutText(value) {
  const text = normalizeText(value);
  if (!text) return false;
  return ["pare", "parar", "sair", "stop", "remover", "nao quero", "nao tenho interesse", "não quero"]
    .some((term) => text === normalizeText(term) || text.includes(normalizeText(term)));
}

function classifyClinicReply(value) {
  const text = normalizeText(value);
  const rebookTerms = ["reagendar", "remarcar", "outro horario", "outro dia", "trocar horario", "mudar horario", "nao consigo esse horario"];
  const noTerms = ["nao vou", "nao poderei", "nao posso ir", "cancelar", "cancela", "nao consigo ir", "nao compareco"];
  const yesTerms = ["sim", "confirmo", "confirmado", "vou sim", "estarei ai", "pode confirmar", "presenca confirmada", "vou estar ai"];
  if (rebookTerms.some((term) => text.includes(term))) return "reschedule";
  if (noTerms.some((term) => text.includes(term))) return "wont_attend";
  if (yesTerms.some((term) => text === term || text.includes(term))) return "confirmed";
  return "replied";
}

function effectiveClinicStatus(data = {}) {
  const current = String(data.confirmationStatus || "");
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

function resolveClinicReplyStatus(currentStatus, classification) {
  const current = String(currentStatus || "");

  if (current === "confirmed") {
    if (classification === "wont_attend" || classification === "reschedule") return classification;
    return "confirmed";
  }

  if (["wont_attend", "cancelled", "reschedule"].includes(current)) return current;
  if (current === "released_unconfirmed" && classification === "confirmed") return "reschedule";
  return classification;
}

function parseClinicAppointment(data = {}) {
  const match = `${data.date || ""} ${data.startTime || ""}`.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function cancelClinicAutomation(db, clinicRef, appointmentId, { keepOneHour = false } = {}) {
  const [scheduleSnap, queueSnap] = await Promise.all([
    clinicRef.collection("whatsappSchedule").where("clinicAppointmentId", "==", appointmentId).get(),
    clinicRef.collection("whatsappQueue").where("clinicAppointmentId", "==", appointmentId).get(),
  ]);
  const batch = db.batch();
  let writes = 0;
  scheduleSnap.docs.forEach((snapshotDoc) => {
    const data = snapshotDoc.data() || {};
    if (keepOneHour && String(data.automationType || "") === "appointment_clinic_1h") return;
    batch.delete(snapshotDoc.ref);
    writes += 1;
  });
  queueSnap.docs.forEach((snapshotDoc) => {
    const data = snapshotDoc.data() || {};
    const status = String(data.status || "");
    if (!["pending", "leased"].includes(status)) return;
    if (keepOneHour && String(data.automationType || "") === "appointment_clinic_1h") return;
    batch.set(snapshotDoc.ref, {
      status: "cancelled",
      cancelReason: keepOneHour ? "clinic_confirmed" : "clinic_not_attending",
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    writes += 1;
  });
  if (writes) await batch.commit();
}

async function updateClinicAppointmentFromInbound(db, clinicId, phoneKey, text, messageAt) {
  const clinicRef = db.collection("clinics").doc(clinicId);
  const agendaSnap = await clinicRef.collection("clinicAgenda").where("phoneKey", "==", phoneKey).get();
  if (agendaSnap.empty) return null;

  const now = Date.parse(String(messageAt || "")) || Date.now();
  const candidates = agendaSnap.docs
    .map((snapshotDoc) => ({ ref: snapshotDoc.ref, id: snapshotDoc.id, data: snapshotDoc.data() || {} }))
    .filter(({ data }) => {
      if (data.active === false) return false;
      const appointment = parseClinicAppointment(data);
      const sentAt = Date.parse(String(data.lastReminderSentAt || ""));
      if (!appointment || !Number.isFinite(sentAt) || sentAt > now) return false;
      return appointment.getTime() > now - 2 * 60 * 60 * 1000;
    })
    .sort((a, b) => parseClinicAppointment(a.data).getTime() - parseClinicAppointment(b.data).getTime());

  const target = candidates[0];
  if (!target) return null;

  const classification = classifyClinicReply(text);
  const storedStatus = String(target.data.confirmationStatus || "");
  const currentStatus = effectiveClinicStatus(target.data);
  const resolvedStatus = resolveClinicReplyStatus(currentStatus, classification);

  const nowIso = new Date(now).toISOString();
  await target.ref.set({
    confirmationStatus: resolvedStatus,
    replyClassification: classification,
    lastReplyAt: nowIso,
    lastReplyText: String(text || "Mensagem recebida").slice(0, 500),
    updatedAt: nowIso,
    ...(currentStatus === "confirmed" && resolvedStatus === "confirmed" ? { postConfirmationReplyAt: nowIso } : {}),
    ...(storedStatus === "released_unconfirmed" && resolvedStatus === "reschedule" ? { lateReplyAfterRelease: true } : {}),
  }, { merge: true });

  if (resolvedStatus === "confirmed") {
    await cancelClinicAutomation(db, clinicRef, target.id, { keepOneHour: true });
  } else if (["wont_attend", "reschedule"].includes(resolvedStatus)) {
    await cancelClinicAutomation(db, clinicRef, target.id, { keepOneHour: false });
  }

  return { appointmentId: target.id, classification, resolvedStatus };
}

function referralContext(body = {}) {
  const referral = body?.referral && typeof body.referral === "object" ? body.referral : {};
  return {
    headline: String(referral.headline || referral.title || "").trim().slice(0, 300),
    body: String(referral.body || referral.adBody || referral.ad_body || "").trim().slice(0, 1000),
    greetingMessageBody: String(referral.greetingMessageBody || referral.greeting_message_body || "").trim().slice(0, 1000),
    sourceApp: String(referral.sourceApp || referral.source_app || "").trim().slice(0, 40),
    containsAutoReply: referral.containsAutoReply === true || referral.contains_auto_reply === true,
    automatedGreetingShown: referral.automatedGreetingMessageShown === true || referral.automated_greeting_message_shown === true,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    await requireWhatsAppAgent(req);
    const body = req.body || {};
    const clinicId = String(body.clinicId || "").trim();
    if (!clinicId) return res.status(400).json({ error: "clinicId obrigatório" });

    const messageType = String(body.messageType || "text").toLowerCase();
    if (IGNORED_TYPES.has(messageType)) return res.status(200).json({ ok: true, skipped: true, reason: "technical_event" });

    const phoneKey = canonicalPhoneKey(body.phone);
    if (!phoneKey) return res.status(200).json({ ok: true, skipped: true, reason: "unresolved_phone" });

    if (String(body.direction || "").toLowerCase() === "ack") {
      const result = await updateWhatsAppMessageStatus(clinicId, { phone: body.phone, messageId: body.messageId, ack: body.ack });
      return res.status(200).json({ ok: true, direction: "ack", ...result });
    }

    const db = getAdminDb();
    const contactRef = db.collection("clinics").doc(clinicId).collection("whatsappContacts").doc(phoneKey);
    const messageId = String(body.messageId || "").trim();

    if (String(body.direction || "").toLowerCase() === "out") {
      let leadId = "";
      let leadName = String(body.name || "").trim();
      try {
        const sharedSnap = await db.collection("clinics").doc(clinicId).collection("shared").doc("shared").get();
        const shared = sharedSnap.exists ? (sharedSnap.data() || {}) : {};
        const leads = Array.isArray(shared.leads) ? shared.leads : [];
        const index = findLeadIndex(leads, { phone: body.phone });
        if (index >= 0) {
          leadId = String(leads[index]?.id || "");
          leadName = String(leads[index]?.nome || leadName || "");
        }
      } catch (error) {
        console.warn("[whatsapp-agent/outbound] falha ao vincular lead:", error?.message || error);
      }

      const nowIso = new Date().toISOString();
      await contactRef.set({ phoneKey, phone: body.phone, name: leadName, leadId: leadId || null, lastOutboundAt: nowIso, lastOutboundMessageId: messageId, updatedAt: nowIso }, { merge: true });
      const chatResult = await recordWhatsAppChatMessage(clinicId, { phone: body.phone, name: leadName, leadId, direction: "out", text: body.text, messageType, messageId, operationId: body.operationId || "", createdAt: body.createdAt || undefined });
      return res.status(200).json({ ok: true, direction: "out", leadId, duplicate: chatResult?.duplicate === true });
    }

    const contactSnap = await contactRef.get();
    if (messageId && contactSnap.exists && contactSnap.data()?.lastInboundMessageId === messageId) return res.status(200).json({ ok: true, skipped: true, reason: "duplicate_message" });

    const result = await processInboundEvent(clinicId, body);
    const contactAfterSnap = await contactRef.get();
    const contactAfter = contactAfterSnap.exists ? (contactAfterSnap.data() || {}) : {};
    const referral = referralContext(body);

    if (referral.headline || referral.body || referral.greetingMessageBody || referral.sourceApp || referral.containsAutoReply || referral.automatedGreetingShown) {
      await contactRef.set({
        ...(referral.headline ? { metaReferralHeadline: referral.headline } : {}),
        ...(referral.body ? { metaReferralBody: referral.body } : {}),
        ...(referral.greetingMessageBody ? { metaGreetingMessageBody: referral.greetingMessageBody } : {}),
        ...(referral.sourceApp ? { metaSourceApp: referral.sourceApp } : {}),
        ...(referral.containsAutoReply ? { metaContainsAutoReply: true } : {}),
        ...(referral.automatedGreetingShown ? { metaAutomatedGreetingShown: true } : {}),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    await recordWhatsAppChatMessage(clinicId, {
      phone: body.phone, name: body.name, leadId: result?.leadId || "", direction: "in", text: body.text,
      messageType: body.messageType || "text", messageId: body.messageId || "", createdAt: body.createdAt || undefined,
      fonteLead: "Online", metaCampanhaId: contactAfter.metaCampanhaId || "", metaCampanhaNome: contactAfter.metaCampanhaNome || "",
      metaReferralHeadline: referral.headline || contactAfter.metaReferralHeadline || "", metaReferralBody: referral.body || contactAfter.metaReferralBody || "",
      metaGreetingMessageBody: referral.greetingMessageBody || contactAfter.metaGreetingMessageBody || "", metaSourceApp: referral.sourceApp || contactAfter.metaSourceApp || "",
      metaContainsAutoReply: referral.containsAutoReply || contactAfter.metaContainsAutoReply === true,
      metaAutomatedGreetingShown: referral.automatedGreetingShown || contactAfter.metaAutomatedGreetingShown === true,
    });

    const clinicAppointment = await updateClinicAppointmentFromInbound(db, clinicId, phoneKey, body.text, body.createdAt).catch((error) => {
      console.warn("[clinic-inbound] falha ao classificar confirmação:", error?.message || error);
      return null;
    });

    if (isOptOutText(body.text)) {
      const nowIso = new Date().toISOString();
      await contactRef.set({ optOut: true, optOutAt: nowIso, updatedAt: nowIso }, { merge: true });
      if (result?.matched && result?.leadId) await cancelPendingForLead(clinicId, result.leadId, { includeAppointmentAutomations: true, reason: "opt_out" });
    }

    return res.status(200).json({ ok: true, ...result, clinicAppointment });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("[whatsapp-agent/inbound]", error?.message || error);
    return res.status(status).json({ error: status === 401 ? "Não autorizado" : error?.message || "Erro" });
  }
}
