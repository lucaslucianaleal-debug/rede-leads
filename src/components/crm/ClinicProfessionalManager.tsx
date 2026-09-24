import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { Pencil, Stethoscope } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type AgendaProfessional = {
  id: string;
  professional?: string;
  professionalSource?: string;
  active?: boolean;
};

type AliasSettings = {
  aliases?: Record<string, string>;
};

function normalizeKey(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function ClinicProfessionalManager() {
  const { currentClinic } = useAuth();
  const [appointments, setAppointments] = useState<AgendaProfessional[]>([]);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentClinic) return;
    return onSnapshot(collection(db, "clinics", currentClinic, "clinicAgenda"), (snapshot) => {
      setAppointments(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...(snapshotDoc.data() as Omit<AgendaProfessional, "id">) })));
    });
  }, [currentClinic]);

  useEffect(() => {
    if (!currentClinic) return;
    const ref = doc(db, "clinics", currentClinic, "settings", "professionalAliases");
    return onSnapshot(ref, (snapshot) => {
      const data = snapshot.exists() ? (snapshot.data() as AliasSettings) : {};
      setAliases(data.aliases || {});
    });
  }, [currentClinic]);

  // Reaplica nomes corrigidos depois de uma nova importação do PDF.
  useEffect(() => {
    if (!currentClinic || !appointments.length || !Object.keys(aliases).length) return;
    const mismatches = appointments.filter((item) => {
      if (item.active === false) return false;
      const source = item.professionalSource || item.professional || "";
      const alias = aliases[normalizeKey(source)];
      return Boolean(alias && alias !== item.professional);
    });
    if (!mismatches.length) return;

    const run = async () => {
      const nowIso = new Date().toISOString();
      for (let start = 0; start < mismatches.length; start += 400) {
        const batch = writeBatch(db);
        mismatches.slice(start, start + 400).forEach((item) => {
          const source = item.professionalSource || item.professional || "";
          const alias = aliases[normalizeKey(source)];
          if (!alias) return;
          batch.set(doc(db, "clinics", currentClinic, "clinicAgenda", item.id), {
            professionalSource: source,
            professional: alias,
            professionalManuallyEditedAt: nowIso,
            updatedAt: nowIso,
          }, { merge: true });
        });
        await batch.commit();
      }
    };
    void run().catch((error) => console.error("[clinic-professional-alias]", error));
  }, [aliases, appointments, currentClinic]);

  const professionals = useMemo(() => Array.from(new Set(
    appointments.filter((item) => item.active !== false).map((item) => String(item.professional || "").trim()).filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, "pt-BR")), [appointments]);

  const startEdit = (value?: string) => {
    const name = value || professionals[0] || "";
    setSelected(name);
    setNewName(name);
    setOpen(true);
  };

  const save = async () => {
    if (!currentClinic || !selected || !newName.trim()) return;
    const targetName = newName.trim();
    setSaving(true);
    try {
      const affected = appointments.filter((item) => item.active !== false && String(item.professional || "").trim() === selected);
      const sourceNames = new Set(affected.map((item) => String(item.professionalSource || item.professional || "").trim()).filter(Boolean));
      if (!sourceNames.size) sourceNames.add(selected);

      const nextAliases = { ...aliases };
      sourceNames.forEach((source) => { nextAliases[normalizeKey(source)] = targetName; });
      const nowIso = new Date().toISOString();

      await setDoc(doc(db, "clinics", currentClinic, "settings", "professionalAliases"), {
        aliases: nextAliases,
        updatedAt: nowIso,
      }, { merge: true });

      for (let start = 0; start < affected.length; start += 400) {
        const batch = writeBatch(db);
        affected.slice(start, start + 400).forEach((item) => {
          const source = String(item.professionalSource || item.professional || selected).trim();
          batch.set(doc(db, "clinics", currentClinic, "clinicAgenda", item.id), {
            professionalSource: source,
            professional: targetName,
            professionalManuallyEditedAt: nowIso,
            updatedAt: nowIso,
          }, { merge: true });
        });
        await batch.commit();
      }

      toast.success(`${selected} alterado para ${targetName}. A correção será reaplicada nas próximas importações.`);
      setOpen(false);
    } catch (error) {
      console.error("[clinic-professional-manager]", error);
      toast.error("Não foi possível alterar o nome do profissional.");
    } finally {
      setSaving(false);
    }
  };

  if (!currentClinic) return null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={() => startEdit()}>
        <Stethoscope className="h-4 w-4" />
        <span className="hidden md:inline">Profissionais</span>
        <Pencil className="h-3.5 w-3.5 md:hidden" />
      </Button>

      <Dialog open={open} onOpenChange={(value) => !saving && setOpen(value)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar nome do profissional</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Profissional atual</label>
              <select
                value={selected}
                onChange={(event) => { setSelected(event.target.value); setNewName(event.target.value); }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {professionals.map((professional) => <option key={professional} value={professional}>{professional}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome correto</label>
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ex.: Dr. Lucas" />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              A alteração vale para os horários desse profissional e fica memorizada para ser reaplicada quando você importar um novo PDF.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving || !selected || !newName.trim()}>{saving ? "Salvando..." : "Salvar nome"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
