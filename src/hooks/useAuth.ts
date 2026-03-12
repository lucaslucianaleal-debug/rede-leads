import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClinic, setSelectedClinic] = useState<string | null>(null);
  const [currentClinic, setCurrentClinic] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        try {
          const ud = await getDoc(doc(db, "users", currentUser.uid));
          const profile = ud.exists() ? ud.data() : null;
          setUserProfile(profile);
          // If profile defines clinicId and no selectedClinic provided, use it
          if (profile) {
            if (profile.role === "admin") {
              // admin: allow previously selected clinic (if any)
              const c = (prev => prev || selectedClinic || profile.clinicId || null);
              setCurrentClinic((prev) => {
                const val = (prev || selectedClinic || profile.clinicId || null);
                try { (window as any).__REDE_CURRENT_CLINIC__ = val; } catch {};
                return val;
              });
            } else {
              // regular user: enforce their clinic
              const clinicFromProfile = profile.clinicId || (profile.clinics && profile.clinics[0]);
              setCurrentClinic(clinicFromProfile || null);
              try { (window as any).__REDE_CURRENT_CLINIC__ = clinicFromProfile || null; } catch {}
            }
          }
        } catch (e) {
          // ignore
        }
      } else {
        setUserProfile(null);
        setCurrentClinic(null);
      }
    });
    return unsubscribe;
  }, [selectedClinic]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      const ud = await getDoc(doc(db, "users", uid));
      const profile = ud.exists() ? ud.data() : null;
      setUserProfile(profile);
      // Authorization: admin or mapped to selectedClinic
      if (profile) {
        if (profile.role === "admin") {
          const val = selectedClinic || profile.clinicId || null;
          setCurrentClinic(val);
          try { (window as any).__REDE_CURRENT_CLINIC__ = val; } catch {}
        } else {
          const allowed = profile.clinicId === selectedClinic || (Array.isArray(profile.clinics) && profile.clinics.includes(selectedClinic));
          if (!allowed) {
            // unauthorized for this clinic
            await signOut(auth);
            setError("Usuário não autorizado para a clínica selecionada");
            setLoading(false);
            return;
          }
          const val = selectedClinic || profile.clinicId || null;
          setCurrentClinic(val);
          try { (window as any).__REDE_CURRENT_CLINIC__ = val; } catch {}
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

  return { user, loading, error, login, register, logout, selectedClinic, setSelectedClinic, currentClinic, userProfile };
}
