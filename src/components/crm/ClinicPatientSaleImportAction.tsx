import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { OPEN_FINANCE_PATIENT_EVENT } from "@/lib/clinicFinanceEvents";
import { readLocalFinanceStore } from "@/lib/clinicFinanceStore";
import { persistPatientSalePdf } from "@/lib/clinicPatientSaleImport";
import { toast } from "sonner";

export function ClinicPatientSaleImportAction() {
  const { currentClinic } = useAuth();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const id = String((event as CustomEvent<{ patientId?: string }>).detail?.patientId || "");
      if (id) setPatientId(id);
    };
    window.addEventListener(OPEN_FINANCE_PATIENT_EVENT, open as EventListener);
    return () => window.removeEventListener(OPEN_FINANCE_PATIENT_EVENT, open as EventListener);
  }, []);

  const patient = useMemo(() => {
    if (!currentClinic || !patientId) return null;
    return readLocalFinanceStore(currentClinic)?.patients.find((item) => item.id === patientId) || null;
  }, [currentClinic, patientId]);

  async function handleFile(file?: File) {
    if (!file || !currentClinic || !patient) return;
    setImporting(true);
    try {
      const result = await persistPatientSalePdf({
        clinicId: currentClinic,
        patientId: patient.id,
        patientName: patient.name,
        patientDocs: patient.installments.map((item) => item.document),
        file,
      });
      toast.success(`${result.documents} venda(s) vinculada(s) a ${patient.name}. O lastro foi recalculado.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível importar esta venda.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (!patient) return null;
  return (
    <div className="fixed bottom-[30px] right-[285px] z-[135] hidden sm:block">
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} />
      <Button variant="outline" className="gap-2 bg-background shadow-sm" disabled={importing} onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" />{importing ? "Lendo venda..." : "Importar venda deste paciente"}
      </Button>
    </div>
  );
}
