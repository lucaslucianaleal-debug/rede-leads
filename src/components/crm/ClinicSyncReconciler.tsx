import { useEffect, useRef } from "react";
import { collection, doc, onSnapshot, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";

type ScheduleSnapshot = {
  date: string;
  startTime: string;
  endTime: string;
  professional: string;
};

type ClinicAppointment = {
  id: string;
  name: string;
  phone?: string;
  phoneKey?: string | null;
  leadId?: string;
  date: string;
  startTime: string;
  endTime?: string;
  professional: string;
  active?: boolean;
  updatedAt?: string;
  importedAt?: string;
  manuallyEditedAt?: string;
  confirmationStatus?: string;
  matrixSyncStatus?: string;
  matrixSyncNote?: string | null;
  manualRebookedAt?: string;
  manualExpectedSchedule?: ScheduleSnapshot;
};

const stripAccents = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizeKey = (value: string) => stripAccents(String(value || "")).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

function scheduleOf(item: ClinicAppointment): ScheduleSnapshot {
  return {
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime || item.startTime,
    professional: item.professional,
  };
}

function sameSchedule(a: ScheduleSnapshot, b: ScheduleSnapshot) {
  return a.date === b.date && a.startTime === b.startTime && normalizeKey(a.professional) === normalizeKey(b.professional);
}

function timestamp(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Reconcilia uma alteração manual feita após reagendamento com o próximo PDF importado.
 * O importador atual usa a matriz como fonte de verdade e pode criar um novo ID quando
 * data/horário mudam. Este bridge encontra o registro manual arquivado e compara com o
 * novo registro ativo da matriz.
 */
export function ClinicSyncReconciler() {
  const { currentClinic } = useAuth();
  const processingRef = useRef(false);

  useEffect(() => {
    if (!currentClinic) return;

    return onSnapshot(collection(db, "clinics", currentClinic, "clinicAgenda"), (snapshot) => {
      if (processingRef.current) return;
      const all: ClinicAppointment[] = snapshot.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...(snapshotDoc.data() as Omit<ClinicAppointment, "id">),
      }));

      const archivedManual = all.filter((item) =>
        item.active === false &&
        item.matrixSyncStatus === "manual_pending" &&
        Boolean(item.manualRebookedAt),
      );
      if (!archivedManual.length) return;

      processingRef.current = true;
      void (async () => {
        try {
          const nowIso = new Date().toISOString();
          const batch = writeBatch(db);
          let changes = 0;

          archivedManual.forEach((manual) => {
            const expected = manual.manualExpectedSchedule || scheduleOf(manual);
            const changedAt = timestamp(manual.manualRebookedAt);
            const nameKey = normalizeKey(manual.name);

            let candidates = all.filter((candidate) => {
              if (candidate.id === manual.id || candidate.active === false) return false;
              if (normalizeKey(candidate.name) !== nameKey) return false;
              const candidateUpdated = Math.max(timestamp(candidate.updatedAt), timestamp(candidate.importedAt));
              return !changedAt || candidateUpdated >= changedAt;
            });

            if (manual.phoneKey) {
              const samePhone = candidates.filter((candidate) => candidate.phoneKey && candidate.phoneKey === manual.phoneKey);
              if (samePhone.length) candidates = samePhone;
            }

            const exact = candidates.filter((candidate) => sameSchedule(scheduleOf(candidate), expected));
            const chosen = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;

            if (!chosen) {
              const reason = candidates.length > 1
                ? "A matriz retornou mais de um atendimento possível para este paciente. Revise manualmente."
                : "O reagendamento não foi encontrado no último PDF importado da matriz.";
              batch.set(doc(db, "clinics", currentClinic, "clinicAgenda", manual.id), {
                matrixSyncStatus: "divergent",
                matrixSyncNote: reason,
                matrixCheckedAt: nowIso,
                updatedAt: nowIso,
              }, { merge: true });
              changes += 1;
              return;
            }

            const matrixSchedule = scheduleOf(chosen);
            const synced = sameSchedule(matrixSchedule, expected);
            const preserveManualIdentity = Boolean(manual.manuallyEditedAt);

            batch.set(doc(db, "clinics", currentClinic, "clinicAgenda", chosen.id), {
              matrixSyncStatus: synced ? "synced" : "divergent",
              matrixSyncNote: synced ? null : "A matriz retornou data, horário ou profissional diferente do que foi lançado manualmente.",
              matrixCheckedAt: nowIso,
              matrixSyncedAt: synced ? nowIso : null,
              manualExpectedSchedule: expected,
              matrixSchedule,
              manualRebookedAt: manual.manualRebookedAt,
              ...(preserveManualIdentity && manual.name ? { name: manual.name } : {}),
              ...(preserveManualIdentity && manual.phone !== undefined ? { phone: manual.phone, phoneKey: manual.phoneKey || null } : {}),
              ...(manual.leadId ? { leadId: manual.leadId } : {}),
              updatedAt: nowIso,
            }, { merge: true });

            batch.set(doc(db, "clinics", currentClinic, "clinicAgenda", manual.id), {
              matrixSyncStatus: "reconciled_archived",
              matrixSyncNote: synced ? "Conferido com a matriz." : "Substituído pelo horário retornado pela matriz para revisão.",
              reconciledToId: chosen.id,
              matrixCheckedAt: nowIso,
              updatedAt: nowIso,
            }, { merge: true });
            changes += 2;
          });

          if (changes) await batch.commit();
        } catch (error) {
          console.error("[clinic-sync-reconciler]", error);
        } finally {
          processingRef.current = false;
        }
      })();
    });
  }, [currentClinic]);

  return null;
}
