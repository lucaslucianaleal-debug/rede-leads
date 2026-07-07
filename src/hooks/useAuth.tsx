import React, { useState, useEffect, createContext, useContext } from "react";
import { auth, db } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string, clinic?: string | null) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectedClinic: string | null;
  setSelectedClinic: (c: string | null) => void;
  currentClinic: string | null;
  userProfile: any | null;
  clinicMeta?: {
    id: string;
    name?: string;
    logoUrl?: string;
    color?: string;
    address?: string;
  } | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClinicState, setSelectedClinicState] = useState<string | null>(() => {
    try { return localStorage.getItem('crm_selected_clinic') || null; } catch { return null; }
  });
  const [currentClinic, setCurrentClinic] = useState<string | null>(() => {
    try { return localStorage.getItem('crm_current_clinic') || null; } catch { return null; }
  });
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [clinicMeta, setClinicMeta] = useState<any | null>(null);

  // Helper: set currentClinic e persiste no localStorage para evitar modo demo no reload
  const persistClinic = (val: string | null) => {
    try {
      if (val) localStorage.setItem('crm_current_clinic', val);
      else localStorage.removeItem('crm_current_clinic');
    } catch {}
    setCurrentClinic(val);
  };

  const setSelectedClinic = (val: string | null) => {
    try {
      if (val) localStorage.setItem('crm_selected_clinic', val);
      else localStorage.removeItem('crm_selected_clinic');
    } catch {}
    setSelectedClinicState(val);
  };

  useEffect(() => {
    try { console.log('[AuthProvider] selectedClinic ->', selectedClinicState); } catch {}
  }, [selectedClinicState]);

  useEffect(() => {
    try { console.log('[AuthProvider] currentClinic ->', currentClinic); } catch {}
  }, [currentClinic]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser as User | null);
      setLoading(false);
      if (currentUser) {
        try {
          const ud = await getDoc(doc(db, "users", currentUser.uid));
          const profile = ud.exists() ? ud.data() : null;
          setUserProfile(profile);
          if (profile) {
            const profileClinics = Array.isArray(profile.clinicIds)
              ? profile.clinicIds.filter(Boolean)
              : Array.isArray(profile.clinics)
                ? profile.clinics.filter(Boolean)
                : [];
            const singleClinic = profile.clinicId || (profileClinics.length === 1 ? profileClinics[0] : null);
            if (profile.role === "admin" || profile.role === "cliente") {
              const val = selectedClinicState || currentClinic || singleClinic || null;
              persistClinic(val);
              console.log(`[AuthProvider] ${profile.role} currentClinic set ->`, val, "selectedClinic:", selectedClinicState);
            } else {
              const clinicFromProfile = singleClinic;
              persistClinic(clinicFromProfile);
              console.log("[AuthProvider] user currentClinic ->", clinicFromProfile);
            }
          }
        } catch (e) {
          // ignore
        }
      } else {
        setUserProfile(null);
        persistClinic(null);
        setClinicMeta(null);
      }
    });
    return unsubscribe;
  }, [selectedClinicState, currentClinic]);

  // Load clinic metadata when currentClinic changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!currentClinic) {
        setClinicMeta(null);
        return;
      }
      try {
        const cd = await getDoc(doc(db, "clinics", currentClinic));
        if (!cancelled) {
          setClinicMeta(cd.exists() ? { id: cd.id, ...(cd.data() as any) } : null);
        }
      } catch (e) {
        if (!cancelled) setClinicMeta(null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [currentClinic]);

  const login = async (email: string, password: string, clinic?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      const ud = await getDoc(doc(db, "users", uid));
      const profile = ud.exists() ? ud.data() : null;
      setUserProfile(profile);
      const profileClinics = profile && Array.isArray(profile.clinicIds)
        ? profile.clinicIds.filter(Boolean)
        : profile && Array.isArray(profile.clinics)
          ? profile.clinics.filter(Boolean)
          : [];
      const singleClinic = profile ? (profile.clinicId || (profileClinics.length === 1 ? profileClinics[0] : null)) : null;
      if (profile) {
        if (profile.role === "admin" || profile.role === "cliente") {
          const val = clinic ?? selectedClinicState ?? currentClinic ?? singleClinic ?? null;
          persistClinic(val);
          console.log(`[AuthProvider][login] ${profile.role} set currentClinic ->`, val);
        } else {
          // Outros roles têm restrição à clínica atribuída
          const effective = clinic ?? selectedClinicState ?? currentClinic ?? singleClinic ?? null;
          const allowed = profile.clinicId === effective || (Array.isArray(profile.clinicIds) && profile.clinicIds.includes(effective)) || (Array.isArray(profile.clinics) && profile.clinics.includes(effective));
          if (effective && allowed) {
            setSelectedClinic(effective);
          }
          persistClinic(effective);
          console.log("[AuthProvider][login] user set currentClinic ->", effective, { allowed });
        }
      }
    } catch (err: any) {
      setError(err.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err.message || "Erro ao registrar");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    setError(null);
    try {
      await signOut(auth);
    } catch (err: any) {
      setError(err.message || "Erro ao fazer logout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, register, logout, selectedClinic: selectedClinicState, setSelectedClinic, currentClinic, userProfile, clinicMeta }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
