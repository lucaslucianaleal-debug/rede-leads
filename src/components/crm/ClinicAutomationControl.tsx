import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where, writeBatch } from "firebase/firestore";
import { PauseCircle, PlayCircle, ShieldAlert } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type AutomationSettings = {
  paused?: boolean;
  pauseReason?: string;
  pausedAt?: string;
  resumedAt?: string;
  recipientConflicts?: Array<{ key?: string; names?: string[] }>;
};

function isClinicAutomaticMessage(data: Record<string, unknown>) {
  return String(data.automationType || "").startsWith("appointment_clinic_") || String(data.createdBy || "") === "clinic-agenda-automation";
}

export function ClinicAutomationControl() {
  const { currentClinic } = useAuth();
  const [settings, setSettings] = useState<AutomationSettings>({ paused: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentClinic) return;
    const ref = doc(db, "clinics", currentClinic, "settings", "clinicAutomation");
    return onSnapshot(ref, (snapshot) => {
      setSettings(snapshot.exists() ? (snapshot.data() as AutomationSettings) : { paused: true, pauseReason: "safety_default" });
      setLoading(false);
    }, () => setLoading(false));
  }, [currentClinic]);

  const paused = settings.paused !== false;
  const conflict = settings.pauseReason === "recipient_conflict";
  const conflictCount = Array.isArray(settings.recipientConflicts) ? settings.recipientConflicts.length : 0;

  const statusText = useMemo(() => {
    if (conflict) return `Pausada por segurança${conflictCount ? ` • ${conflictCount} conflito(s)` : ""}`;
    return paused ? "Envios automáticos pausados" : "Automação ativa";
  }, [conflict, conflictCount, paused]);

  const cancelQueuedAutomaticMessages = async () => {
    if (!currentClinic) return 0;
    const queueCol = collection(db, "clinics", currentClinic, "whatsappQueue");
    const [pendingSnap, leasedSnap] = await Promise.all([
      getDocs(query(queueCol, where("status", "==", "pending"))),
      getDocs(query(queueCol, where("status", "==", "leased"))),
    ]);
    const docs = [...pendingSnap.docs, ...leasedSnap.docs].filter((snapshotDoc) => isClinicAutomaticMessage(snapshotDoc.data() as Record<string, unknown>));
    if (!docs.length) return 0;

    const nowIso = new Date().toISOString();
    let cancelled = 0;
    for (let start = 0; start < docs.length; start += 400) {
      const batch = writeBatch(db);
      docs.slice(start, start + 400).forEach((snapshotDoc) => {
        batch.set(snapshotDoc.ref, {
          status: "cancelled",
          cancelReason: "clinic_automation_paused_by_user",
          cancelledAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true });
        cancelled += 1;
      });
      await batch.commit();
    }
    return cancelled;
  };

  const toggle = async () => {
    if (!currentClinic || saving) return;
    setSaving(true);
    const settingsRef = doc(db, "clinics", currentClinic, "settings", "clinicAutomation");
    const nowIso = new Date().toISOString();

    try {
      if (!paused) {
        await setDoc(settingsRef, {
          paused: true,
          pauseReason: "manual",
          pausedAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true });
        const cancelled = await cancelQueuedAutomaticMessages();
        toast.success(cancelled ? `Automação pausada. ${cancelled} envio(s) automático(s) pendente(s) foram cancelados.` : "Automação pausada.");
        return;
      }

      await setDoc(settingsRef, {
        paused: false,
        pauseReason: null,
        recipientConflicts: [],
        resumedAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });
      toast.success("Automação retomada. A régua volta a avaliar os próximos horários.");
    } catch (error) {
      console.error("[clinic-automation-control]", error);
      toast.error("Não foi possível alterar a automação.");
    } finally {
      setSaving(false);
    }
  };

  if (!currentClinic) return null;

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${paused ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="hidden min-w-0 sm:block">
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${paused ? "text-amber-800" : "text-emerald-700"}`}>
          {conflict ? <ShieldAlert className="h-3.5 w-3.5" /> : paused ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
          <span>{loading ? "Carregando automação..." : statusText}</span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">Envio manual continua funcionando.</div>
      </div>
      <Button
        type="button"
        size="sm"
        variant={paused ? "default" : "outline"}
        onClick={() => void toggle()}
        disabled={loading || saving}
        className="h-8 gap-1.5 whitespace-nowrap"
      >
        {paused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
        {saving ? "Salvando..." : paused ? "Retomar" : "Pausar envios"}
      </Button>
    </div>
  );
}
