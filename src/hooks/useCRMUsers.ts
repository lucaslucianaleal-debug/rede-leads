import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { CRMUser, UserRole } from "@/types/auth";

export function useCRMUsers() {
  const [users, setUsers] = useState<CRMUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all users
  const loadUsers = async () => {
    setLoading(true);
    try {
      const usersRef = collection(db, "crm_users");
      const snapshot = await getDocs(usersRef);
      const usersList = snapshot.docs.map((doc) => doc.data() as CRMUser);
      setUsers(usersList);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  // Create new user
  const createUser = async (
    username: string,
    password: string,
    role: UserRole,
    clinicId?: string | null
  ) => {
    setLoading(true);
    setError(null);
    try {
      // Se o input já é um email (contém @ e ponto), usa direto. Senão, adiciona domínio padrão
      const trimmed = username.trim().toLowerCase();
      const atIndex = trimmed.indexOf("@");
      const email =
        atIndex > 0 && trimmed.indexOf(".", atIndex) > atIndex
          ? trimmed
          : `${trimmed}@redeleads.app`;
      
      // Create Firebase Auth user
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // Create CRM user record
      const crmUser: CRMUser = {
        uid: user.uid,
        username,
        role,
        clinicId: clinicId || null,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || "system",
      };

      // Create user profile in 'users' collection
      const userProfile = {
        uid: user.uid,
        username,
        role,
        clinicId: clinicId || null,
        clinics: clinicId ? [clinicId] : [],
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || "system",
        email,
      };

      const sanitizedCrmUser = JSON.parse(JSON.stringify(crmUser));
      const sanitizedUserProfile = JSON.parse(JSON.stringify(userProfile));
      await Promise.all([
        setDoc(doc(db, "crm_users", user.uid), sanitizedCrmUser),
        setDoc(doc(db, "users", user.uid), sanitizedUserProfile, { merge: true })
      ]);

      setUsers([...users, crmUser]);
      return crmUser;
    } catch (err: any) {
      const errMsg =
        err.code === "auth/email-already-in-use"
          ? `Usuário "${username}" já existe`
          : err.message || "Erro ao criar usuário";
      setError(errMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Update user role
  const updateUserRole = async (uid: string, newRole: UserRole) => {
    setLoading(true);
    setError(null);
    try {
      const rolePayload = JSON.parse(JSON.stringify({ role: newRole }));
      await setDoc(doc(db, "crm_users", uid), rolePayload, { merge: true });
      setUsers(
        users.map((u) => (u.uid === uid ? { ...u, role: newRole } : u))
      );
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar usuário");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Delete user
  const deleteUser = async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      await deleteDoc(doc(db, "crm_users", uid));
      setUsers(users.filter((u) => u.uid !== uid));
    } catch (err: any) {
      setError(err.message || "Erro ao deletar usuário");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Get user role
  const getUserRole = async (uid: string): Promise<UserRole | null> => {
    try {
      const docRef = doc(db, "crm_users", uid);
      const snapshot = await getDoc(docRef);
      return snapshot.exists() ? (snapshot.data().role as UserRole) : null;
    } catch (err) {
      console.error("Erro ao carregar role do usuário:", err);
      return null;
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return {
    users,
    loading,
    error,
    createUser,
    updateUserRole,
    deleteUser,
    getUserRole,
    refetch: loadUsers,
  };
}
