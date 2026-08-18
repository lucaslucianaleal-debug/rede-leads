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
import { attachLastWriter } from '../lib/crmGuard';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { CRMUser, UserRole } from "@/types/auth";
import { filterVisibleUsersForProfile } from "@/lib/userAccess";

export function useCRMUsers() {
  const [users, setUsers] = useState<CRMUser[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<CRMUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all users
  const loadUsers = async () => {
    setLoading(true);
    try {
      const usersRef = collection(db, "crm_users");
      const snapshot = await getDocs(usersRef);
      const usersList = snapshot.docs.map((doc) => doc.data() as CRMUser);

      const currentUserProfileDoc = auth.currentUser
        ? (() => {
            const profileDoc = usersList.find((user) => user.uid === auth.currentUser?.uid);
            return profileDoc ?? null;
          })()
        : null;

      setCurrentUserProfile(currentUserProfileDoc);
      const visibleUsers = filterVisibleUsersForProfile(currentUserProfileDoc, usersList);
      setUsers(visibleUsers);
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
    clinicId?: string | null,
    accountModule?: "clinica" | "corretor",
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

      const shouldKeepClinicLink = Boolean(clinicId && clinicId.trim());

      // Create CRM user record
      const crmUser: CRMUser = {
        uid: user.uid,
        username,
        role,
        clinicId: shouldKeepClinicLink ? clinicId : null,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || "system",
      };

      // Create user profile in 'users' collection
      const userProfile = {
        uid: user.uid,
        username,
        role,
        clinicId: shouldKeepClinicLink ? clinicId : null,
        ...(accountModule ? { accountModule } : {}),
        clinics: shouldKeepClinicLink && clinicId ? [clinicId] : [],
        clinicIds: shouldKeepClinicLink && clinicId ? [clinicId] : [],
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || "system",
        email,
      };

      const sanitizedCrmUser = JSON.parse(JSON.stringify(crmUser));
      const sanitizedUserProfile = JSON.parse(JSON.stringify(userProfile));
      await Promise.all([
        setDoc(doc(db, "crm_users", user.uid), attachLastWriter(sanitizedCrmUser, auth.currentUser?.uid ?? null)),
        setDoc(doc(db, "users", user.uid), attachLastWriter(sanitizedUserProfile, auth.currentUser?.uid ?? null), { merge: true })
      ]);

      setUsers([...users, crmUser]);
      return crmUser;
    } catch (err: any) {
      const errMsg =
        err.code === "auth/email-already-in-use"
          ? `Usuário "${username}" já existe`
          : err.message || "Erro ao criar usuário";
      setError(errMsg);
      throw new Error(errMsg);
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
      await setDoc(doc(db, "crm_users", uid), attachLastWriter(rolePayload, auth.currentUser?.uid ?? null), { merge: true });
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
  // Apaga em todos os lugares que o app controla no Firestore: crm_users (permissões)
  // e users (perfil/vínculo de clínica usado no login). A conta de login em si
  // (Firebase Authentication) não pode ser apagada pelo SDK do cliente por segurança —
  // isso só é possível pelo Firebase Console (Authentication > usuário > Excluir) ou
  // por uma função de backend com Admin SDK.
  const deleteUser = async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        deleteDoc(doc(db, "crm_users", uid)),
        deleteDoc(doc(db, "users", uid)).catch(() => {}),
      ]);
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
    currentUserProfile,
    loading,
    error,
    createUser,
    updateUserRole,
    deleteUser,
    getUserRole,
    refetch: loadUsers,
  };
}
