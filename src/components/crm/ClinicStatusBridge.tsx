import { useEffect, useRef } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
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
  phone?: string;
  phoneKey?: string | null;
  date?: string;
  startTime?: string;
  active?: boolean;
  confirmationStatus?: string;
  remindersSent?: Record<string, string>;
  lastReminderSentAt?: string;
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

function normalizeText(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function classifyReply(value: string) {
  const text = normalizeText(value);
  const rebookTerms = ["reagendar", "remarcar", "outro horario", "outro dia", "trocar horario", "mudar horario", "nao consigo esse horario"];
  const noTerms = ["nao vou", "nao poderei", "nao posso ir", "cancelar", "cancela", "nao consigo ir", "nao compareco"];
  const yesTerms = ["sim", "confirmo", "confirmado", "vou sim", "estarei ai", "pode confirmar", "presenca confirmada", "vou estar ai"];
  if (rebookTerms.some((term) => text.includes(term))) return "reschedule";
  if (noTerms.some((term) => text.includes(term))) return "wont_attend";
  if (yesTerms.some((term) => text === term || text.includes(term))) return "confirmed";
  return "replied";
}

const FINAL_STATUSES = new Set(["confirmed", "wont_attend", "cancelled", "reschedule", "released_unconfirmed"]);

/** Mantém a agenda da clínica sincronizada com fila, envio, erro e resposta real do WhatsApp. */
export function ClinicStatusBridge() {
  const { currentClinic } = useAuth();
  const agendaRef = useRef<AgendaItem[]>([]);

  useEffect(() => {
    if (!currentClinic) return;

    const agendaCollection = collection(db, "clinics", currentClinic, "clinicAgenda");
    const unsubscribeAgenda = onSnapshot(agendaCollection, (snapshot) => {
      agendaRef.current = snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...(snapshotDoc.data() as Omit<AgendaItem, "id">) }));
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

        const appointmentRef = doc(db, "clinics", currentClinic, "clinicAgenda", appointmentId);
        const status = String(item.status || "");
        const keepFinal = existing && FINAL_STATUSES.has(String(existing.confirmationStatus || ""));

        if (status === "sent") {
          const sentAt = item.sentAt || item.updatedAt || nowIso;
          void setDoc(appointmentRef, {
            ...(keepFinal ? {} : { confirmationStatus: "sent" }),
            remindersSent: { [String(item.automationType || "manual")]: sentAt },
            lastReminderSentAt: sentAt,
            lastReminderMessageId: item.messageId || "",
            lastReminderError: null,
            lastReminderFailedAt: null,
            updatedAt: sentAt,
          }, { merge: true });
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
        let classified = classifyReply(chat.lastMessage || "");
        if (appointment.confirmationStatus === "released_unconfirmed" && classified === "confirmed") classified = "reschedule";

        void setDoc(doc(db, "clinics", currentClinic, "clinicAgenda", appointment.id), {
          confirmationStatus: classified,
          lastReplyAt: chat.lastMessageAt,
          lastReplyText: String(chat.lastMessage || "Mensagem recebida").slice(0, 500),
          replyClassification: classified,
          updatedAt: chat.lastMessageAt,
        }, { merge: true });
      });
    }, (error) => console.error("[clinic-status-bridge][chats]", error));

    return () => { unsubscribeAgenda(); unsubscribeQueue(); unsubscribeChats(); };
  }, [currentClinic]);

  return null;
}
