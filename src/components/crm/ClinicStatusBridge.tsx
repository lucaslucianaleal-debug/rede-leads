import { useEffect, useRef } from "react";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

type QueueItem = {
  id: string;
  leadId?: string;
  clinicAppointmentId?: string;
  phone?: string;
  phoneKey?: string;
  status?: "pending" | "leased" | "sent" | "failed" | "cancelled";
  sentAt?: string;
  failedAt?: string;
  updatedAt?: string;
  messageId?: string;
  error?: string;
  automationType?: string;
  automationLabel?: string;
};

type AgendaItem = {
  id: string;
  name?: string;
  phone?: string;
  phoneKey?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
  professional?: string;
  active?: boolean;
  confirmationStatus?: string;
  remindersSent?: Record<string, string>;
  lastReminderSentAt?: string;
  lastReminderError?: string | null;
  lastReplyAt?: string;
  lastReplyText?: string;
  replyClassification?: string;
  manualReviewedAt?: string;
  manualReviewDecision?: string;
};

type ChatItem = {
  id: string;
  phone?: string;
  phoneKey?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastDirection?: "in" | "out";
};

function digitsOnly(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function canonicalPhoneKey(value: string) {
  let digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === "9") digits = `${digits.slice(0, 2)}${digits.slice(3)}`;
  return digits.length === 10 ? `55${digits}` : "";
}

function appointmentIdFromQueue(item: QueueItem) {
  const explicit = String(item.clinicAppointmentId || "").trim();
  if (explicit) return explicit;
  const leadId = String(item.leadId || "").trim();
  return leadId.startsWith("clinic_") ? leadId : "";
}

function isoTime(value?: string) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function appointmentTime(item: AgendaItem) {
  const match = `${item.date || ""} ${item.startTime || ""}`.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const [, d, m, y, h, min] = match;
  return Date.parse(`${y}-${m}-${d}T${h}:${min}:00-03:00`) || 0;
}

