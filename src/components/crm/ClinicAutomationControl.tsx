import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where, writeBatch } from "firebase/firestore";
import { PauseCircle, Phone, PlayCircle, ShieldAlert } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type RecipientConflict = {
  key?: string;
  phoneKey?: string;
  date?: string;
  names?: string[];
};

type AutomationSettings = {
  paused?: boolean;
  pauseReason?: string;
  pausedAt?: string;
  resumedAt?: string;
  recipientConflicts?: RecipientConflict[];
};

type ConflictAppointment = {
  id: string;
  name?: string;
  phone?: string;
  phoneKey?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
  professional?: string;
  active?: boolean;
};

type ConflictDetail = {
  conflict: RecipientConflict;
  appointments: ConflictAppointment[];
};

function isClinicAutomaticMessage(data: Record<string, unknown>) {
  return String(data.automationType || "").startsWith("appointment_clinic_") || String(data.createdBy || "") === "clinic-agenda-automation";
}

function conflictParts(conflict: RecipientConflict) {
  const rawKey = String(conflict.key || "");
  const separator = rawKey.indexOf("|");
  const keyDate = separator >= 0 ? rawKey.slice(0, separator) : "";
  const keyPhone = separator >= 0 ? rawKey.slice(separator + 1) : "";
  return {
    date: String(conflict.date || keyDate || ""),
    phoneKey: String(conflict.phoneKey || keyPhone || ""),
  };
}

function displayPhone(value?: string | null) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "Telefone não identificado";
}

export function ClinicAutomationControl() {
  const { currentClinic } = useAuth();
  const [settings, setSettings] = useState<AutomationSettings>({ paused: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [loadingConflictDetails, setLoadingConflictDetails] = useState(false);
  const [conflictDetails, setConflictDetails] = useState<ConflictDetail[]>([]);

  useEffect(() => {
    if (!currentClinic) return;
    const ref = doc(db, "clinics", currentClinic, "settings", "clinicAutomation");
    return onSnapshot(ref, (snapshot) => {
      setSettings(snapshot.exists() ? (snapshot.data() as AutomationSettings) : { paused: true, pauseReason: "safety_default" });
      setLoading(false);
    }, () => setLoading(false));
  }, [currentClinic]);

  const paused = settings.paused !== false;
  const legacyConflictPause = settings.pauseReason === "recipient_conflict";
  const conflicts = Array.isArray(settings.recipientConflicts) ? settings.recipientConflicts : [];
  const conflictCount = conflicts.length;

  const statusText = useMemo(() => {
    if (legacyConflictPause) return `Pausada por segurança${conflictCount ? ` • ${conflictCount} conflito(s)` : ""}`;
    if (paused) return "Envios automáticos pausados";
    return conflictCount ? `Automação ativa • ${conflictCount} bloqueado(s)` : "Automação ativa";
  }, [legacyConflictPause, conflictCount, paused]);

  const loadConflictDetails = async () => {
    if (!currentClinic || !conflicts.length) {
      setConflictDetails([]);
      return;
    }

    setLoadingConflictDetails(true);
    try {
      const agendaSnap = await getDocs(collection(db, "clinics", currentClinic, "clinicAgenda"));
      const appointments = agendaSnap.docs.map((snapshotDoc) => ({
        id: snapshotDoc.id,
        ...(snapshotDoc.data() as Omit<ConflictAppointment, "id">),
      }));

      const details = conflicts.map((conflict) => {
        const parts = conflictParts(conflict);
        const matching = appointments
          .filter((item) => item.active !== false)
          .filter((item) => String(item.date || "") === parts.date && String(item.phoneKey || "") === parts.phoneKey)
          .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));
        return { conflict, appointments: matching };
      });
      setConflictDetails(details);
    } catch (error) {
      console.error("[clinic-conflicts-review]", error);
      toast.error("Não foi possível carregar os números bloqueados.");
    } finally {
      setLoadingConflictDetails(false);
    }
  };

  const openConflicts = () => {
    setConflictsOpen(true);
    void loadConflictDetails();
  };

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
        recipientConflictCount: 0,
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
    <>
      <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 ${paused ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="hidden min-w-0 sm:block">
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${paused ? "text-amber-800" : "text-emerald-700"}`}>
            {legacyConflictPause ? <ShieldAlert className="h-3.5 w-3.5" /> : paused ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
            <span>{loading ? "Carregando automação..." : statusText}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Envio manual continua funcionando.</div>
        </div>

        {conflictCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openConflicts}
            className="h-8 gap-1.5 whitespace-nowrap border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Revisar {conflictCount} bloqueado{conflictCount === 1 ? "" : "s"}
          </Button>
        )}

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

      <Dialog open={conflictsOpen} onOpenChange={setConflictsOpen}>
        <DialogContent className="max-h-[82vh] overflow-hidden sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Números bloqueados para envio automático</DialogTitle>
            <DialogDescription>
              O mesmo telefone apareceu ligado a pacientes diferentes. Só esses números ficam bloqueados; os demais envios continuam normalmente.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
            {loadingConflictDetails && <div className="py-8 text-center text-sm text-muted-foreground">Carregando conflitos...</div>}

            {!loadingConflictDetails && !conflictDetails.length && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">Nenhum número bloqueado no momento.</div>
            )}

            {!loadingConflictDetails && conflictDetails.map(({ conflict, appointments }) => {
              const parts = conflictParts(conflict);
              const phone = appointments.find((item) => item.phone)?.phone || parts.phoneKey;
              return (
                <div key={String(conflict.key || `${parts.date}|${parts.phoneKey}`)} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold text-amber-900">
                      <Phone className="h-4 w-4" />
                      {displayPhone(phone)}
                    </div>
                    <div className="text-xs font-medium text-amber-800">{parts.date || "Data não identificada"}</div>
                  </div>

                  <div className="mt-2 text-xs text-amber-800">Envio automático bloqueado até o telefone ser corrigido ou o conflito deixar de existir.</div>

                  <div className="mt-3 overflow-hidden rounded-lg border bg-background">
                    {appointments.length ? appointments.map((item) => (
                      <div key={item.id} className="border-b px-3 py-2.5 last:border-b-0">
                        <div className="font-medium">{item.name || "Paciente sem nome"}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {item.startTime || "--:--"}{item.endTime ? `–${item.endTime}` : ""} • {item.professional || "Profissional não identificado"}
                        </div>
                      </div>
                    )) : (conflict.names || []).map((name) => (
                      <div key={name} className="border-b px-3 py-2.5 last:border-b-0">
                        <div className="font-medium capitalize">{name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            Para liberar um número, corrija o telefone do paciente na agenda/Confirmações. A proteção será reavaliada automaticamente e não libera mensagens antigas em bloco.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
