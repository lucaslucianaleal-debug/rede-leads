import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
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
  customServices?: string[];
}

export interface UpdateClinicInput {
  name?: string;
  address?: string;
  phone?: string;
  color?: string;
  logoUrl?: string;
  module?: "clinica" | "corretor";
  customFields?: Record<string, any>;
  customServices?: string[];
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
        ...(input.address?.trim() ? { address: input.address.trim() } : {}),
        ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
        ...(input.color?.trim() ? { color: input.color.trim() } : {}),
        ...(input.logoUrl?.trim() ? { logoUrl: input.logoUrl.trim() } : {}),
        module: input.module || "clinica",
        ...(input.customFields && Object.keys(input.customFields).length > 0
          ? { customFields: input.customFields }
          : {}),
        ...(Array.isArray(input.customServices) && input.customServices.length > 0
          ? { customServices: input.customServices }
          : {}),
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

  const updateClinic = async (clinicId: string, updates: UpdateClinicInput) => {
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, any> = {};
      if (updates.name !== undefined) payload.name = updates.name.trim();
      if (updates.address !== undefined) payload.address = updates.address.trim();
      if (updates.phone !== undefined) payload.phone = updates.phone.trim();
      if (updates.color !== undefined) payload.color = updates.color.trim();
      if (updates.logoUrl !== undefined) payload.logoUrl = updates.logoUrl.trim();
      if (updates.module !== undefined) payload.module = updates.module;
      if (updates.customFields !== undefined) payload.customFields = updates.customFields;
      if (updates.customServices !== undefined) payload.customServices = updates.customServices;

      // updateDoc faz merge parcial: só altera os campos enviados, preserva o resto do documento.
      await updateDoc(doc(db, "clinics", clinicId), payload);

      setClinics((current) =>
        current
          .map((item) => (item.id === clinicId ? { ...item, ...payload } : item))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      );
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar clínica");
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
    updateClinic,
    refetch: loadClinics,
  };
}