function timeToMinutes(value?: string) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeText(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function classifyReply(value: string) {
  const text = normalizeText(value);
  const rebookTerms = ["reagendar", "remarcar", "outro horario", "outro dia", "trocar horario", "mudar horario", "nao consigo esse horario"];
  const noTerms = ["nao vou", "nao poderei", "nao posso ir", "cancelar", "cancela", "nao consigo ir", "nao compareco"];
  const yesTerms = ["sim", "sim pode", "pode sim", "confirmo", "confirmado", "vou sim", "estarei ai", "pode confirmar", "presenca confirmada", "vou estar ai"];
  if (rebookTerms.some((term) => text.includes(term))) return "reschedule";
  if (noTerms.some((term) => text.includes(term))) return "wont_attend";
  if (yesTerms.some((term) => text === term || text.includes(term))) return "confirmed";
  return "replied";
}

const FINAL_STATUSES = new Set(["confirmed", "wont_attend", "cancelled", "reschedule", "released_unconfirmed"]);
const STATUS_RANK: Record<string, number> = {
  pending: 1,
  queued: 2,
  failed: 3,
  sent: 4,
  replied: 5,
  released_unconfirmed: 6,
  reschedule: 7,
  wont_attend: 8,
  cancelled: 8,
  confirmed: 9,
};

function pickMergedStatus(items: AgendaItem[]) {
  return [...items]
    .sort((a, b) => (STATUS_RANK[String(b.confirmationStatus || "pending")] || 0) - (STATUS_RANK[String(a.confirmationStatus || "pending")] || 0))[0]?.confirmationStatus || "pending";
}

function latestValue(items: AgendaItem[], field: "lastReminderSentAt" | "lastReplyAt") {
  return [...items]
    .map((item) => String(item[field] || ""))
    .filter(Boolean)
    .sort((a, b) => isoTime(b) - isoTime(a))[0] || "";
}

function samePatientDay(a: AgendaItem, b: AgendaItem) {
  if (!a.date || a.date !== b.date) return false;
  const nameA = normalizeText(a.name || "");
  const nameB = normalizeText(b.name || "");
  if (!nameA || nameA !== nameB) return false;
  const phoneA = canonicalPhoneKey(a.phoneKey || a.phone || "");
  const phoneB = canonicalPhoneKey(b.phoneKey || b.phone || "");
  if (phoneA && phoneB && phoneA !== phoneB) return false;
  return true;
}

function visitItems(all: AgendaItem[], base: AgendaItem) {
  return all
    .filter((item) => item.active !== false && samePatientDay(base, item))
    .sort((a, b) => appointmentTime(a) - appointmentTime(b));
}

function latestManualAction(items: AgendaItem[]) {
  return [...items]
    .filter((item) => item.manualReviewedAt && ["confirmed", "wont_attend", "cancelled", "reschedule"].includes(String(item.confirmationStatus || "")))
    .sort((a, b) => isoTime(b.manualReviewedAt) - isoTime(a.manualReviewedAt))[0] || null;
}

async function cancelPendingForAppointment(clinicId: string, appointmentId: string, reason: string) {
  const clinicRef = doc(db, "clinics", clinicId);
  const [queueSnap, scheduleSnap] = await Promise.all([
    getDocs(query(collection(clinicRef, "whatsappQueue"), where("clinicAppointmentId", "==", appointmentId))),
    getDocs(query(collection(clinicRef, "whatsappSchedule"), where("clinicAppointmentId", "==", appointmentId))),
  ]);
  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);
  let writes = 0;

  queueSnap.docs.forEach((queueDoc) => {
    const data = queueDoc.data() || {};
    if (!["pending", "leased"].includes(String(data.status || ""))) return;
    batch.set(queueDoc.ref, { status: "cancelled", cancelReason: reason, cancelledAt: nowIso, updatedAt: nowIso }, { merge: true });
    writes += 1;
  });
  scheduleSnap.docs.forEach((scheduleDoc) => {
    const data = scheduleDoc.data() || {};
    if (["sent", "failed", "cancelled"].includes(String(data.status || ""))) return;
    batch.set(scheduleDoc.ref, { status: "cancelled", cancelReason: reason, cancelledAt: nowIso, updatedAt: nowIso }, { merge: true });
    writes += 1;
  });
  if (writes) await batch.commit();
}

