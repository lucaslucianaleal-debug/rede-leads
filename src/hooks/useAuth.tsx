import React, { useState, useEffect, createContext, useContext, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { normalizeUserClinicBindings } from "@/lib/userAccess";

const normalizeProfileClinics = (profile: any) => normalizeUserClinicBindings(profile);

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
  const lastUidRef = useRef<string | null>(null);
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
    // Reflete imediatamente no contexto atual
    persistClinic(val);
  };

  useEffect(() => {
    try { console.log('[AuthProvider] selectedClinic ->', selectedClinicState); } catch {}
  }, [selectedClinicState]);

  useEffect(() => {
    try { console.log('[AuthProvider] currentClinic ->', currentClinic); } catch {}
  }, [currentClinic]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser && lastUidRef.current && lastUidRef.current !== currentUser.uid) {
        // Usuário mudou: limpa seleção anterior para não herdar clínica de outro login
        setSelectedClinic(null);
        persistClinic(null);
        localStorage.removeItem('crm_selected_clinic');
        localStorage.removeItem('crm_current_clinic');
      }
      lastUidRef.current = currentUser?.uid || null;

      setUser(currentUser as User | null);
      if (currentUser) {
        try {
          const ud = await getDoc(doc(db, "users", currentUser.uid));
          const profile = ud.exists() ? ud.data() : null;

          if (!profile) {
            // Conta de login existe (Firebase Authentication) mas o perfil foi
            // apagado (ex.: excluído direto no Firestore/Console). Em vez de deixar
            // o app "meio logado" usando dados velhos do localStorage, desloga e
            // limpa tudo — assim não sobra usuário/clínica fantasma.
            console.log("[AuthProvider] conta sem perfil (provavelmente excluída) — deslogando");
            try { localStorage.removeItem('crm_selected_clinic'); } catch {}
            try { localStorage.removeItem('crm_current_clinic'); } catch {}
            setUserProfile(null);
            setSelectedClinic(null);
            persistClinic(null);
            setClinicMeta(null);
            setUser(null);
            lastUidRef.current = null;
            setError("Esta conta não existe mais ou foi removida. Faça login novamente.");
            await signOut(auth);
            setLoading(false);
            return;
          }

          setUserProfile(profile);
          const normalized = normalizeProfileClinics(profile);
          const hasMultipleAccess = normalized.hasWildcard || normalized.explicit.length > 1;
          const singleClinic = hasMultipleAccess ? null : (normalized.explicit[0] || null);

          if (normalized.explicit.length === 0) {
            persistClinic(null);
            console.log("[AuthProvider] fresh profile: no clinic bindings found, isolating selection");
            setLoading(false);
            return;
          }

          if (profile.role === "admin" || profile.role === "cliente") {
            const val = singleClinic || null;
            persistClinic(val);
            console.log(`[AuthProvider] ${profile.role} currentClinic set ->`, val);
          } else {
            const clinicFromProfile = singleClinic;
            persistClinic(clinicFromProfile);
            console.log("[AuthProvider] user currentClinic ->", clinicFromProfile);
          }
        } catch (e) {
          // ignore
        }
      } else {
        setUserProfile(null);
        setSelectedClinic(null);
        persistClinic(null);
        setClinicMeta(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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

      if (!profile) {
        // Login de Authentication funcionou, mas não existe mais perfil no Firestore
        // (conta apagada). Não deixa "entrar" com dados velhos — desloga na hora.
        try { localStorage.removeItem('crm_selected_clinic'); } catch {}
        try { localStorage.removeItem('crm_current_clinic'); } catch {}
        setUserProfile(null);
        persistClinic(null);
        await signOut(auth);
        setError("Esta conta não existe mais ou foi removida. Fale com o administrador.");
        return;
      }

      setUserProfile(profile);
      const normalized = normalizeProfileClinics(profile);
      const hasMultipleAccess = normalized.hasWildcard || normalized.explicit.length > 1;
      const singleClinic = hasMultipleAccess ? null : (normalized.explicit[0] || null);

      if (normalized.explicit.length === 0) {
        persistClinic(null);
        localStorage.removeItem('crm_current_clinic');
        localStorage.removeItem('crm_selected_clinic');
        console.log("[AuthProvider][login] fresh user/corretor profile isolated from old clinic access");
      } else if (profile.role === "admin" || profile.role === "cliente") {
        const val = clinic ?? singleClinic ?? null;
        persistClinic(val);
        console.log(`[AuthProvider][login] ${profile.role} set currentClinic ->`, val);
      } else {
        const effective = clinic ?? singleClinic ?? null;
        const allowed = profile.clinicId === effective || (Array.isArray(profile.clinicIds) && profile.clinicIds.includes(effective)) || (Array.isArray(profile.clinics) && profile.clinics.includes(effective));
        if (effective && allowed) {
          setSelectedClinic(effective);
        }
        persistClinic(effective);
        console.log("[AuthProvider][login] user set currentClinic ->", effective, { allowed });
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
