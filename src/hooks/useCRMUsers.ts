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
    role: UserRole
  ) => {
    setLoading(true);
    setError(null);
    try {
      const email = `${username.toLowerCase()}@redeleads.app`;
      
      // Create Firebase Auth user
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // Create CRM user record
      const crmUser: CRMUser = {
        uid: user.uid,
        username,
        role,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || "system",
      };

      await setDoc(doc(db, "crm_users", user.uid), crmUser);
      
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
      await setDoc(
        doc(db, "crm_users", uid),
        { role: newRole },
        { merge: true }
      );
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
