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
  const [selectedClinic, setSelectedClinic] = useState<string | null>(null);
  const [currentClinic, setCurrentClinic] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [clinicMeta, setClinicMeta] = useState<any | null>(null);

  useEffect(() => {
    try { console.log('[AuthProvider] selectedClinic ->', selectedClinic); } catch {}
  }, [selectedClinic]);

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
            if (profile.role === "admin") {
              const val = selectedClinic || profile.clinicId || null;
              setCurrentClinic(val);
              console.log("[AuthProvider] admin currentClinic set ->", val, "selectedClinic:", selectedClinic);
            } else {
              const clinicFromProfile = profile.clinicId || (profile.clinics && profile.clinics[0]);
              setCurrentClinic(clinicFromProfile || null);
              console.log("[AuthProvider] user currentClinic ->", clinicFromProfile);
            }
          }
        } catch (e) {
          // ignore
        }
      } else {
        setUserProfile(null);
        setCurrentClinic(null);
        setClinicMeta(null);
      }
    });
    return unsubscribe;
  }, [selectedClinic]);

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
      // Se não houver selectedClinic, usa clinicId do perfil
      if (!selectedClinic && profile && profile.clinicId) {
        setSelectedClinic(profile.clinicId);
      }
      if (profile) {
        if (profile.role === "admin") {
          const val = clinic ?? selectedClinic ?? profile.clinicId ?? null;
          setCurrentClinic(val);
          console.log("[AuthProvider][login] admin set currentClinic ->", val);
        } else {
          const effective = clinic ?? selectedClinic ?? profile.clinicId ?? null;
          const allowed = profile.clinicId === effective || (Array.isArray(profile.clinics) && profile.clinics.includes(effective));
          if (!allowed) {
            await signOut(auth);
            setError("Usuário não autorizado para a clínica selecionada");
            setLoading(false);
            return;
          }
          const val = effective ?? null;
          setCurrentClinic(val);
          console.log("[AuthProvider][login] user set currentClinic ->", val);
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
      value={{ user, loading, error, login, register, logout, selectedClinic, setSelectedClinic, currentClinic, userProfile, clinicMeta }}
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
