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
  active?: boolean;
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

function todayBr() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")}`;
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

/**
 * Mantém a agenda da clínica sincronizada com as duas fontes reais do WhatsApp:
 * - whatsappQueue: fila, envio e erro
 * - whatsappChats: resposta recebida do paciente
 */
export function ClinicStatusBridge() {
  const { currentClinic } = useAuth();
  const agendaRef = useRef<AgendaItem[]>([]);

  useEffect(() => {
    if (!currentClinic) return;

    const agendaCollection = collection(db, "clinics", currentClinic, "clinicAgenda");
    const unsubscribeAgenda = onSnapshot(agendaCollection, (snapshot) => {
      agendaRef.current = snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...(snapshotDoc.data() as Omit<AgendaItem, "id">),
      }));
    }, (error) => {
      console.error("[clinic-status-bridge][agenda]", error);
    });

    const queueQuery = query(
      collection(db, "clinics", currentClinic, "whatsappQueue"),
      orderBy("updatedAt", "desc"),
      limit(300),
    );

    const unsubscribeQueue = onSnapshot(queueQuery, (snapshot) => {
      snapshot.docs.forEach((snapshotDoc) => {
        const data = snapshotDoc.data() as Omit<QueueItem, "id">;
        const item: QueueItem = { id: snapshotDoc.id, ...data };
        const appointmentId = appointmentIdFromQueue(item);
        if (!appointmentId) return;

        const nowIso = new Date().toISOString();
        const queuePatch: Record<string, unknown> = {};

        if (!item.clinicAppointmentId) queuePatch.clinicAppointmentId = appointmentId;
        if (!String(item.automationType || "").startsWith("appointment_clinic")) {
          queuePatch.automationType = "appointment_clinic_manual";
        }
        if (!item.automationLabel) queuePatch.automationLabel = "Confirmação da clínica";

        if (Object.keys(queuePatch).length) {
          void setDoc(snapshotDoc.ref, { ...queuePatch, updatedAt: item.updatedAt || nowIso }, { merge: true });
        }

        const appointmentRef = doc(db, "clinics", currentClinic, "clinicAgenda", appointmentId);
        const status = String(item.status || "");

        if (status === "sent") {
          const sentAt = item.sentAt || item.updatedAt || nowIso;
          void setDoc(appointmentRef, {
            confirmationStatus: "sent",
            remindersSent: { manual: sentAt },
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
            confirmationStatus: "failed",
            lastReminderFailedAt: failedAt,
            lastReminderError: String(item.error || "Falha no envio").slice(0, 500),
            updatedAt: failedAt,
          }, { merge: true });
          return;
        }

        if (status === "pending" || status === "leased") {
          void setDoc(appointmentRef, {
            confirmationStatus: "queued",
            updatedAt: item.updatedAt || nowIso,
          }, { merge: true });
        }
      });
    }, (error) => {
      console.error("[clinic-status-bridge][queue]", error);
    });

    const chatsQuery = query(
      collection(db, "clinics", currentClinic, "whatsappChats"),
      orderBy("lastMessageAt", "desc"),
      limit(150),
    );

    const unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
      const today = todayBr();
      snapshot.docs.forEach((snapshotDoc) => {
        const data = snapshotDoc.data() as Omit<ChatItem, "id">;
        const chat: ChatItem = { id: snapshotDoc.id, ...data };
        if (chat.lastDirection !== "in" || !chat.lastMessageAt) return;

        const chatPhoneKey = canonicalPhoneKey(chat.phoneKey || chat.phone || chat.id);
        if (!chatPhoneKey) return;
        const replyAtMs = isoTime(chat.lastMessageAt);
        if (!replyAtMs) return;

        const matches = agendaRef.current.filter((appointment) => {
          if (appointment.active === false || appointment.date !== today) return false;
          const appointmentPhoneKey = canonicalPhoneKey(appointment.phoneKey || appointment.phone || "");
          if (!appointmentPhoneKey || appointmentPhoneKey !== chatPhoneKey) return false;
          const sentAt = appointment.lastReminderSentAt || appointment.remindersSent?.manual;
          const sentAtMs = isoTime(sentAt);
          return sentAtMs > 0 && replyAtMs >= sentAtMs;
        });

        matches.forEach((appointment) => {
          void setDoc(doc(db, "clinics", currentClinic, "clinicAgenda", appointment.id), {
            confirmationStatus: "replied",
            lastReplyAt: chat.lastMessageAt,
            lastReplyText: String(chat.lastMessage || "Mensagem recebida").slice(0, 500),
            updatedAt: chat.lastMessageAt,
          }, { merge: true });
        });
      });
    }, (error) => {
      console.error("[clinic-status-bridge][chats]", error);
    });

    return () => {
      unsubscribeAgenda();
      unsubscribeQueue();
      unsubscribeChats();
    };
  }, [currentClinic]);

  return null;
}