async function mergeAdjacentDuplicateAppointments(clinicId: string, items: AgendaItem[], mergingKeys: Set<string>) {
  const active = items.filter((item) => item.active !== false && item.date && item.startTime && item.endTime && item.name && item.professional);
  const groups = new Map<string, AgendaItem[]>();

  active.forEach((item) => {
    const key = [item.date, normalizeText(item.name || ""), normalizeText(item.professional || "")].join("|");
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  });

  for (const [groupKey, group] of groups) {
    if (mergingKeys.has(groupKey) || group.length < 2) continue;
    const sorted = [...group].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const chains: AgendaItem[][] = [];

    sorted.forEach((item) => {
      const chain = chains[chains.length - 1];
      if (!chain) {
        chains.push([item]);
        return;
      }
      const chainEnd = Math.max(...chain.map((entry) => timeToMinutes(entry.endTime)));
      const nextStart = timeToMinutes(item.startTime);
      if (nextStart >= 0 && chainEnd >= 0 && nextStart <= chainEnd) chain.push(item);
      else chains.push([item]);
    });

    for (const chain of chains.filter((value) => value.length > 1)) {
      mergingKeys.add(groupKey);
      try {
        const primary = chain[0];
        const duplicates = chain.slice(1);
        const mergedEnd = chain
          .map((item) => item.endTime || "")
          .sort((a, b) => timeToMinutes(b) - timeToMinutes(a))[0] || primary.endTime || "";
        const phoneSource = chain.find((item) => canonicalPhoneKey(item.phoneKey || item.phone || "")) || primary;
        const mergedPhone = phoneSource.phone || primary.phone || "";
        const mergedPhoneKey = canonicalPhoneKey(phoneSource.phoneKey || mergedPhone || "") || null;
        const mergedStatus = pickMergedStatus(chain);
        const mergedReminders = Object.assign({}, ...chain.map((item) => item.remindersSent || {}));
        const lastReminderSentAt = latestValue(chain, "lastReminderSentAt");
        const lastReplyAt = latestValue(chain, "lastReplyAt");
        const replySource = lastReplyAt ? chain.find((item) => item.lastReplyAt === lastReplyAt) : undefined;
        const latestManual = latestManualAction(chain);
        const nowIso = new Date().toISOString();
        const clinicRef = doc(db, "clinics", clinicId);
        const batch = writeBatch(db);

        batch.set(doc(db, "clinics", clinicId, "clinicAgenda", primary.id), {
          endTime: mergedEnd,
          phone: mergedPhone,
          phoneKey: mergedPhoneKey,
          confirmationStatus: latestManual?.confirmationStatus || mergedStatus,
          remindersSent: mergedReminders,
          ...(lastReminderSentAt ? { lastReminderSentAt } : {}),
          ...(lastReplyAt ? {
            lastReplyAt,
            lastReplyText: replySource?.lastReplyText || primary.lastReplyText || "",
            replyClassification: replySource?.replyClassification || primary.replyClassification || mergedStatus,
          } : {}),
          ...(latestManual?.manualReviewedAt ? {
            manualReviewedAt: latestManual.manualReviewedAt,
            manualReviewDecision: latestManual.manualReviewDecision || latestManual.confirmationStatus,
          } : {}),
          mergedAppointmentIds: duplicates.map((item) => item.id),
          mergedAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true });

        duplicates.forEach((duplicate) => {
          batch.set(doc(db, "clinics", clinicId, "clinicAgenda", duplicate.id), {
            active: false,
            mergedIntoAppointmentId: primary.id,
            mergedAt: nowIso,
            updatedAt: nowIso,
          }, { merge: true });
        });

        const duplicateIds = duplicates.map((item) => item.id);
        const queueAndSchedule = await Promise.all(duplicateIds.flatMap((duplicateId) => [
          getDocs(query(collection(clinicRef, "whatsappQueue"), where("clinicAppointmentId", "==", duplicateId))),
          getDocs(query(collection(clinicRef, "whatsappSchedule"), where("clinicAppointmentId", "==", duplicateId))),
        ]));

        queueAndSchedule.forEach((snapshot) => {
          snapshot.docs.forEach((snapshotDoc) => {
            const data = snapshotDoc.data() || {};
            const status = String(data.status || "");
            if (["sent", "failed", "cancelled"].includes(status)) return;
            batch.set(snapshotDoc.ref, {
              status: "cancelled",
              cancelReason: "clinic_duplicate_merged",
              mergedIntoAppointmentId: primary.id,
              cancelledAt: nowIso,
              updatedAt: nowIso,
            }, { merge: true });
          });
        });

        await batch.commit();
      } catch (error) {
        console.error("[clinic-status-bridge][merge-duplicate]", error);
      } finally {
        mergingKeys.delete(groupKey);
      }
    }
  }
}

async function syncManualVisitActions(clinicId: string, items: AgendaItem[]) {
  const activeSources = items
    .filter((item) => item.active !== false && item.manualReviewedAt && ["confirmed", "wont_attend", "cancelled", "reschedule"].includes(String(item.confirmationStatus || "")))
    .sort((a, b) => isoTime(b.manualReviewedAt) - isoTime(a.manualReviewedAt));
  const processed = new Set<string>();

  for (const candidate of activeSources) {
    const group = visitItems(items, candidate);
    const groupKey = `${candidate.date || ""}|${normalizeText(candidate.name || "")}`;
    if (processed.has(groupKey)) continue;
    processed.add(groupKey);

    const source = latestManualAction(group);
    if (!source?.manualReviewedAt) continue;
    const sourceTime = isoTime(source.manualReviewedAt);

    for (const sibling of group) {
      if (isoTime(sibling.manualReviewedAt) > sourceTime) continue;
      const sameStatus = String(sibling.confirmationStatus || "") === String(source.confirmationStatus || "");
      const alreadySynced = sameStatus && isoTime(sibling.manualReviewedAt) === sourceTime;
      if (alreadySynced) continue;

      const nowIso = new Date().toISOString();
      await setDoc(doc(db, "clinics", clinicId, "clinicAgenda", sibling.id), {
        confirmationStatus: source.confirmationStatus,
        manualReviewedAt: source.manualReviewedAt,
        manualReviewDecision: source.manualReviewDecision || source.confirmationStatus,
        manualActionSource: sibling.id === source.id ? "manual_review" : "same_visit_manual_action",
        visitSyncedFrom: source.id,
        visitSyncedAt: nowIso,
        ...(source.confirmationStatus !== "confirmed" ? { vacancyReleasedAt: nowIso } : {}),
        updatedAt: nowIso,
      }, { merge: true });
      await cancelPendingForAppointment(clinicId, sibling.id, "clinic_same_visit_manual_action");
    }
  }
}

