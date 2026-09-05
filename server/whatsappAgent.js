import { getAdminDb } from "./firebaseAdmin.js";
import { getNextFollowUpDate } from "../shared/followUpCadence.js";

const TIME_ZONE = "America/Sao_Paulo";

export function brDateDisplay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

export function brDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}${get("month")}${get("day")}`;
}

export function brDateTimeDisplay(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

// Chave de identidade tolerante ao nono dígito brasileiro.
// Ex.: 5517999999999 e 551799999999 convergem para a mesma chave.
export function canonicalPhoneKey(value) {
  let digits = digitsOnly(value);
  if (!digits) return null;
  if (digits.startsWith("55")) digits = digits.slice(2);

  if (digits.length === 11 && digits[2] === "9") {
    digits = `${digits.slice(0, 2)}${digits.slice(3)}`;
  }

  if (digits.length !== 10) return null;
  return `55${digits}`;
}

export function whatsappPhone(value) {
  let digits = digitsOnly(value);
  if (!digits) return null;
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 13 ? digits : null;
}

export function findLeadIndex(leads, { leadId, phone } = {}) {
  if (!Array.isArray(leads)) return -1;
  if (leadId) {
    const byId = leads.findIndex((lead) => String(lead?.id || "") === String(leadId));
    if (byId >= 0) return byId;
  }

  const key = canonicalPhoneKey(phone);
  if (!key) return -1;
  return leads.findIndex((lead) => canonicalPhoneKey(lead?.telefone) === key);
}

export function nextFollowUpStage(stage) {
  const current = String(stage || "");
  const match = current.match(/^Follow-Up\s+(\d+)$/i);
  if (!match) return "Follow-Up 1";
  const n = Math.min(Number(match[1]) + 1, 12);
  return `Follow-Up ${n}`;
}

function timelineActivityRef(db, clinicId, leadId) {
  return db
    .collection("clinics")
    .doc(clinicId)
    .collection("timelines")
    .doc(String(leadId))
    .collection("activities")
    .doc();
}

function trimTimelineText(value, max = 2000) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function resolveMetaReferral(clinicId, referral = {}) {
  const sourceId = String(
    referral?.sourceId ||
    referral?.source_id ||
    referral?.adId ||
    referral?.ad_id ||
    ""
  ).trim();

  if (!clinicId || !sourceId) return null;

  try {
    const snap = await getAdminDb()
      .collection("clinics")
      .doc(clinicId)
      .collection("campaigns")
      .where("metaObjectId", "==", sourceId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data() || {};
    return {
      id: doc.id,
      name: data.name || data.metaAdName || "",
      metaAdId: sourceId,
      metaCampaignId: data.metaCampaignId || "",
    };
  } catch (error) {
    console.warn("[whatsapp-agent] falha ao mapear referência Meta:", error?.message || error);
    return null;
  }
}

export async function applySentQueueItem(clinicId, queueId, result = {}) {
  const db = getAdminDb();
  const queueRef = db.collection("clinics").doc(clinicId).collection("whatsappQueue").doc(queueId);
  const queueSnap = await queueRef.get();
  if (!queueSnap.exists) throw new Error("Queue item not found");

  const queue = queueSnap.data() || {};
  const sentAt = new Date();
  const nowIso = sentAt.toISOString();
  await queueRef.set({
    status: "sent",
    sentAt: nowIso,
    messageId: result.messageId || null,
    error: null,
    updatedAt: nowIso,
  }, { merge: true });

  if (queue.kind !== "followup") return { queue, leadUpdated: false };

  const sharedRef = db.collection("clinics").doc(clinicId).collection("shared").doc("shared");
  let leadUpdated = false;

  await db.runTransaction(async (tx) => {
    const sharedSnap = await tx.get(sharedRef);
    if (!sharedSnap.exists) return;
    const data = sharedSnap.data() || {};
    const leads = Array.isArray(data.leads) ? [...data.leads] : [];
    const index = findLeadIndex(leads, { leadId: queue.leadId, phone: queue.phone });
    if (index < 0) return;

    const lead = leads[index] || {};
    const today = brDateDisplay(sentAt);
    const count = Number(lead.followUpCount || 0) || 0;
    const nextStage = queue.nextStage || nextFollowUpStage(lead.etapaLead);
    const nextFollowUpDate = getNextFollowUpDate(sentAt, lead.etapaLead, nextStage);

    leads[index] = {
      ...lead,
      etapaLead: nextStage,
      followUpCount: count + 1,
      lastFollowUpDone: today,
      dataFollowUp: nextFollowUpDate,
      ...(nextFollowUpDate ? {} : { followUpCadenceCompletedAt: nowIso }),
      lastWhatsAppOutboundAt: nowIso,
      whatsappLastOutboundMessageId: result.messageId || "",
      whatsappLastOutboundSource: "local-agent",
    };

    tx.set(sharedRef, {
      leads,
      lastUpdated: nowIso,
    }, { merge: true });

    // O follow-up só entra no histórico depois da confirmação real de envio.
    const activityRef = timelineActivityRef(db, clinicId, lead.id);
    tx.set(activityRef, {
      type: "FOLLOW_UP",
      timestamp: sentAt,
      createdBy: null,
      createdByName: "WhatsApp Agent",
      data: {
        etapa: nextStage,
        observacao: trimTimelineText(queue.message || "Follow-up enviado via WhatsApp"),
        canal: "whatsapp",
        origem: "local-agent",
        queueId,
        messageId: result.messageId || "",
        etapaAnterior: lead.etapaLead || "",
      },
    });

    leadUpdated = true;
  });

  return { queue, leadUpdated };
}

export async function markQueueFailure(clinicId, queueId, errorMessage) {
  const ref = getAdminDb().collection("clinics").doc(clinicId).collection("whatsappQueue").doc(queueId);
  const nowIso = new Date().toISOString();
  await ref.set({
    status: "failed",
    failedAt: nowIso,
    updatedAt: nowIso,
    error: String(errorMessage || "Erro desconhecido").slice(0, 500),
  }, { merge: true });
}

export async function cancelPendingForLead(clinicId, leadId) {
  if (!clinicId || !leadId) return 0;
  const db = getAdminDb();
  const snap = await db.collection("clinics").doc(clinicId).collection("whatsappQueue")
    .where("leadId", "==", String(leadId))
    .get();

  const cancellable = snap.docs.filter((doc) => {
    const status = String(doc.data()?.status || "");
    return status === "pending" || status === "leased";
  });

  if (!cancellable.length) return 0;
  const batch = db.batch();
  const nowIso = new Date().toISOString();
  cancellable.forEach((doc) => batch.set(doc.ref, {
    status: "cancelled",
    cancelledAt: nowIso,
    cancelReason: "lead_replied",
    updatedAt: nowIso,
  }, { merge: true }));
  await batch.commit();
  return cancellable.length;
}

export async function processInboundEvent(clinicId, payload = {}) {
  const db = getAdminDb();
  const phone = whatsappPhone(payload.phone);
  const phoneKey = canonicalPhoneKey(payload.phone);
  if (!phone || !phoneKey) {
    return { skipped: true, reason: "unresolved_phone" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const name = String(payload.name || "").trim().slice(0, 150);
  const messageType = String(payload.messageType || "text").slice(0, 40);
  const text = String(payload.text || "").trim().slice(0, 2000);
  const displayMessage = text || (
    messageType === "audio" || messageType === "ptt" ? "🎤 Áudio recebido" :
    messageType === "image" ? "📷 Imagem recebida" :
    messageType === "video" ? "🎬 Vídeo recebido" :
    messageType === "document" ? "📄 Documento recebido" :
    `Mensagem recebida (${messageType})`
  );

  const referral = payload.referral && typeof payload.referral === "object" ? payload.referral : {};
  const resolvedCampaign = await resolveMetaReferral(clinicId, referral);
  const sharedRef = db.collection("clinics").doc(clinicId).collection("shared").doc("shared");
  const sharedSnap = await sharedRef.get();
  const sharedData = sharedSnap.exists ? (sharedSnap.data() || {}) : {};
  const leads = Array.isArray(sharedData.leads) ? [...sharedData.leads] : [];
  const index = findLeadIndex(leads, { phone });

  const contactRef = db.collection("clinics").doc(clinicId).collection("whatsappContacts").doc(phoneKey);
  await contactRef.set({
    phone,
    phoneKey,
    name,
    lastInboundAt: nowIso,
    lastInboundType: messageType,
    lastInboundPreview: displayMessage.slice(0, 300),
    lastInboundMessageId: String(payload.messageId || ""),
    metaCampanhaId: resolvedCampaign?.id || null,
    metaCampanhaNome: resolvedCampaign?.name || null,
    updatedAt: nowIso,
  }, { merge: true });

  if (index >= 0) {
    const lead = leads[index] || {};
    const nextLead = {
      ...lead,
      respostaLead: "RESPONDEU",
      lastWhatsAppInboundAt: nowIso,
      whatsappLastInboundType: messageType,
      whatsappLastInboundPreview: displayMessage.slice(0, 300),
      whatsappNeedsAttention: true,
      whatsappAutomationPaused: true,
      ...(resolvedCampaign && !lead.metaCampanhaId ? {
        metaCampanhaId: resolvedCampaign.id,
        metaCampanhaNome: resolvedCampaign.name,
      } : {}),
    };

    // Se estava em uma régua de follow-up e respondeu, volta para Em contato.
    if (/^Follow-Up\s+\d+$/i.test(String(lead.etapaLead || ""))) {
      nextLead.etapaLead = "Em contato";
    }

    leads[index] = nextLead;

    const batch = db.batch();
    batch.set(sharedRef, { leads, lastUpdated: nowIso }, { merge: true });

    // Respostas recebidas também passam a aparecer no histórico unificado.
    const activityRef = timelineActivityRef(db, clinicId, lead.id);
    batch.set(activityRef, {
      type: "WHATSAPP_MESSAGE",
      timestamp: now,
      createdBy: null,
      createdByName: null,
      data: {
        content: trimTimelineText(displayMessage),
        from: "paciente",
        deliveryStatus: "recebida",
        messageType,
        messageId: String(payload.messageId || ""),
        origem: "local-agent",
        metaCampanhaId: resolvedCampaign?.id || "",
        metaCampanhaNome: resolvedCampaign?.name || "",
      },
    });
    await batch.commit();

    const cancelled = await cancelPendingForLead(clinicId, lead.id);
    return { matched: true, leadId: lead.id, cancelled };
  }

  const triageRef = db.collection("clinics").doc(clinicId).collection("triagem").doc(phoneKey);
  const triageSnap = await triageRef.get();
  const existing = triageSnap.exists ? (triageSnap.data() || {}) : {};
  await triageRef.set({
    telefone: phone,
    phoneKey,
    nome: name || existing.nome || "",
    mensagem: displayMessage,
    mensagemTipo: messageType,
    dataRecebimento: existing.dataRecebimento || brDateTimeDisplay(now),
    createdAt: existing.createdAt || Date.now(),
    lastInboundAt: nowIso,
    lida: false,
    convertido: false,
    autoReplySent: existing.autoReplySent === true,
    fonteLead: "Online",
    metaCampanhaId: resolvedCampaign?.id || existing.metaCampanhaId || "",
    metaCampanhaNome: resolvedCampaign?.name || existing.metaCampanhaNome || "",
    metaAdSourceId: resolvedCampaign?.metaAdId || String(referral?.sourceId || referral?.source_id || ""),
    metaReferralHeadline: String(referral?.headline || referral?.title || "").slice(0, 300),
  }, { merge: true });

  return { matched: false, triageId: phoneKey };
}
