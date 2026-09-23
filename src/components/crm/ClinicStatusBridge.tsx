import { useEffect } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

type QueueItem = {
  id: string;
  leadId?: string;
  clinicAppointmentId?: string;
  status?: "pending" | "leased" | "sent" | "failed" | "cancelled";
  sentAt?: string;
  failedAt?: string;
  updatedAt?: string;
  messageId?: string;
  error?: string;
  automationType?: string;
  automationLabel?: string;
};

function appointmentIdFromQueue(item: QueueItem) {
  const explicit = String(item.clinicAppointmentId || "").trim();
  if (explicit) return explicit;
  const leadId = String(item.leadId || "").trim();
  return leadId.startsWith("clinic_") ? leadId : "";
}

/**
 * Mantém a agenda da clínica sincronizada com a fonte real de envio: whatsappQueue.
 * Também corrige registros antigos que entraram como mensagem manual genérica.
 */
export function ClinicStatusBridge() {
  const { currentClinic } = useAuth();

  useEffect(() => {
    if (!currentClinic) return;

    const queueQuery = query(
      collection(db, "clinics", currentClinic, "whatsappQueue"),
      orderBy("updatedAt", "desc"),
      limit(250),
    );

    return onSnapshot(queueQuery, (snapshot) => {
      snapshot.docs.forEach((snapshotDoc) => {
        const data = snapshotDoc.data() as Omit<QueueItem, "id">;
        const item: QueueItem = { id: snapshotDoc.id, ...data };
        const appointmentId = appointmentIdFromQueue(item);
        if (!appointmentId) return;

        const nowIso = new Date().toISOString();
        const queuePatch: Record<string, unknown> = {};

        // Backfill dos envios antigos: isso faz o sininho deixar de chamar
        // confirmação da clínica de "Follow-up enviado".
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
            remindersSent: { manual: sentAt },
            lastReminderSentAt: sentAt,
            lastReminderMessageId: item.messageId || "",
            lastReminderError: null,
            updatedAt: sentAt,
          }, { merge: true });
          return;
        }

        if (status === "failed") {
          const failedAt = item.failedAt || item.updatedAt || nowIso;
          void setDoc(appointmentRef, {
            confirmationStatus: "pending",
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
      console.error("[clinic-status-bridge]", error);
    });
  }, [currentClinic]);

  return null;
}
