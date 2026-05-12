import { useEffect, useState, useCallback } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";
import { TimelineActivity, TimelineActivityType } from "@/types/crm";
import { normalizePhoneTo10Digits } from "@/lib/phone";

// Converte Timestamp Firestore ou string ISO para string ISO
function toISOString(ts: any): string {
  if (!ts) return new Date().toISOString();
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (typeof ts === "string") return ts;
  if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString();
  return new Date().toISOString();
}

export interface AddActivityOptions {
  leadId: string;
  type: TimelineActivityType;
  data: TimelineActivity["data"];
  createdByName?: string;
}

export function useTimeline(leadId: string | null, leadTelefone?: string) {
  const [activities, setActivities] = useState<TimelineActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const { currentClinic, selectedClinic, user } = useAuth();
  const clinicId = currentClinic || selectedClinic;

  // ─── Escuta atividades da subcoleção de timeline ──────────────────────────
  useEffect(() => {
    if (!leadId || !clinicId) return;

    setLoading(true);
    const ref = collection(
      db,
      "clinics", clinicId,
      "timelines", leadId,
      "activities"
    );
    const q = query(ref, orderBy("timestamp", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const items: TimelineActivity[] = snap.docs.map((d) => ({
        id: d.id,
        leadId,
        type: d.data().type as TimelineActivityType,
        timestamp: toISOString(d.data().timestamp),
        createdBy: d.data().createdBy,
        createdByName: d.data().createdByName,
        data: d.data().data || {},
      }));
      setActivities(items);
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return () => unsub();
  }, [leadId, clinicId]);

  // ─── Escuta mensagens WhatsApp e mescla na timeline ───────────────────────
  const [whatsappMessages, setWhatsappMessages] = useState<TimelineActivity[]>([]);

  useEffect(() => {
    if (!leadTelefone) return;
    const phone10 = normalizePhoneTo10Digits(leadTelefone);
    if (!phone10) return;

    const msgsRef = collection(db, "conversations", phone10, "messages");
    const q = query(msgsRef, orderBy("timestamp", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const msgs: TimelineActivity[] = snap.docs.map((d) => {
        const d_ = d.data();
        return {
          id: `wa_${d.id}`,
          leadId: leadId || "",
          type: "WHATSAPP_MESSAGE" as TimelineActivityType,
          timestamp: toISOString(d_.timestamp),
          data: {
            content: d_.body || d_.text || "",
            from: d_.fromMe ? "clinic" : "paciente",
            deliveryStatus: d_.read ? "lida" : "entregue",
          },
        };
      });
      setWhatsappMessages(msgs);
    }, () => {});

    return () => unsub();
  }, [leadTelefone, leadId]);

  // ─── Merge e ordena tudo por timestamp desc ───────────────────────────────
  const allActivities = [...activities, ...whatsappMessages].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // ─── Adicionar atividade ──────────────────────────────────────────────────
  const addActivity = useCallback(
    async (opts: Omit<AddActivityOptions, "leadId"> & { leadId?: string }) => {
      const lid = opts.leadId || leadId;
      if (!lid || !clinicId) return;

      try {
        const ref = collection(
          db,
          "clinics", clinicId,
          "timelines", lid,
          "activities"
        );
        await addDoc(ref, {
          type: opts.type,
          timestamp: serverTimestamp(),
          createdBy: user?.uid || null,
          createdByName: opts.createdByName || null,
          data: opts.data,
        });
      } catch (err) {
        // Silently fail — timeline is supplementary, not critical
        console.warn("[useTimeline] addActivity failed:", err);
      }
    },
    [leadId, clinicId, user?.uid]
  );

  return { activities: allActivities, loading, addActivity };
}

// ─── Helper exportado para registrar atividade sem montar o hook ────────────
// Permite ser chamado de dentro de useLeads (sem acesso ao React context)
export async function saveTimelineActivity(
  clinicId: string,
  leadId: string,
  type: TimelineActivityType,
  data: TimelineActivity["data"],
  userId?: string | null,
  userName?: string | null
): Promise<void> {
  if (!clinicId || !leadId) return;
  try {
    const ref = collection(
      db,
      "clinics", clinicId,
      "timelines", leadId,
      "activities"
    );
    await addDoc(ref, {
      type,
      timestamp: serverTimestamp(),
      createdBy: userId || null,
      createdByName: userName || null,
      data,
    });
  } catch (err) {
    console.warn("[timeline] saveTimelineActivity failed:", err);
  }
}