/** Mantém a agenda da clínica sincronizada com fila, envio, erro, resposta e a visita completa do paciente. */
export function ClinicStatusBridge() {
  const { currentClinic } = useAuth();
  const agendaRef = useRef<AgendaItem[]>([]);
  const mergingKeysRef = useRef(new Set<string>());

  useEffect(() => {
    if (!currentClinic) return;

    const agendaCollection = collection(db, "clinics", currentClinic, "clinicAgenda");
    const unsubscribeAgenda = onSnapshot(agendaCollection, (snapshot) => {
      const list = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...(snapshotDoc.data() as Omit<AgendaItem, "id">) }));
      agendaRef.current = list;
      void mergeAdjacentDuplicateAppointments(currentClinic, list, mergingKeysRef.current);
      void syncManualVisitActions(currentClinic, list).catch((error) => console.error("[clinic-status-bridge][sync-visit]", error));
    }, (error) => console.error("[clinic-status-bridge][agenda]", error));

    const queueQuery = query(collection(db, "clinics", currentClinic, "whatsappQueue"), orderBy("updatedAt", "desc"), limit(300));
    const unsubscribeQueue = onSnapshot(queueQuery, (snapshot) => {
      snapshot.docs.forEach((snapshotDoc) => {
        const item: QueueItem = { id: snapshotDoc.id, ...(snapshotDoc.data() as Omit<QueueItem, "id">) };
        const appointmentId = appointmentIdFromQueue(item);
        if (!appointmentId) return;

        const existing = agendaRef.current.find((appointment) => appointment.id === appointmentId);
        const nowIso = new Date().toISOString();
        const queuePatch: Record<string, unknown> = {};
        if (!item.clinicAppointmentId) queuePatch.clinicAppointmentId = appointmentId;
        if (!String(item.automationType || "").startsWith("appointment_clinic")) queuePatch.automationType = "appointment_clinic_manual";
        if (!item.automationLabel) queuePatch.automationLabel = "Confirmação da clínica";
        if (Object.keys(queuePatch).length) void setDoc(snapshotDoc.ref, { ...queuePatch, updatedAt: item.updatedAt || nowIso }, { merge: true });

        if (!existing) return;
        const appointmentRef = doc(db, "clinics", currentClinic, "clinicAgenda", appointmentId);
        const status = String(item.status || "");
        const keepFinal = FINAL_STATUSES.has(String(existing.confirmationStatus || ""));

        if (status === "sent") {
          const sentAt = item.sentAt || item.updatedAt || nowIso;
          const linkedVisit = visitItems(agendaRef.current, existing);
          linkedVisit.forEach((visitAppointment) => {
            const visitFinal = FINAL_STATUSES.has(String(visitAppointment.confirmationStatus || ""));
            void setDoc(doc(db, "clinics", currentClinic, "clinicAgenda", visitAppointment.id), {
              ...(visitFinal ? {} : { confirmationStatus: "sent" }),
              remindersSent: { [String(item.automationType || "manual")]: sentAt },
              lastReminderSentAt: sentAt,
              lastReminderMessageId: item.messageId || "",
              lastReminderError: null,
              lastReminderFailedAt: null,
              visitContactedFrom: appointmentId,
              visitContactedAt: sentAt,
              updatedAt: sentAt,
            }, { merge: true });
            if (visitAppointment.id !== appointmentId) {
              void cancelPendingForAppointment(currentClinic, visitAppointment.id, "clinic_same_visit_already_contacted")
                .catch((error) => console.error("[clinic-status-bridge][cancel-linked-visit]", error));
            }
          });
          return;
        }

        if (status === "failed") {
          const failedAt = item.failedAt || item.updatedAt || nowIso;
          void setDoc(appointmentRef, {
            ...(keepFinal ? {} : { confirmationStatus: "failed" }),
            lastReminderFailedAt: failedAt,
            lastReminderError: String(item.error || "Falha no envio").slice(0, 500),
            updatedAt: failedAt,
          }, { merge: true });
          return;
        }

        if ((status === "pending" || status === "leased") && !keepFinal) {
          void setDoc(appointmentRef, { confirmationStatus: "queued", updatedAt: item.updatedAt || nowIso }, { merge: true });
        }
      });
    }, (error) => console.error("[clinic-status-bridge][queue]", error));

    const chatsQuery = query(collection(db, "clinics", currentClinic, "whatsappChats"), orderBy("lastMessageAt", "desc"), limit(150));
    const unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
      snapshot.docs.forEach((snapshotDoc) => {
        const chat: ChatItem = { id: snapshotDoc.id, ...(snapshotDoc.data() as Omit<ChatItem, "id">) };
        if (chat.lastDirection !== "in" || !chat.lastMessageAt) return;
        const chatPhoneKey = canonicalPhoneKey(chat.phoneKey || chat.phone || chat.id);
        const replyAtMs = isoTime(chat.lastMessageAt);
        if (!chatPhoneKey || !replyAtMs) return;

        const candidates = agendaRef.current
          .filter((appointment) => {
            if (appointment.active === false) return false;
            const appointmentPhoneKey = canonicalPhoneKey(appointment.phoneKey || appointment.phone || "");
            const sentAtMs = isoTime(appointment.lastReminderSentAt || appointment.remindersSent?.manual);
            const apptMs = appointmentTime(appointment);
            return appointmentPhoneKey === chatPhoneKey && sentAtMs > 0 && replyAtMs >= sentAtMs && apptMs > replyAtMs - 2 * 60 * 60 * 1000;
          })
          .sort((a, b) => appointmentTime(a) - appointmentTime(b));

        const appointment = candidates[0];
        if (!appointment) return;

        const linkedVisit = visitItems(agendaRef.current, appointment);
        const latestManual = latestManualAction(linkedVisit);
        if (latestManual?.manualReviewedAt && isoTime(latestManual.manualReviewedAt) >= replyAtMs) return;

        let classified = classifyReply(chat.lastMessage || "");
        if (appointment.confirmationStatus === "released_unconfirmed" && classified === "confirmed") classified = "reschedule";

        linkedVisit.forEach((visitAppointment) => {
          void setDoc(doc(db, "clinics", currentClinic, "clinicAgenda", visitAppointment.id), {
            confirmationStatus: classified,
            lastReplyAt: chat.lastMessageAt,
            lastReplyText: String(chat.lastMessage || "Mensagem recebida").slice(0, 500),
            replyClassification: classified,
            visitReplyFrom: appointment.id,
            visitReplyAt: chat.lastMessageAt,
            updatedAt: chat.lastMessageAt,
          }, { merge: true });
          if (["confirmed", "wont_attend", "reschedule"].includes(classified)) {
            void cancelPendingForAppointment(currentClinic, visitAppointment.id, "clinic_same_visit_reply")
              .catch((error) => console.error("[clinic-status-bridge][cancel-after-reply]", error));
          }
        });
      });
    }, (error) => console.error("[clinic-status-bridge][chats]", error));

    return () => { unsubscribeAgenda(); unsubscribeQueue(); unsubscribeChats(); };
  }, [currentClinic]);

  return null;
}
