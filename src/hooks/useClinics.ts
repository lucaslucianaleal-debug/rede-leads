import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import type { ClinicRecord } from "@/types/auth";

export interface CreateClinicInput {
  id?: string;
  name: string;
  address?: string;
  phone?: string;
  color?: string;
  logoUrl?: string;
}

const normalizeClinicId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function useClinics() {
  const [clinics, setClinics] = useState<ClinicRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClinics = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "clinics"));
      const list = snapshot.docs
        .map((clinicDoc) => ({ id: clinicDoc.id, ...(clinicDoc.data() as Omit<ClinicRecord, "id">) }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setClinics(list);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar clínicas");
    } finally {
      setLoading(false);
    }
  };

  const createClinic = async (input: CreateClinicInput) => {
    setLoading(true);
    setError(null);
    try {
      const clinicId = normalizeClinicId(input.id || input.name);
      if (!clinicId) {
        throw new Error("Informe um nome ou ID válido para a clínica");
      }

      const clinic: ClinicRecord = {
        id: clinicId,
        name: input.name.trim(),
        address: input.address?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        color: input.color?.trim() || undefined,
        logoUrl: input.logoUrl?.trim() || undefined,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || "system",
      };

      await setDoc(doc(db, "clinics", clinicId), clinic);
      setClinics((current) => {
        const next = current.filter((item) => item.id !== clinicId).concat(clinic);
        return next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      });
      return clinic;
    } catch (err: any) {
      setError(err.message || "Erro ao criar clínica");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClinics();
  }, []);

  return {
    clinics,
    loading,
    error,
    createClinic,
    refetch: loadClinics,
  };
}