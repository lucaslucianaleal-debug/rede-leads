import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import type { ClinicRecord } from "@/types/auth";
import { CLINICAS } from "@/hooks/useCupons";

export interface CreateClinicInput {
  id?: string;
  name: string;
  address?: string;
  phone?: string;
  color?: string;
  logoUrl?: string;
  module?: "clinica" | "corretor";
  customFields?: Record<string, any>;
}

const normalizeClinicId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function useClinics() {
  const [clinics, setClinics] = useState<ClinicRecord[]>([]);
  const [loading, setLoading] = useState(true); // true until first load completes
  const [error, setError] = useState<string | null>(null);

  const loadClinics = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "clinics"));
      const fromFirestore = snapshot.docs.map((clinicDoc) => ({
        id: clinicDoc.id,
        ...(clinicDoc.data() as Omit<ClinicRecord, "id">),
      }));

      // Garante que todas as clínicas conhecidas aparecem, mesmo sem doc no Firestore
      const firestoreIds = new Set(fromFirestore.map((c) => c.id));
      const fallback: ClinicRecord[] = CLINICAS.filter((c) => !firestoreIds.has(c.id)).map((c) => ({
        id: c.id,
        name: c.label,
        createdAt: "",
        createdBy: "system",
      }));

      const list = [...fromFirestore, ...fallback].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR")
      );
      setClinics(list);
    } catch (err: any) {
      // Se Firestore falhar, usa a lista hardcoded como fallback
      const fallback: ClinicRecord[] = CLINICAS.map((c) => ({
        id: c.id,
        name: c.label,
        createdAt: "",
        createdBy: "system",
      }));
      setClinics(fallback);
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
        module: input.module || "clinica",
        customFields: input.customFields || undefined,
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